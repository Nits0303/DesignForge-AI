"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PreferencesSection from "./PreferencesSection";
import { PROFILE_UPDATED_EVENT } from "@/lib/profile-events";

type SettingsSectionKey = "profile" | "security" | "preferences" | "notifications" | "danger";

function PasswordStrength({ value }: { value: string }) {
  const score = useMemo(() => {
    let s = 0;
    if (value.length >= 8) s++;
    if (/[A-Z]/.test(value)) s++;
    if (/[0-9]/.test(value)) s++;
    if (/[^A-Za-z0-9]/.test(value)) s++;
    return Math.min(4, s);
  }, [value]);

  const label =
    score <= 1 ? "Weak" : score === 2 ? "Fair" : score === 3 ? "Good" : "Strong";

  return (
    <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
      Strength: <span className="font-semibold text-[hsl(var(--foreground))]">{label}</span>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        "relative inline-flex h-6 w-11 items-center rounded-full border transition-colors",
        checked
          ? "border-[hsl(var(--accent))] bg-[hsl(var(--accent))]"
          : "border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))]",
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
      ].join(" ")}
    >
      <span
        className={[
          "inline-block h-5 w-5 transform rounded-full bg-white transition-transform",
          checked ? "translate-x-[18px]" : "translate-x-[2px]",
        ].join(" ")}
      />
      <span className="sr-only">{label}</span>
    </button>
  );
}

