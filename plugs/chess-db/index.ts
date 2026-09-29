// Flat function entry points for chess-db.plug.yaml's `syscall:` declarations
// — a manifest `path:` must point to a plain exported function, not a class
// method, so this module holds the one `ChessSqlStore` singleton (created
// once, lazily initializing itself — see sqlite_store.ts's constructor) and
// re-exports each operation as a top-level function. Mirrors what
// client/client_system.ts used to do (one shared instance passed to
// chessSqlSyscalls()/chessEmbeddingSyscalls()) before this became its own
// plug.
import { space } from "@silverbulletmd/silverbullet/syscalls";
import {
  bytesToFloat32,
  cosineSimilarity,
  EMBEDDING_MODEL_ID,
  embedText,
  float32ToBytes,
} from "./embedding_store.ts";
import {
  type PersistedSrsState,
  parseSrsState,
  serializeSrsState,
  SRS_STATE_PATH,
  srsKey,
} from "./srs_persist.ts";
import {
  type AiAnnotationFrontmatterSync,
  type AiAnnotationUpsert,
  ChessSqlStore,
  type ChessSqlGameRow,
  type DebugDump,
  type OpeningStatsQuery,
  type OpeningStatsRow,
  type RelatedGameCandidateRow,
  type RelatedGamesQuery,
  type RepertoireLineRow,
  type RepertoireLineUpsert,
  type SearchGameRow,
  type SearchGamesQuery,
} from "./sqlite_store.ts";
import type { SrsGrade } from "./srs_sm2.ts";

const store = new ChessSqlStore();

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

// ---- chessSql.* ----

export function upsertGames(games: ChessSqlGameRow[]): Promise<void> {
  return store.upsertGames(games);
}

export function deleteGamesForPage(page: string): Promise<void> {
  return store.deleteGamesForPage(page);
}

export function queryOpeningStats(
  query: OpeningStatsQuery,
): Promise<OpeningStatsRow[]> {
  return store.queryOpeningStats(query);
}

export function searchGames(query: SearchGamesQuery): Promise<SearchGameRow[]> {
  return store.searchGames(query);
}

export function queryRelatedGames(
  query: RelatedGamesQuery,
): Promise<RelatedGameCandidateRow[]> {
  return store.queryRelatedGames(query);
}

export function upsertAiAnnotation(
  annotation: AiAnnotationUpsert,
): Promise<void> {
  return store.upsertAiAnnotation(annotation);
}

export function syncAiAnnotationFromFrontmatter(
  sync: AiAnnotationFrontmatterSync,
): Promise<void> {
  return store.syncAiAnnotationFromFrontmatter(sync);
}

export function deleteAiAnnotationsForPage(page: string): Promise<void> {
  return store.deleteAiAnnotationsForPage(page);
}

// Trạng thái SRS bền hoá ra file trong Space (xem srs_persist.ts). Nạp một lần
// khi cần, rồi giữ trong bộ nhớ; mọi lỗi đọc/ghi file chỉ ghi log — không được
// làm hỏng việc đánh chỉ mục trang hay lượt ôn tập.
let persistedSrs: Promise<PersistedSrsState> | undefined;

function loadPersistedSrs(): Promise<PersistedSrsState> {
  if (!persistedSrs) {
    persistedSrs = (async () => {
      try {
        if (!(await space.fileExists(SRS_STATE_PATH))) return {};
        const bytes = await space.readFile(SRS_STATE_PATH);
        return parseSrsState(new TextDecoder().decode(bytes));
      } catch (e) {
        console.error("[chess-db] Không đọc được trạng thái SRS đã lưu:", e);
        return {};
      }
    })();
  }
  return persistedSrs;
}

async function savePersistedSrs(state: PersistedSrsState): Promise<void> {
  try {
    await space.writeFile(
      SRS_STATE_PATH,
      new TextEncoder().encode(serializeSrsState(state)),
    );
  } catch (e) {
    console.error("[chess-db] Không ghi được trạng thái SRS:", e);
  }
}

export async function syncRepertoireLinesForPage(
  page: string,
  lines: RepertoireLineUpsert[],
): Promise<void> {
  await store.syncRepertoireLinesForPage(page, lines);
  // DB vừa được dựng lại từ trang (mặc định SRS) → khôi phục lịch ôn đã lưu.
  const persisted = await loadPersistedSrs();
  if (Object.keys(persisted).length === 0) return;
  for (const row of await store.getRepertoireLinesForPage(page)) {
    const saved = persisted[srsKey(row.page, row.movesSan)];
    if (saved) await store.applyRepertoireState(row.ref, saved);
  }
}

export function deleteRepertoireLinesForPage(page: string): Promise<void> {
  return store.deleteRepertoireLinesForPage(page);
}

export function deleteEmbeddingsForPage(page: string): Promise<void> {
  return store.deleteEmbeddingsForPage(page);
}

export function getDueRepertoireLines(
  limit: number,
): Promise<RepertoireLineRow[]> {
  return store.getDueRepertoireLines(limit);
}

export async function recordRepertoireReview(
  ref: string,
  grade: SrsGrade,
): Promise<RepertoireLineRow | null> {
  const row = await store.recordRepertoireReview(ref, grade);
  if (row) {
    const persisted = await loadPersistedSrs();
    persisted[srsKey(row.page, row.movesSan)] = {
      dueDate: row.dueDate,
      easeFactor: row.easeFactor,
      intervalDays: row.intervalDays,
      reviewCount: row.reviewCount,
      lastGrade: row.lastGrade,
    };
    await savePersistedSrs(persisted);
  }
  return row;
}

export function debugDump(): Promise<DebugDump> {
  return store.debugDump();
}

// ---- chessEmbedding.* ----
// Same logic previously in client/plugos/syscalls/chess_embedding.ts's
// callbacks, now living directly alongside the store instead of a separate
// core syscall registrar.

export interface EmbeddingSearchQuery {
  queryText: string;
  limit: number;
}

export type EmbeddingSearchRow = SearchGameRow & { score: number };

export async function computeForGame(
  ref: string,
  page: string,
  text: string,
): Promise<void> {
  const vector = await embedText(text);
  await store.upsertEmbedding({
    ref,
    page,
    embedding: float32ToBytes(vector),
    modelId: EMBEDDING_MODEL_ID,
  });
}

export function hasAnyEmbeddings(): Promise<boolean> {
  return store.hasAnyEmbeddings();
}

export async function search(
  query: EmbeddingSearchQuery,
): Promise<EmbeddingSearchRow[]> {
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
}
