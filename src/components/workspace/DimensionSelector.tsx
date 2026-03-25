"use client";

import { useMemo } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { Info } from "lucide-react";
import { SOCIAL_DIMENSIONS, type SocialDimensionPreset } from "@/constants/platforms";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";

function ratioBoxStyle(d: SocialDimensionPreset) {
  // Base width ~32px; compute height from aspect ratio.
  const w = 32;
  const h = Math.round((w * d.height) / d.width);
  return { width: `${w}px`, height: `${Math.max(16, Math.min(44, h))}px` };
}

export function DimensionSelector({
  visible = true,
  platformHint,
}: {
  visible?: boolean;
  platformHint?: "twitter" | "instagram" | "linkedin" | "facebook" | null;
}) {
  const selected = useWorkspaceStore((s) => s.selectedDimension);
  const setSelected = useWorkspaceStore((s) => s.setSelectedDimension);
  const activeDesignId = useWorkspaceStore((s) => s.activeDesignId);
  const previewHtml = useWorkspaceStore((s) => s.previewHtml);
  const generationState = useWorkspaceStore((s) => s.generationState);

  const hasLoadedDesign = Boolean(activeDesignId && previewHtml.trim().length > 0);
  const locked = generationState !== "idle" || hasLoadedDesign;
  const showTwitterPortraitWarning = platformHint === "twitter" && selected.id === "portrait";

  const infoTooltip = useMemo(
    () =>
      "These dimensions work across Instagram, LinkedIn, Facebook, and Twitter. Your chosen size applies regardless of which platform you generate for.",
    []
  );

  if (!visible) return null;

  return (
    <div className="rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">
            Canvas Size
          </span>
          <Tooltip.Provider delayDuration={150}>
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <button
                  type="button"
                  className="inline-flex h-5 w-5 items-center justify-center rounded hover:bg-[hsl(var(--surface))]"
                  aria-label="Canvas size info"
                >
                  <Info className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]" />
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  side="top"
                  align="start"
                  className="z-[200] max-w-[280px] rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-2 py-1 text-[11px] text-[hsl(var(--foreground))] shadow"
                >
                  {infoTooltip}
                  <Tooltip.Arrow className="fill-[hsl(var(--surface))]" />
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          </Tooltip.Provider>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {SOCIAL_DIMENSIONS.map((d, idx) => {
          const isSelected = d.id === selected.id;
          const shortcut = idx === 0 ? "Shift+1" : idx === 1 ? "Shift+2" : "Shift+3";
          return (
            <Tooltip.Provider key={d.id} delayDuration={150}>
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <button
                    type="button"
                    onClick={() => setSelected(d)}
                    disabled={locked}
                    className={[
                      "group rounded-[var(--radius)] border px-2 py-2 text-left transition",
                      isSelected
                        ? "border-[hsl(var(--accent))] bg-[hsl(var(--accent-muted))] text-[hsl(var(--foreground))]"
                        : "border-[hsl(var(--border))] bg-[hsl(var(--surface))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-elevated))]",
                      locked ? "cursor-not-allowed opacity-60 hover:bg-[hsl(var(--surface))]" : "",
                    ].join(" ")}
                    aria-pressed={isSelected}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={[
                          "inline-block rounded-sm border",
                          isSelected
                            ? "border-[hsl(var(--accent))] bg-[hsl(var(--accent))]/15"
                            : "border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))]",
                        ].join(" ")}
                        style={ratioBoxStyle(d)}
                      />
                      <div>
                        <div className="text-sm font-semibold leading-4">{d.label}</div>
                        <div className="text-xs text-[hsl(var(--muted-foreground))]">
                          {d.width} × {d.height}
                        </div>
                      </div>
                    </div>
                  </button>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content
                    side="top"
                    align="center"
                    className="z-[200] max-w-[260px] rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-2 py-1 text-[11px] text-[hsl(var(--foreground))] shadow"
                  >
                    {locked ? (
                      <>
                        Canvas size is locked once generation starts.
                        <span className="text-[hsl(var(--muted-foreground))]"> (select before Generate)</span>
                      </>
                    ) : (
                      <>
                        {d.description} <span className="text-[hsl(var(--muted-foreground))]">({shortcut})</span>
                      </>
                    )}
                    <Tooltip.Arrow className="fill-[hsl(var(--surface))]" />
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            </Tooltip.Provider>
          );
        })}
      </div>

      {locked ? (
        <div className="mt-2 text-[11px] text-[hsl(var(--muted-foreground))]">
          Canvas size is locked once generation starts.
        </div>
      ) : null}

      {showTwitterPortraitWarning ? (
        <div className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">
          Portrait format may crop slightly on Twitter feeds.
        </div>
      ) : null}
    </div>
  );
}