export default function SettingsPageClient({
  user,
  totalDesigns,
  totalRevisions,
}: {
  user: {
    id: string;
    email: string;
    name: string | null;
    avatarUrl: string | null;
    authProvider: "email" | "google";
    googleId: string | null;
    hasEmailPassword: boolean;
  };
  totalDesigns: number;
  totalRevisions: number;
}) {
  const router = useRouter();
  const [section, setSection] = useState<SettingsSectionKey>("profile");

  // Profile state
  const [draftName, setDraftName] = useState(user.name ?? "");
  const [draftAvatarUrl, setDraftAvatarUrl] = useState<string | null>(user.avatarUrl);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Security state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Notifications state
  const [weeklyEmailEnabled, setWeeklyEmailEnabled] = useState<boolean>(false);
  const [batchCompleteNotifsEnabled, setBatchCompleteNotifsEnabled] = useState<boolean>(true);
  const [notifyTemplateInstalled, setNotifyTemplateInstalled] = useState<boolean>(true);
  const [notifyTemplateRated, setNotifyTemplateRated] = useState<boolean>(true);
  const [loadingNotifs, setLoadingNotifs] = useState(true);

  // Danger Zone state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteStep, setDeleteStep] = useState<1 | 2 | 3>(1);
  const [deleteEmailInput, setDeleteEmailInput] = useState("");
  const [deleteRunning, setDeleteRunning] = useState(false);
  const [deleteBannerActive, setDeleteBannerActive] = useState(false);

  const avatarFileInputRef = useRef<HTMLInputElement>(null);

  const emailIsValid = deleteEmailInput.trim().toLowerCase() === user.email.trim().toLowerCase();

  const loadNotificationPrefs = async () => {
    setLoadingNotifs(true);
    try {
      const [weeklyRes, batchRes, instRes, ratedRes] = await Promise.all([
        fetch(`/api/preferences?key=weekly_email_enabled`),
        fetch(`/api/preferences?key=notify_batch_complete`),
        fetch(`/api/preferences?key=notify_template_installed`),
        fetch(`/api/preferences?key=notify_template_rated`),
      ]);
      const [weeklyJson, batchJson, instJson, ratedJson] = await Promise.all([
        weeklyRes.json(),
        batchRes.json(),
        instRes.json(),
        ratedRes.json(),
      ]);
      const weeklyPrefValue = weeklyJson?.success ? weeklyJson.data?.preferenceValue : null;
      const batchPrefValue = batchJson?.success ? batchJson.data?.preferenceValue : null;
      const instVal = instJson?.success ? instJson.data?.preferenceValue : null;
      const ratedVal = ratedJson?.success ? ratedJson.data?.preferenceValue : null;

      setWeeklyEmailEnabled(weeklyPrefValue === true);
      setBatchCompleteNotifsEnabled(batchPrefValue === false ? false : true);
      setNotifyTemplateInstalled(instVal === false ? false : true);
      setNotifyTemplateRated(ratedVal === false ? false : true);
    } catch {
      setWeeklyEmailEnabled(false);
      setBatchCompleteNotifsEnabled(true);
      setNotifyTemplateInstalled(true);
      setNotifyTemplateRated(true);
    } finally {
      setLoadingNotifs(false);
    }
  };

  useEffect(() => {
    void loadNotificationPrefs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/preferences?key=account_deletion_permanent_at");
        const json = await res.json();
        if (json?.success && json?.data?.preferenceValue) {
          setDeleteBannerActive(true);
        }
      } catch {
        // noop
      }
    })();
  }, []);

  const saveProfile = async () => {
    try {
      setSavingProfile(true);
      const res = await fetch("/api/auth/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draftName.trim() ? draftName.trim() : undefined,
          avatarUrl: draftAvatarUrl ?? undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error?.message ?? "Save failed");
      window.dispatchEvent(new CustomEvent(PROFILE_UPDATED_EVENT));
      router.refresh();
    } catch (e: any) {
      alert(e?.message ?? "Profile save failed");
    } finally {
      setSavingProfile(false);
    }
  };

  const uploadAvatar = async (file: File) => {
    setUploadingAvatar(true);
    try {
      const form = new FormData();
      form.append("file", file, file.name);
      const res = await fetch("/api/upload/image", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error?.message ?? "Upload failed");
      // Re-use uploaded image as avatar.
      const url = json.data?.visionUrl as string | undefined;
      if (!url) throw new Error("No visionUrl returned from upload");
      setDraftAvatarUrl(url);
    } catch (e: any) {
      alert(e?.message ?? "Avatar upload failed");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const changePassword = async () => {
    setPasswordError(null);
    try {
      setChangingPassword(true);
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error?.message ?? "Change password failed");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e: any) {
      setPasswordError(e?.message ?? "Change password failed");
    } finally {
      setChangingPassword(false);
    }
  };

  const disconnectGoogle = async () => {
    try {
      const res = await fetch("/api/auth/disconnect-google", { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error?.message ?? "Disconnect failed");
      router.refresh();
    } catch (e: any) {
      alert(e?.message ?? "Disconnect failed");
    }
  };

  const setPrefBool = async (key: string, value: boolean) => {
    const res = await fetch(`/api/preferences/${encodeURIComponent(key)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferenceValue: value }),
    });
    const json = await res.json();
    if (!res.ok || !json?.success) throw new Error(json?.error?.message ?? "Update failed");
  };

  const updateWeeklyEmailToggle = async (next: boolean) => {
    try {
      await Promise.all([setPrefBool("weekly_email_enabled", next), setPrefBool("notify_weekly_email", next)]);
      setWeeklyEmailEnabled(next);
    } catch (e: any) {
      alert(e?.message ?? "Update failed");
    }
  };

  const updateBatchCompleteToggle = async (next: boolean) => {
    try {
      await setPrefBool("notify_batch_complete", next);
      setBatchCompleteNotifsEnabled(next);
    } catch (e: any) {
      alert(e?.message ?? "Update failed");
    }
  };

  const updateTemplateInstalledToggle = async (next: boolean) => {
    try {
      await setPrefBool("notify_template_installed", next);
      setNotifyTemplateInstalled(next);
    } catch (e: any) {
      alert(e?.message ?? "Update failed");
    }
  };

  const updateTemplateRatedToggle = async (next: boolean) => {
    try {
      await setPrefBool("notify_template_rated", next);
      setNotifyTemplateRated(next);
    } catch (e: any) {
      alert(e?.message ?? "Update failed");
    }
  };

  const startDelete = () => {
    setDeleteOpen(true);
    setDeleteStep(1);
    setDeleteEmailInput("");
    setDeleteBannerActive(false);
  };

  const confirmDelete = async () => {
    try {
      setDeleteRunning(true);
      const res = await fetch("/api/user/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: deleteEmailInput }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error?.message ?? "Delete failed");
      setDeleteBannerActive(true);
      setDeleteOpen(false);
    } catch (e: any) {
      alert(e?.message ?? "Delete failed");
    } finally {
      setDeleteRunning(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr]">
      <aside className="space-y-2 rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-3 h-fit lg:sticky lg:top-4">
        <div className="text-sm font-semibold">Settings</div>
        <NavButton active={section === "profile"} onClick={() => setSection("profile")}>Profile</NavButton>
        <NavButton active={section === "security"} onClick={() => setSection("security")}>Security</NavButton>
        <NavButton active={section === "preferences"} onClick={() => setSection("preferences")}>Preferences</NavButton>
        <NavButton active={section === "notifications"} onClick={() => setSection("notifications")}>Notifications</NavButton>
        <NavButton active={section === "danger"} onClick={() => setSection("danger")}>Danger Zone</NavButton>
        <div className="pt-2 border-t border-[hsl(var(--border))] mt-2 space-y-1">
          <a
            href="/settings/integrations"
            className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm text-[hsl(var(--accent))] hover:bg-[hsl(var(--surface-elevated))]"
          >
            Integrations →
          </a>
          <a
            href="/settings/webhooks"
            className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm text-[hsl(var(--accent))] hover:bg-[hsl(var(--surface-elevated))]"
          >
            Webhooks (admin) →
          </a>
          <a
            href="/settings/api"
            className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm text-[hsl(var(--accent))] hover:bg-[hsl(var(--surface-elevated))]"
          >
            Developer API →
          </a>
        </div>
      </aside>

      <section className="space-y-4">
        {section === "profile" ? (
          <div className="space-y-4">
            <h1 className="text-xl font-bold">Profile</h1>

            <div className="rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-5 space-y-4">
              <div className="space-y-1">
                <div className="text-sm font-semibold">Email</div>
                <div
                  className="rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-3 py-2.5 text-sm text-[hsl(var(--foreground))]"
                  title="Account email"
                >
                  {user.email}
                </div>
                <div className="text-xs text-[hsl(var(--muted-foreground))]">
                  This is the email address for your account and sign-in.
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-sm font-semibold">Display name</div>
                <Input value={draftName} onChange={(e) => setDraftName(e.target.value)} />
              </div>

              <div className="space-y-1">
                <div className="text-sm font-semibold">Avatar</div>
                {draftAvatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={draftAvatarUrl} alt="" className="h-24 w-24 rounded-full border border-[hsl(var(--border))] object-cover" />
                ) : (
                  <div className="h-24 w-24 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))]" />
                )}

                <div className="mt-3">
                  <input
                    ref={avatarFileInputRef}
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    tabIndex={-1}
                    aria-hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void uploadAvatar(f);
                      e.target.value = "";
                    }}
                    disabled={uploadingAvatar}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={uploadingAvatar}
                    aria-label="Choose avatar image"
                    onClick={() => avatarFileInputRef.current?.click()}
                  >
                    {uploadingAvatar ? "Uploading…" : "Choose your avatar"}
                  </Button>
                </div>
              </div>

              <div className="flex gap-3">
                <Button onClick={() => void saveProfile()} disabled={savingProfile}>
                  {savingProfile ? "Saving..." : "Save changes"}
                </Button>
                <Button variant="secondary" onClick={() => router.refresh()} disabled={savingProfile}>
                  Reset
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {section === "security" ? (
          <div className="space-y-4">
            <h1 className="text-xl font-bold">Security</h1>

            <div className="rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-5 space-y-4">
              <div>
                <div className="text-sm font-semibold">Change password</div>
                <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                  {user.hasEmailPassword ? null : "Password login is not enabled for this account (Google-only)."}
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <div className="text-xs text-[hsl(var(--muted-foreground))]">Current password</div>
                    <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} disabled={!user.hasEmailPassword || changingPassword} />
                  </div>
                  <div>
                    <div className="text-xs text-[hsl(var(--muted-foreground))]">New password</div>
                    <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} disabled={!user.hasEmailPassword || changingPassword} />
                    <PasswordStrength value={newPassword} />
                  </div>
                  <div className="md:col-span-2">
                    <div className="text-xs text-[hsl(var(--muted-foreground))]">Confirm new password</div>
                    <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} disabled={!user.hasEmailPassword || changingPassword} />
                  </div>
                </div>

                {passwordError ? <div className="mt-2 text-sm text-[hsl(var(--destructive))]">{passwordError}</div> : null}

                <div className="mt-3">
                  <Button onClick={() => void changePassword()} disabled={!user.hasEmailPassword || changingPassword}>
                    {changingPassword ? "Updating..." : "Update password"}
                  </Button>
                </div>
              </div>

              <div className="border-t border-[hsl(var(--border))] pt-4">
                <div className="text-sm font-semibold">Connected accounts</div>
                <div className="mt-2 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs text-[hsl(var(--muted-foreground))]">Google OAuth</div>
                      <div className="text-sm font-semibold">{user.googleId ? "Connected" : "Not connected"}</div>
                      {user.googleId ? <div className="text-xs text-[hsl(var(--muted-foreground))]">{user.email}</div> : null}
                    </div>
                    {user.googleId ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void disconnectGoogle()}
                        disabled={!user.hasEmailPassword}
                      >
                        Disconnect
                      </Button>
                    ) : null}
                  </div>
                  {!user.hasEmailPassword && user.googleId ? (
                    <div className="text-xs text-[hsl(var(--muted-foreground))]">
                      Disconnect disabled because this is your only login method.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {section === "preferences" ? (
          <PreferencesSection userId={user.id} totalDesigns={totalDesigns} totalRevisions={totalRevisions} />
        ) : null}

        {section === "notifications" ? (
          <div className="space-y-4">
            <h1 className="text-xl font-bold">Notifications</h1>

            <div className="rounded-[var(--radius-card)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Weekly analytics email</div>
                  <div className="text-xs text-[hsl(var(--muted-foreground))]">A short summary every Monday.</div>
                </div>
                <Toggle
                  label="Weekly analytics email"
                  checked={weeklyEmailEnabled}
                  onChange={(v) => void updateWeeklyEmailToggle(v)}
                  disabled={loadingNotifs}
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Batch job completion</div>
                  <div className="text-xs text-[hsl(var(--muted-foreground))]">In-app notification when a batch finishes.</div>
                </div>
                <Toggle
                  label="Batch job completion"
                  checked={batchCompleteNotifsEnabled}
                  onChange={(v) => void updateBatchCompleteToggle(v)}
                  disabled={loadingNotifs}
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Marketplace install digest</div>
                  <div className="text-xs text-[hsl(var(--muted-foreground))]">
                    At most once per day: summary when others install your templates.
                  </div>
                </div>
                <Toggle
                  label="Marketplace install digest"
                  checked={notifyTemplateInstalled}
                  onChange={(v) => void updateTemplateInstalledToggle(v)}
                  disabled={loadingNotifs}
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Marketplace rating milestones</div>
                  <div className="text-xs text-[hsl(var(--muted-foreground))]">
                    Notify when your templates get their first rating or cross 4.0 / 4.5★ averages.
                  </div>
                </div>
                <Toggle
                  label="Marketplace rating milestones"
                  checked={notifyTemplateRated}
                  onChange={(v) => void updateTemplateRatedToggle(v)}
                  disabled={loadingNotifs}
                />
              </div>
            </div>
          </div>
        ) : null}

        {section === "danger" ? (
          <div className="space-y-4">
            <h1 className="text-xl font-bold">Danger Zone</h1>

            {deleteBannerActive ? (
              <div className="rounded-[var(--radius-card)] border border-red-500/40 bg-red-500/5 p-4 text-sm text-[hsl(var(--foreground))]">
                Your account will be permanently deleted in 30 days.
              </div>
            ) : null}

            <div className="space-y-3">
              <div className="rounded-[var(--radius-card)] border border-red-500/40 bg-red-500/5 p-5">
                <div className="text-sm font-semibold text-red-200">Export all my data</div>
                <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Creates your full export package and emails you a secure download link when ready.</div>
                <div className="mt-3">
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      const res = await fetch("/api/user/export-data", { method: "POST" });
                      if (!res.ok) {
                        alert("Export failed");
                        return;
                      }
                      alert("Export started. You'll receive an email with your download link.");
                    }}
                  >
                    Export data
                  </Button>
                </div>
              </div>

              <div className="rounded-[var(--radius-card)] border border-red-500/40 bg-red-500/5 p-5">
                <div className="text-sm font-semibold text-red-200">Delete account</div>
                <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Your account will be scheduled for deletion and permanently removed after 30 days.</div>
                <div className="mt-3">
                  <Button variant="destructive" onClick={startDelete}>
                    Delete account
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-xl border-[hsl(var(--border))] bg-[hsl(var(--surface))]">
          {deleteStep === 1 ? (
            <div className="space-y-4">
              <div className="text-sm font-semibold text-red-200">Delete your account?</div>
              <div className="text-xs text-[hsl(var(--muted-foreground))]">
                This will permanently remove your account and associated data.
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setDeleteOpen(false)} disabled={deleteRunning}>
                  Cancel
                </Button>
                <Button onClick={() => setDeleteStep(2)} disabled={deleteRunning}>
                  Continue
                </Button>
              </div>
            </div>
          ) : null}

          {deleteStep === 2 ? (
            <div className="space-y-4">
              <div className="text-sm font-semibold">Confirm by typing your email</div>
              <Input value={deleteEmailInput} onChange={(e) => setDeleteEmailInput(e.target.value)} placeholder={user.email} />
              <div className="text-xs text-[hsl(var(--muted-foreground))]">
                Your account will be scheduled now and permanently deleted after 30 days.
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setDeleteStep(1)} disabled={deleteRunning}>
                  Back
                </Button>
                <Button onClick={() => void confirmDelete()} disabled={deleteRunning || !emailIsValid}>
                  {deleteRunning ? "Deleting..." : "Delete"}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NavButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-[var(--radius)] px-3 py-2 text-left text-sm font-semibold ${
        active
          ? "bg-[hsl(var(--accent-muted))] text-[hsl(var(--foreground))] border-l-2 border-[hsl(var(--accent))]"
          : "bg-[hsl(var(--surface))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-elevated))]"
      }`}
    >
      {children}
    </button>
  );
}

