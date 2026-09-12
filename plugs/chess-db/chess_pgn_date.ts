// Pure helper, split out of chess_sql_store.ts so it can be unit-tested
// without importing the SQLite WASM binary (vitest/Node can't load the
// `.wasm` asset the way the esbuild client bundle does — see
// client/data/chess_sql_store.test.ts).

/**
 * PGN `Date` headers are "YYYY.MM.DD", but chess.js/PGN readers commonly
 * leave unknown parts as "??" (e.g. "2026.??.??"). Only fully-specified
 * dates are converted — partial ones can't be reliably compared against a
 * `sinceDate` filter, so they're excluded from that filter (not from the
 * game count itself).
 */
export function parsePgnDateToIso(dateRaw: string): string | null {
  const m = /^(\d{4})\.(\d{2})\.(\d{2})$/.exec(dateRaw.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const iso = `${y}-${mo}-${d}`;
  // Guards against e.g. "2026.13.40" round-tripping through Date as some
  // other, silently-wrong day.
  const dt = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) return null;
  return iso;
}
