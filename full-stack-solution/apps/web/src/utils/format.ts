/** Formatting helpers shared by the tables, cards and charts. */

/** `2026-10-10T12:30:00Z` -> `10/10/2026, 12:30:00` (viewer's locale). */
export function formatTimestamp(iso: string | null): string {
  if (!iso) {
    return "—";
  }

  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

/** Short axis/tooltip label: time only, since charts cover short windows. */
export function formatTimeOfDay(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleTimeString();
}

/** Rounds to at most `fractionDigits` and renders `—` for missing values. */
export function formatNumber(
  value: number | null | undefined,
  fractionDigits = 2,
): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }

  return value.toLocaleString(undefined, {
    maximumFractionDigits: fractionDigits,
  });
}
