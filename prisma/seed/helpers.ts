import { PrismaClient, Template, DesignPattern } from "@prisma/client";
import { v5 as uuidv5 } from "uuid";

const NAMESPACE = "123e4567-e89b-12d3-a456-426614174000";

export const prisma = new PrismaClient();

export type SeedTemplateInput = Omit<
  Template,
  "id" | "createdAt" | "updatedAt" | "usageCount" | "avgApprovalRate"
> & {
  id?: string;
  avgApprovalRate?: number;
};

export type SeedPatternInput = Omit<DesignPattern, "id" | "createdAt"> & {
  id?: string;
};

export function stableId(name: string, suffix?: string) {
  return uuidv5(suffix ? `${name}:${suffix}` : name, NAMESPACE);
}

export async function upsertTemplate(data: SeedTemplateInput) {
  const id = data.id ?? stableId(data.name);
  const tags = (data.tags ?? []).map((t) => t.toLowerCase());

  await prisma.template.upsert({
    where: { id },
    update: {
      ...data,
      id,
      tags,
      avgApprovalRate: data.avgApprovalRate ?? 0.5,
    },
    create: {
      ...data,
      id,
      tags,
      avgApprovalRate: data.avgApprovalRate ?? 0.5,
    },
  });
}

export async function upsertPattern(data: SeedPatternInput) {
  const id = data.id ?? stableId(data.name);
  const { sectionOrder, styleGuidelines, ...rest } = data as any;
  await prisma.designPattern.upsert({
    where: { id },
    update: { ...rest, id, sectionOrder: sectionOrder ?? undefined, styleGuidelines: styleGuidelines ?? undefined },
    create: { ...rest, id, sectionOrder: sectionOrder ?? undefined, styleGuidelines: styleGuidelines ?? undefined },
  });
}

