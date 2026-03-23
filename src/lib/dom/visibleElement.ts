/**
 * Resolve duplicate responsive instances (e.g. desktop + mobile panels) by picking
 * the first matching id whose element has a non-zero layout box (actually shown).
 */
export function getFirstVisibleElementByIds(ids: string[]): HTMLElement | null {
  for (const id of ids) {
    const el = document.getElementById(id);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}
