"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

type Team = { id: string; name: string; slug: string };

type ActivityRow = {
  id: string;
  eventType: string;
  resourceTitle: string | null;
  createdAt: string;
  user: { name: string | null; email: string | null };
};

type InviteModalStep = "choice" | "email";

export function TeamWorkspaceClient({ team }: { team: Team }) {
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteModalStep, setInviteModalStep] = useState<InviteModalStep>("choice");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "editor" | "viewer">("editor");
  const [msg, setMsg] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/teams/${team.id}/activity?limit=30`);
      const json = await res.json();
      if (json.success) setActivity(json.data.items ?? []);
    })();
  }, [team.id]);

  const openInviteModal = () => {
    setMsg(null);
    setModalError(null);
    setInviteModalStep("choice");
    setInviteModalOpen(true);
  };

  const closeInviteModal = (open: boolean) => {
    setInviteModalOpen(open);
    if (!open) {
      setInviteModalStep("choice");
      setEmail("");
      setModalError(null);
    }
  };

  const sendInvite = async () => {
    setMsg(null);
    const trimmed = email.trim();
    if (!trimmed) {
      setMsg("Enter your colleague's email address before sending an invite.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setMsg("That doesn't look like a valid email address.");
      return;
    }
    setInviteBusy(true);
    try {
      const res = await fetch(`/api/teams/${team.id}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, role }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json?.error?.message ?? "Failed");
      setMsg(`Invite created. Share: ${json.data.inviteUrl}`);
      setEmail("");
      closeInviteModal(false);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setMsg(err?.message ?? "Failed");
    } finally {
      setInviteBusy(false);
    }
  };

  const createLink = async () => {
    setMsg(null);
    setModalError(null);
    setInviteBusy(true);
    try {
      const res = await fetch(`/api/teams/${team.id}/invite-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, expiresInDays: 14 }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json?.error?.message ?? "Failed");
      setMsg(`Share link: ${json.data.inviteUrl}`);
      closeInviteModal(false);
    } catch (e: unknown) {
      const err = e as { message?: string };
      const m = err?.message ?? "Failed";
      setModalError(m);
      setMsg(m);
    } finally {
      setInviteBusy(false);
    }
  };

  const roleLabel =
    role === "admin" ? "Admin" : role === "editor" ? "Editor" : "Viewer";

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-4">
      <Link href="/teams" className="text-sm text-[hsl(var(--accent))]">
        ← Teams
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">{team.name}</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">/{team.slug}</p>
      </div>

      <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Invitations</h2>
          <Button type="button" variant="outline" size="sm" onClick={() => setInviteOpen(!inviteOpen)}>
            {inviteOpen ? "Close" : "Invite people"}
          </Button>
        </div>
        {inviteOpen ? (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Choose a role, then click <span className="font-medium text-[hsl(var(--foreground))]">Invite</span> to
              send an email or create a share link.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor="team-invite-role">
                Role for new members
              </label>
              <select
                id="team-invite-role"
                className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm"
                value={role}
                onChange={(e) => setRole(e.target.value as typeof role)}
              >
                <option value="admin">Admin</option>
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
              <Button type="button" size="sm" className="text-white hover:text-white" onClick={openInviteModal}>
                Invite
              </Button>
            </div>
            {msg ? <p className="text-xs text-[hsl(var(--muted-foreground))] break-all">{msg}</p> : null}
          </div>
        ) : null}
      </div>

      <Dialog open={inviteModalOpen} onOpenChange={closeInviteModal}>
        <DialogContent className="max-w-md">
          <DialogTitle>
            {inviteModalStep === "email" ? "Share via email" : "Invite team members"}
          </DialogTitle>
          {inviteModalStep === "choice" ? (
            <div className="space-y-4 pt-1">
              <DialogDescription>
                New members will join as{" "}
                <span className="font-medium text-[hsl(var(--foreground))]">{roleLabel}</span>. How would you like to
                invite them?
              </DialogDescription>
              {modalError ? (
                <p className="text-xs text-red-400 break-all" role="alert">
                  {modalError}
                </p>
              ) : null}
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1"
                  disabled={inviteBusy}
                  onClick={() => {
                    setModalError(null);
                    setMsg(null);
                    setInviteModalStep("email");
                  }}
                >
                  Share via email
                </Button>
                <Button
                  type="button"
                  className="flex-1 text-white hover:text-white"
                  disabled={inviteBusy}
                  onClick={() => void createLink()}
                >
                  Create share link
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 pt-1">
              <DialogDescription>
                We&apos;ll send an invitation for role{" "}
                <span className="font-medium text-[hsl(var(--foreground))]">{roleLabel}</span>.
              </DialogDescription>
              <div>
                <label htmlFor="invite-email" className="text-xs font-medium text-[hsl(var(--muted-foreground))]">
                  Email address
                </label>
                <input
                  id="invite-email"
                  className="mt-1 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm"
                  placeholder="colleague@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  disabled={inviteBusy}
                />
              </div>
              {msg && inviteModalOpen ? (
                <p className="text-xs text-red-400 break-all" role="alert">
                  {msg}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={inviteBusy}
                  onClick={() => {
                    setMsg(null);
                    setModalError(null);
                    setInviteModalStep("choice");
                  }}
                >
                  Back
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="text-white hover:text-white"
                  disabled={inviteBusy}
                  onClick={() => void sendInvite()}
                >
                  {inviteBusy ? "Sending…" : "Send invite"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <div>
        <h2 className="mb-2 font-semibold">Activity</h2>
        <div className="rounded-xl border border-[hsl(var(--border))] divide-y divide-[hsl(var(--border))]">
          {activity.length === 0 ? (
            <div className="p-4 text-sm text-[hsl(var(--muted-foreground))]">No activity yet.</div>
          ) : (
            activity.map((a) => (
              <div key={a.id} className="px-3 py-2 text-sm">
                <span className="font-mono text-xs text-[hsl(var(--accent))]">{a.eventType}</span>
                <span className="text-[hsl(var(--muted-foreground))]">
                  {" "}
                  · {a.user.name ?? a.user.email ?? "User"} · {new Date(a.createdAt).toLocaleString()}
                </span>
                {a.resourceTitle ? (
                  <div className="text-xs text-[hsl(var(--muted-foreground))]">{a.resourceTitle}</div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
