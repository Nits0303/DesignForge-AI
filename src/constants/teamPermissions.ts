/**
 * Sprint 18 — team RBAC permission strings and role matrix.
 */

export const TEAM_PERMISSIONS = [
  "designs:generate",
  "designs:revise",
  "designs:approve",
  "designs:export",
  "designs:view_all",
  "brands:manage",
  "brands:use",
  "projects:manage",
  "projects:use",
  "templates:manage_team",
  "members:invite",
  "members:remove",
  "team:delete",
  "team:transfer",
  "team:settings",
  "analytics:view",
] as const;

export type TeamPermission = (typeof TEAM_PERMISSIONS)[number];

const ALL = new Set<string>(TEAM_PERMISSIONS);

const OWNER = ALL;

const ADMIN = new Set<string>([
  ...TEAM_PERMISSIONS.filter((p) => p !== "team:delete" && p !== "team:transfer"),
]);

const EDITOR = new Set<string>([
  "designs:generate",
  "designs:revise",
  "designs:export",
  "brands:use",
  "projects:use",
  "projects:manage",
]);

const VIEWER = new Set<string>(["designs:view_all", "brands:use", "analytics:view"]);

export type TeamRole = "owner" | "admin" | "editor" | "viewer";

const BY_ROLE: Record<TeamRole, Set<string>> = {
  owner: OWNER,
  admin: ADMIN,
  editor: EDITOR,
  viewer: VIEWER,
};

export function teamRoleHasPermission(role: TeamRole, permission: TeamPermission | string): boolean {
  return BY_ROLE[role]?.has(permission) ?? false;
}
