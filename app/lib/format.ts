// ---------------------------------------------------------------------------
// Deterministic date formatting utilities.
//
// IMPORTANT: Never use `toLocaleDateString()` in React render functions.
// The output varies between Node.js (server) and the browser (client) due to
// different ICU / Intl implementations, which causes React hydration errors.
//
// Instead, format dates in route loaders using these helpers, then pass the
// pre-formatted string to the component.
// ---------------------------------------------------------------------------

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Format a date string as "Feb 15, 2025" (short month).
 * Returns "" if the input is falsy.
 */
export function formatShortDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/**
 * Format a date string as "February 15, 2025" (long month).
 * Returns "" if the input is falsy.
 */
export function formatLongDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  return `${MONTHS_LONG[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/**
 * Format a date string as "2/15/2025" (numeric).
 * Returns "" if the input is falsy.
 */
export function formatNumericDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}
