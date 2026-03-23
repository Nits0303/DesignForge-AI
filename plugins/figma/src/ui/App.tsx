import { useCallback, useEffect, useRef, useState } from "preact/hooks";

type DesignRow = {
  id: string;
  title: string;
  platform: string;
  format: string;
  createdAt: string;
  currentVersion: number;
  previewUrl: string | null;
};

type PendingNotification = {
  id: string;
  title: string;
  body: string | null;
  designId: string | null;
  createdAt: string;
};

const API = typeof __API_BASE__ !== "undefined" ? __API_BASE__ : "http://localhost:3000";

const PLATFORM_CHIPS: { id: string; label: string }[] = [
  { id: "all", label: "All" },
  { id: "instagram", label: "Instagram" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "facebook", label: "Facebook" },
  { id: "twitter", label: "Twitter/X" },
  { id: "website", label: "Website" },
  { id: "mobile", label: "Mobile" },
];

const POLL_MS = 30_000;
const PAGE_SIZE = 10;

export function App() {
  const [token, setToken] = useState("");
  const tokenRef = useRef("");
  const [connected, setConnected] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [pushStatus, setPushStatus] = useState<string | null>(null);
  const [designs, setDesigns] = useState<DesignRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastSuccess, setLastSuccess] = useState<string | null>(null);
  const pushSafetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notificationToClearRef = useRef<string | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [platform, setPlatform] = useState("all");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState<number | null>(null);

  const [pushBanner, setPushBanner] = useState<PendingNotification | null>(null);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim().toLowerCase()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  function clearPushTimer() {
    if (pushSafetyTimerRef.current) {
      clearTimeout(pushSafetyTimerRef.current);
      pushSafetyTimerRef.current = null;
    }
  }

  useEffect(() => {
    parent.postMessage({ pluginMessage: { type: "LOAD_TOKEN" } }, "*");
  }, []);

  const verifyToken = useCallback(async (t: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/plugin/auth/verify`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      const json = await res.json();
      if (!res.ok || !json.success || !json.data?.valid) {
        setConnected(false);
        setError(json?.error?.message ?? "Invalid token");
        return;
      }
      setConnected(true);
      setUserName(json.data.user?.name ?? "Designer");
      parent.postMessage({ pluginMessage: { type: "SAVE_TOKEN", token: t } }, "*");

      if (json.data?.refreshRecommended) {
        try {
          const rr = await fetch(`${API}/api/plugin/auth/refresh`, {
            method: "POST",
            headers: { Authorization: `Bearer ${t}` },
          });
          const rj = await rr.json();
          if (rr.ok && rj.success && typeof rj.data?.token === "string") {
            const newTok = rj.data.token as string;
            setToken(newTok);
            tokenRef.current = newTok;
            parent.postMessage({ pluginMessage: { type: "SAVE_TOKEN", token: newTok } }, "*");
          }
        } catch {
          /* keep existing token */
        }
      }
    } catch (e: any) {
      setError(e?.message ?? "Network error — check API URL and manifest allowedDomains.");
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDesignsPage = useCallback(
    async (requestPage: number, append: boolean) => {
      const t = tokenRef.current;
      if (!t) return;
      setError(null);
      const params = new URLSearchParams();
      params.set("limit", String(PAGE_SIZE));
      params.set("page", String(requestPage));
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (platform && platform !== "all") params.set("platform", platform);

      const dr = await fetch(`${API}/api/plugin/designs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      const dj = await dr.json();
      if (!dr.ok || !dj.success) {
        setError(dj?.error?.message ?? "Could not load designs");
        return;
      }
      const items = (dj.data.items ?? []) as DesignRow[];
      const hm = !!dj.data.hasMore;
      const tot = typeof dj.data.total === "number" ? dj.data.total : null;

      if (append) {
        setDesigns((prev) => [...prev, ...items]);
      } else {
        setDesigns(items);
      }
      setPage(requestPage);
      setHasMore(hm);
      if (tot !== null) setTotal(tot);
    },
    [debouncedSearch, platform]
  );

  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    setListLoading(true);
    setPage(1);
    (async () => {
      try {
        await fetchDesignsPage(1, false);
      } finally {
        if (!cancelled) setListLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connected, debouncedSearch, platform, fetchDesignsPage]);

  const pollNotifications = useCallback(async () => {
    const t = tokenRef.current;
    if (!t || !connected) return;
    try {
      const res = await fetch(`${API}/api/plugin/notifications/pending`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      const json = await res.json();
      if (!res.ok || !json.success) return;
      const items = (json.data.items ?? []) as PendingNotification[];
      const first = items.find((n) => n.designId);
      setPushBanner(first ?? null);
    } catch {
      /* ignore */
    }
  }, [connected]);

  useEffect(() => {
    if (!connected) return;
    void pollNotifications();
    const id = window.setInterval(() => void pollNotifications(), POLL_MS);
    return () => clearInterval(id);
  }, [connected, pollNotifications]);

  useEffect(() => {
    const onMsg = (event: MessageEvent) => {
      const pm = event.data?.pluginMessage ?? event.data;
      if (!pm || typeof pm !== "object") return;

      if (pm.type === "TOKEN_FROM_MAIN" && typeof pm.token === "string") {
        setToken(pm.token);
        if (pm.token) void verifyToken(pm.token);
        return;
      }

      if (pm.type === "PUSH_PROGRESS" && typeof pm.step === "string") {
        setPushStatus(pm.step);
        return;
      }

      if (pm.type === "PUSH_COMPLETE") {
        clearPushTimer();
        setPushStatus(null);
        setLoading(false);
        const rep = pm.report as { layerCount?: number; imagesLoaded?: number; imagesFailed?: number } | undefined;
        const parts: string[] = [];
        if (typeof rep?.layerCount === "number") parts.push(`${rep.layerCount} layers`);
        if (typeof rep?.imagesLoaded === "number" && rep.imagesLoaded > 0) parts.push(`${rep.imagesLoaded} images`);
        if (typeof rep?.imagesFailed === "number" && rep.imagesFailed > 0) parts.push(`${rep.imagesFailed} images failed`);
        setLastSuccess(parts.length ? `Added ${parts.join(", ")}.` : "Push complete.");
        setTimeout(() => setLastSuccess(null), 5000);
        void logExport(pm as PushCompletePayload);
        const nid = notificationToClearRef.current;
        if (nid) {
          void markNotificationRead(nid);
          notificationToClearRef.current = null;
          setPushBanner(null);
        }
        return;
      }

      if (pm.type === "PUSH_ERROR") {
        clearPushTimer();
        setPushStatus(null);
        setLoading(false);
        notificationToClearRef.current = null;
        setError(typeof pm.error === "string" ? pm.error : "Push failed");
        return;
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [verifyToken]);

  type PushCompletePayload = {
    designId?: string;
    versionNumber?: number;
    figmaFileKey?: string;
    nodeId?: string;
    report?: { layerCount: number; imagesLoaded?: number; imagesFailed?: number };
  };

  async function logExport(pm: PushCompletePayload) {
    const t = tokenRef.current;
    if (!t || !pm.designId || !pm.figmaFileKey || !pm.nodeId) return;
    try {
      await fetch(`${API}/api/plugin/designs/${pm.designId}/export-log`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${t}`,
        },
        body: JSON.stringify({
          versionNumber: pm.versionNumber ?? 1,
          figmaFileKey: pm.figmaFileKey,
          figmaNodeId: pm.nodeId,
          layerCount: pm.report?.layerCount ?? 0,
        }),
      });
    } catch {
      /* non-fatal */
    }
  }

  async function markNotificationRead(id: string) {
    const t = tokenRef.current;
    if (!t) return;
    try {
      await fetch(`${API}/api/plugin/notifications/${id}/read`, {
        method: "POST",
        headers: { Authorization: `Bearer ${t}` },
      });
    } catch {
      /* ignore */
    }
  }

  const connect = () => {
    void verifyToken(token.trim());
  };

  const fetchDesignRow = async (id: string): Promise<DesignRow | null> => {
    const res = await fetch(`${API}/api/plugin/designs/${id}`, {
      headers: { Authorization: `Bearer ${tokenRef.current}` },
    });
    const json = await res.json();
    if (!res.ok || !json.success || !json.data) return null;
    const d = json.data;
    return {
      id: d.id,
      title: d.title,
      platform: d.platform,
      format: d.format,
      createdAt: d.createdAt,
      currentVersion: d.currentVersion,
      previewUrl: null,
    };
  };

  const runPushDesign = async (d: DesignRow, opts?: { fromBannerNotificationId?: string }) => {
    setLoading(true);
    setPushStatus("Fetching design…");
    setError(null);
    setLastSuccess(null);
    if (opts?.fromBannerNotificationId) {
      notificationToClearRef.current = opts.fromBannerNotificationId;
    } else {
      notificationToClearRef.current = null;
    }
    try {
      const r = await fetch(`${API}/api/plugin/designs/${d.id}/version/${d.currentVersion}/html`, {
        headers: { Authorization: `Bearer ${tokenRef.current}` },
      });
      if (!r.ok) {
        setError("Could not load HTML for this version.");
        setLoading(false);
        setPushStatus(null);
        notificationToClearRef.current = null;
        return;
      }
      const html = await r.text();
      const apiBase = API.replace(/\/+$/, "");
      parent.postMessage(
        {
          pluginMessage: {
            type: "PUSH_DESIGN",
            html,
            designId: d.id,
            versionNumber: d.currentVersion,
            apiBase,
          },
        },
        "*"
      );
      clearPushTimer();
      pushSafetyTimerRef.current = setTimeout(() => {
        setLoading(false);
        setPushStatus(null);
        setError("Push timed out after 2 minutes.");
        notificationToClearRef.current = null;
        pushSafetyTimerRef.current = null;
      }, 120000);
    } catch (e: any) {
      clearPushTimer();
      notificationToClearRef.current = null;
      setError(e?.message ?? "Fetch failed");
      setLoading(false);
      setPushStatus(null);
    }
  };

  const onPushBanner = async () => {
    if (!pushBanner?.designId) return;
    const row =
      designs.find((x) => x.id === pushBanner.designId) ?? (await fetchDesignRow(pushBanner.designId));
    if (!row) {
      setError("Design not found for notification.");
      return;
    }
    await runPushDesign(row, { fromBannerNotificationId: pushBanner.id });
  };

  const loadMore = () => {
    setListLoading(true);
    void fetchDesignsPage(page + 1, true).finally(() => setListLoading(false));
  };

  const refreshList = () => {
    setListLoading(true);
    void fetchDesignsPage(1, false).finally(() => setListLoading(false));
  };

  if (!connected) {
    return (
      <div style={{ padding: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>DesignForge AI</div>
        <p className="df-muted" style={{ marginTop: 0 }}>
          Push your designs to Figma in one click.
        </p>
        <label className="df-muted" style={{ display: "block", marginBottom: 4 }}>
          Plugin token
        </label>
        <input
          className="df-input"
          type="password"
          autoComplete="off"
          value={token}
          onInput={(e) => setToken((e.target as HTMLInputElement).value)}
          placeholder="Paste token from Settings → Integrations"
        />
        <button
          type="button"
          className="df-btn df-btn-primary"
          style={{ marginTop: 10 }}
          onClick={connect}
          disabled={loading || !token.trim()}
        >
          {loading ? "…" : "Connect"}
        </button>
        {error ? <div style={{ color: "#f85149", marginTop: 8, fontSize: 12 }}>{error}</div> : null}
        <button
          type="button"
          className="df-btn"
          style={{ marginTop: 8 }}
          onClick={() =>
            parent.postMessage(
              {
                pluginMessage: {
                  type: "OPEN_SETTINGS",
                  settingsUrl: `${API.replace(/\/+$/, "")}/settings/integrations`,
                },
              },
              "*"
            )
          }
        >
          Get token in app
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>{userName}</span>
        <button
          type="button"
          className="df-btn"
          style={{ width: "auto", padding: "4px 8px" }}
          onClick={() => {
            setConnected(false);
            setToken("");
            setPushBanner(null);
            parent.postMessage({ pluginMessage: { type: "CLEAR_TOKEN" } }, "*");
          }}
        >
          Sign out
        </button>
      </div>

      {pushBanner && pushBanner.designId ? (
        <div className="df-banner">
          <div style={{ fontSize: 12, fontWeight: 600 }}>Ready to push</div>
          <div className="df-muted" style={{ marginTop: 4 }}>
            {pushBanner.title || "A design is ready in DesignForge."}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button
              type="button"
              className="df-btn df-btn-primary"
              style={{ flex: 1 }}
              disabled={loading}
              onClick={() => void onPushBanner()}
            >
              Push now
            </button>
            <button
              type="button"
              className="df-btn"
              style={{ flex: 1 }}
              onClick={() => {
                void markNotificationRead(pushBanner.id);
                setPushBanner(null);
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      {error ? <div style={{ color: "#f85149", marginBottom: 8, fontSize: 12 }}>{error}</div> : null}
      {lastSuccess ? (
        <div style={{ color: "#3fb950", marginBottom: 8, fontSize: 12 }}>{lastSuccess}</div>
      ) : null}
      {pushStatus ? (
        <div className="df-muted" style={{ marginBottom: 8 }}>
          {pushStatus}
        </div>
      ) : null}

      <label className="df-muted" style={{ display: "block", marginBottom: 4 }}>
        Search designs
      </label>
      <input
        className="df-input"
        type="search"
        value={searchInput}
        onInput={(e) => setSearchInput((e.target as HTMLInputElement).value)}
        placeholder="Title…"
      />

      <div className="df-chips" style={{ marginTop: 10 }}>
        {PLATFORM_CHIPS.map((c) => (
          <button
            key={c.id}
            type="button"
            className={platform === c.id ? "df-chip df-chip-active" : "df-chip"}
            onClick={() => setPlatform(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div
        className="df-muted"
        style={{ marginTop: 10, marginBottom: 6, display: "flex", justifyContent: "space-between" }}
      >
        <span>Designs</span>
        {total !== null ? <span>{total} total</span> : null}
      </div>

      {listLoading && designs.length === 0 ? (
        <div className="df-muted">Loading…</div>
      ) : null}

      <div style={{ maxHeight: 400, overflow: "auto" }}>
        {designs.map((d) => (
          <div key={d.id} className="df-card">
            <div style={{ fontWeight: 600, fontSize: 12 }}>{d.title}</div>
            <div className="df-muted">
              {d.platform} · {d.format}
            </div>
            <button
              type="button"
              className="df-btn df-btn-primary"
              style={{ marginTop: 8 }}
              onClick={() => void runPushDesign(d)}
              disabled={loading}
            >
              {loading ? "…" : "Push to Figma"}
            </button>
          </div>
        ))}
      </div>

      {hasMore ? (
        <button
          type="button"
          className="df-btn"
          style={{ marginTop: 10 }}
          disabled={listLoading}
          onClick={loadMore}
        >
          {listLoading ? "Loading…" : "Load more"}
        </button>
      ) : null}

      <button type="button" className="df-btn" style={{ marginTop: 10 }} disabled={listLoading} onClick={refreshList}>
        Refresh list
      </button>
    </div>
  );
}
