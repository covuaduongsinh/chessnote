// Thin cross-plug API for chess-db, mirroring plugs/index/plug_api.ts and
// the other chess-* plug_api.ts files: every export just forwards to a
// syscall this plug's manifest (chess-db.plug.yaml) registers, so callers
// in other plugs (chess-ai, chess-repertoire) never import chess-db's
// actual SQLite/embedding logic directly — only this proxy, which keeps
// chess-db independently buildable/removable as its own `.plug.js`.
//
// Was previously plug-api/syscalls/chess_sql.ts + chess_embedding.ts
// (published as part of this fork's own @silverbulletmd/silverbullet
// package) — moved here so a plug that depends on chess-db doesn't need
// anything beyond the standard, unmodified SilverBullet plug-api to build:
// the syscall names below (`chessSql.*`/`chessEmbedding.*`) are just
// strings, resolved at runtime regardless of which installed plug backs
// them.
import { syscall } from "@silverbulletmd/silverbullet/syscall";
import type {
  AiAnnotationFrontmatterSync,
  AiAnnotationUpsert,
  ChessSqlGameRow,
  DebugDump,
  OpeningStatsQuery,
  OpeningStatsRow,
  RelatedGameCandidateRow,
  RelatedGamesQuery,
  RepertoireLineRow,
  RepertoireLineUpsert,
  SearchGameRow,
  SearchGamesQuery,
} from "./sqlite_store.ts";
import type { SrsGrade } from "./srs_sm2.ts";

export type {
  AiAnnotationFrontmatterSync,
  AiAnnotationUpsert,
  ChessSqlGameRow,
  DebugDump,
  OpeningStatsQuery,
  OpeningStatsRow,
  RelatedGameCandidateRow,
  RelatedGamesQuery,
  RepertoireLineRow,
  RepertoireLineUpsert,
  SearchGameRow,
  SearchGamesQuery,
  SrsGrade,
};

/** Upserts chess game rows (one per `ref`) into the SQLite cache. */
export function upsertGames(games: ChessSqlGameRow[]): Promise<void> {
  return syscall("chessSql.upsertGames", games);
}

/** Deletes every row belonging to a page from the SQLite cache. */
export function deleteGamesForPage(page: string): Promise<void> {
  return syscall("chessSql.deleteGamesForPage", page);
}

/** Groups a player's games by ECO code and tallies wins/losses/draws. */
export function queryOpeningStats(
  query: OpeningStatsQuery,
): Promise<OpeningStatsRow[]> {
  return syscall("chessSql.queryOpeningStats", query);
}

/** Full-text search (FTS5) over game metadata, AI summary/tags, and PGN comments. */
export function searchGames(query: SearchGamesQuery): Promise<SearchGameRow[]> {
  return syscall("chessSql.searchGames", query);
}

/** Scores and ranks candidate games related to a given game (same ECO, shared player). */
export function queryRelatedGames(
  query: RelatedGamesQuery,
): Promise<RelatedGameCandidateRow[]> {
  return syscall("chessSql.queryRelatedGames", query);
}

/** Structured storage for a real AI generation's output — summary/tags/confidence/model. */
export function upsertAiAnnotation(
  annotation: AiAnnotationUpsert,
): Promise<void> {
  return syscall("chessSql.upsertAiAnnotation", annotation);
}

/** Keeps the SQL summary/tags mirror in step with a page's frontmatter on every save. */
export function syncAiAnnotationFromFrontmatter(
  sync: AiAnnotationFrontmatterSync,
): Promise<void> {
  return syscall("chessSql.syncAiAnnotationFromFrontmatter", sync);
}

/** Deletes every AI annotation row belonging to a page. */
export function deleteAiAnnotationsForPage(page: string): Promise<void> {
  return syscall("chessSql.deleteAiAnnotationsForPage", page);
}

/** Reindex entry point: upserts a repertoire page's current lines (preserving SRS state) and removes only lines no longer on the page. */
export function syncRepertoireLinesForPage(
  page: string,
  lines: RepertoireLineUpsert[],
): Promise<void> {
  return syscall("chessSql.syncRepertoireLinesForPage", page, lines);
}

/** Deletes every repertoire line belonging to a page. */
export function deleteRepertoireLinesForPage(page: string): Promise<void> {
  return syscall("chessSql.deleteRepertoireLinesForPage", page);
}

/** Deletes every semantic-search embedding belonging to a page. */
export function deleteEmbeddingsForPage(page: string): Promise<void> {
  return syscall("chessSql.deleteEmbeddingsForPage", page);
}

/** Repertoire lines due today or never reviewed, earliest-due first. */
export function getDueRepertoireLines(
  limit: number,
): Promise<RepertoireLineRow[]> {
  return syscall("chessSql.getDueRepertoireLines", limit);
}

/** Applies an SRS grade to a repertoire line (SM-2) and persists the result. */
export function recordRepertoireReview(
  ref: string,
  grade: SrsGrade,
): Promise<RepertoireLineRow | null> {
  return syscall("chessSql.recordRepertoireReview", ref, grade);
}

/** Full dump of every chessSql-owned table — backs the "Chess: Kiểm tra dữ liệu SQLite (debug)" command. */
export function debugDump(): Promise<DebugDump> {
  return syscall("chessSql.debugDump");
}

// ---- chessEmbedding.* ----

export interface EmbeddingSearchQuery {
  queryText: string;
  limit: number;
}

export interface EmbeddingSearchRow {
  ref: string;
  page: string;
  white: string;
  black: string;
  result: string;
  eco: string;
  event: string;
  summary: string;
  score: number;
}

/** Computes and stores a semantic embedding for one game's descriptive text. Lazily downloads the embedding model on first call in a session — can be slow, callers should show progress UI. */
export function computeForGame(
  ref: string,
  page: string,
  text: string,
): Promise<void> {
  return syscall("chessEmbedding.computeForGame", ref, page, text);
}

/** Whether any game in this space has a computed embedding yet. */
export function hasAnyEmbeddings(): Promise<boolean> {
  return syscall("chessEmbedding.hasAnyEmbeddings");
}

/** Semantic search: embeds the query text and ranks stored game embeddings by cosine similarity. */
export function search(
  query: EmbeddingSearchQuery,
): Promise<EmbeddingSearchRow[]> {
  return syscall("chessEmbedding.search", query);
}
