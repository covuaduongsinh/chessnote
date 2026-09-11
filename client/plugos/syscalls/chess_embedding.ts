// Phase 5 (stretch) of docs/plans/2026-09-11-dbms-sqlite-wasm-tich-hop.md —
// deliberately a SEPARATE syscall namespace from chessSql.* (client/plugos/
// syscalls/chess_sql.ts): this is the one subsystem that lazily pulls in a
// large (13-26MB+ runtime, 50-120MB+ model) transformers.js dependency, kept
// isolated so nothing that only needs chessSql.* pays for that import
// surface.
import {
  bytesToFloat32,
  cosineSimilarity,
  EMBEDDING_MODEL_ID,
  embedText,
  float32ToBytes,
} from "../../data/chess_embedding_store.ts";
import type {
  ChessSqlStore,
  SearchGameRow,
} from "../../data/chess_sql_store.ts";
import type { SysCallMapping } from "../system.ts";

export interface EmbeddingSearchQuery {
  queryText: string;
  limit: number;
}

export type EmbeddingSearchRow = SearchGameRow & { score: number };

export function chessEmbeddingSyscalls(store: ChessSqlStore): SysCallMapping {
  return {
    "chessEmbedding.computeForGame": {
      callback: async (
        _ctx,
        ref: string,
        page: string,
        text: string,
      ): Promise<void> => {
        const vector = await embedText(text);
        await store.upsertEmbedding({
          ref,
          page,
          embedding: float32ToBytes(vector),
          modelId: EMBEDDING_MODEL_ID,
        });
      },
      description:
        "Computes and stores a semantic embedding for one game's descriptive text (lazily downloads the embedding model on first call — can be slow).",
      signatures: ["chessEmbedding.computeForGame(ref, page, text)"],
    },
    "chessEmbedding.hasAnyEmbeddings": {
      callback: (): Promise<boolean> => store.hasAnyEmbeddings(),
      description:
        "Whether any game in this space has a computed embedding yet.",
    },
    "chessEmbedding.search": {
      callback: async (
        _ctx,
        query: EmbeddingSearchQuery,
      ): Promise<EmbeddingSearchRow[]> => {
        const queryVector = await embedText(query.queryText);
        const all = await store.getAllEmbeddings();
        const ranked = all
          .map((e) => ({
            ref: e.ref,
            score: cosineSimilarity(queryVector, bytesToFloat32(e.embedding)),
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, query.limit);

        const games = await store.getGamesByRefs(ranked.map((r) => r.ref));
        const gameByRef = new Map(games.map((g) => [g.ref, g]));
        return ranked
          .map((r) => {
            const game = gameByRef.get(r.ref);
            return game ? { ...game, score: r.score } : null;
          })
          .filter((g): g is EmbeddingSearchRow => g !== null);
      },
      description:
        "Semantic search: embeds the query text and ranks stored game embeddings by cosine similarity (brute-force — see game_embeddings' schema comment in chess_sql_store.ts for why).",
      signatures: ["chessEmbedding.search(query)"],
    },
  };
}
