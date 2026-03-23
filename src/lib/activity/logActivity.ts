import { prisma } from "@/lib/db/prisma";

export async function logTeamActivity(args: {
  teamId: string;
  userId: string;
  eventType: string;
  resourceId?: string | null;
  resourceTitle?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    await prisma.activityLog.create({
      data: {
        teamId: args.teamId,
        userId: args.userId,
        eventType: args.eventType,
        resourceId: args.resourceId ?? null,
        resourceTitle: args.resourceTitle ?? null,
        metadata: (args.metadata ?? {}) as object,
      },
    });
  } catch (e) {
    console.error("[activityLog]", e);
  }
}
