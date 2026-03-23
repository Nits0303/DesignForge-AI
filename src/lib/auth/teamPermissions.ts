import { prisma } from "@/lib/db/prisma";
import { redis } from "@/lib/redis/client";
import { teamRoleHasPermission, type TeamPermission, type TeamRole } from "@/constants/teamPermissions";

const CACHE_TTL_SEC = 300;
const cacheKey = (teamId: string, userId: string) => `team:member:role:${teamId}:${userId}`;

export type TeamPermissionResult =
  | { allowed: true; role: TeamRole }
  | { allowed: false; role?: TeamRole; reason: string };

export async function requireTeamPermission(
  teamId: string,
  userId: string,
  permission: TeamPermission | string
): Promise<TeamPermissionResult> {
  const ck = cacheKey(teamId, userId);
  let role: TeamRole | null = null;

  const cached = await redis.get(ck);
  if (cached) {
    role = cached as TeamRole;
  } else {
    const m = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId } },
    });
    if (!m) {
      return { allowed: false, reason: "Not a member of this team." };
    }
    role = m.role as TeamRole;
    await redis.set(ck, role, "EX", CACHE_TTL_SEC);
  }

  if (!teamRoleHasPermission(role, permission)) {
    return { allowed: false, role, reason: `Missing permission: ${permission}` };
  }

  return { allowed: true, role };
}

export async function invalidateTeamMemberRoleCache(teamId: string, userId: string) {
  await redis.del(cacheKey(teamId, userId));
}
