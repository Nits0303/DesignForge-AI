export function formatCost(amount: number | null | undefined): string {
  const n = Number(amount ?? 0);
  const abs = Math.abs(n);
  if (abs < 10) return `$${n.toFixed(2)}`;
  return `$${Math.round(n).toString()}`;
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value == null || Number.isNaN(value)) return "-";
  return `${value.toFixed(digits)}%`;
}

