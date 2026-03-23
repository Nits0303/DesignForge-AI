import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client/index";
import { invalidatePluginDesignsCacheForUser } from "@/lib/plugin/pluginDesignsCache";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  /** Dev: mtime of generated client — bust stale singleton after `npx prisma generate` */
  __prismaEngineFingerprint?: string;
};

/** Changes when `npx prisma generate` updates the engine (avoids stale client in `next dev`). */
function getPrismaEngineFingerprint(): string {
  try {
    const clientIndex = path.join(process.cwd(), "node_modules", ".prisma", "client", "index.js");
    const st = fs.statSync(clientIndex);
    return `${st.mtimeMs}:${st.size}`;
  } catch {
    return "0";
  }
}

function createPrisma(): PrismaClient {
  const base = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

  return base.$extends({
    query: {
      design: {
        async create({ args, query }) {
          const result = await query(args);
          if (result && typeof result === "object" && "userId" in result) {
            void invalidatePluginDesignsCacheForUser((result as { userId: string }).userId);
          }
          return result;
        },
        async update({ args, query }) {
          const result = await query(args);
          let uid: string | undefined =
            result && typeof result === "object" && "userId" in result
              ? (result as { userId: string }).userId
              : undefined;
          if (!uid && args.where) {
            const row = await base.design.findUnique({ where: args.where, select: { userId: true } });
            uid = row?.userId ?? undefined;
          }
          if (uid) void invalidatePluginDesignsCacheForUser(uid);
          return result;
        },
        async upsert({ args, query }) {
          const result = await query(args);
          if (result && typeof result === "object" && "userId" in result) {
            void invalidatePluginDesignsCacheForUser((result as { userId: string }).userId);
          }
          return result;
        },
        async delete({ args, query }) {
          const existing = await base.design.findUnique({ where: args.where, select: { userId: true } });
          const result = await query(args);
          if (existing?.userId) void invalidatePluginDesignsCacheForUser(existing.userId);
          return result;
        },
        async updateMany({ args, query }) {
          const emptyWhere =
            !args.where ||
            (typeof args.where === "object" && Object.keys(args.where as object).length === 0);
          const rows = emptyWhere
            ? []
            : await base.design.findMany({ where: args.where, select: { userId: true } });
          const result = await query(args);
          if (!emptyWhere) {
            const uids = new Set(rows.map((r) => r.userId));
            for (const uid of uids) void invalidatePluginDesignsCacheForUser(uid);
          }
          return result;
        },
        async deleteMany({ args, query }) {
          const emptyWhere =
            !args.where ||
            (typeof args.where === "object" && Object.keys(args.where as object).length === 0);
          const rows = emptyWhere
            ? []
            : await base.design.findMany({ where: args.where, select: { userId: true } });
          const result = await query(args);
          if (!emptyWhere) {
            const uids = new Set(rows.map((r) => r.userId));
            for (const uid of uids) void invalidatePluginDesignsCacheForUser(uid);
          }
          return result;
        },
      },
    },
  }) as unknown as PrismaClient;
}

function getPrismaSingleton(): PrismaClient {
  if (process.env.NODE_ENV === "production") {
    if (!globalForPrisma.prisma) {
      globalForPrisma.prisma = createPrisma();
    }
    return globalForPrisma.prisma;
  }

  const fp = getPrismaEngineFingerprint();
  if (globalForPrisma.prisma && globalForPrisma.__prismaEngineFingerprint !== fp) {
    void globalForPrisma.prisma.$disconnect();
    globalForPrisma.prisma = undefined;
  }
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrisma();
    globalForPrisma.__prismaEngineFingerprint = fp;
  }
  return globalForPrisma.prisma;
}

/**
 * Lazy singleton: in development, recreates the client when generated files change
 * (fixes `Unknown argument submissionStatus` until server used to be restarted manually).
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getPrismaSingleton();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
