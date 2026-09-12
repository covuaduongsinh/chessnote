// Pure helpers for parsing extra PGN header fields (Phase 3 of
// docs/plans/2026-09-11-dbms-sqlite-wasm-tich-hop.md) — kept separate from
// chess_sql_store.ts so they stay testable under vitest without importing the
// SQLite WASM binary (same reasoning as chess_pgn_date.ts).

/** Parses a PGN `WhiteElo`/`BlackElo` header value. Returns null for missing/non-numeric values (e.g. "?", ""), never NaN. */
export function parseEloToInt(s: string): number | null {
  const trimmed = s.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  return Number.parseInt(trimmed, 10);
}
