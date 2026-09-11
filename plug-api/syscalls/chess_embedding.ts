import { syscall } from "@silverbulletmd/silverbullet/syscall";
/**
 * Plug-facing wrapper for the client-side semantic-search subsystem
 * (client/data/chess_embedding_store.ts, client/plugos/syscalls/chess_embedding.ts).
 * Phase 5 (stretch) of docs/plans/2026-09-11-dbms-sqlite-wasm-tich-hop.md.
 * Kept as its own module (not merged into syscalls/chess_sql.ts) so callers
 * that only need chessSql.* aren't implicitly tied to this heavier subsystem.
 * @module
 */

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
