import type {
  AiAnnotationFrontmatterSync,
  AiAnnotationUpsert,
  ChessSqlGameRow,
  ChessSqlStore,
  DebugDump,
  OpeningStatsQuery,
  OpeningStatsRow,
  RelatedGameCandidateRow,
  RelatedGamesQuery,
  RepertoireLineRow,
  RepertoireLineUpsert,
  SearchGameRow,
  SearchGamesQuery,
} from "../../data/chess_sql_store.ts";
import type { SrsGrade } from "../../data/srs_sm2.ts";
import type { SysCallMapping } from "../system.ts";

export function chessSqlSyscalls(store: ChessSqlStore): SysCallMapping {
  return {
    "chessSql.upsertGames": {
      callback: (_ctx, games: ChessSqlGameRow[]): Promise<void> => {
        return store.upsertGames(games);
      },
      description:
        "Upserts chess game rows into the embedded SQLite cache (client/data/chess_sql_store.ts).",
      signatures: ["chessSql.upsertGames(games)"],
    },
    "chessSql.deleteGamesForPage": {
      callback: (_ctx, page: string): Promise<void> => {
        return store.deleteGamesForPage(page);
      },
      description:
        "Deletes every chess game row belonging to a page from the SQLite cache.",
      signatures: ["chessSql.deleteGamesForPage(page)"],
    },
    "chessSql.queryOpeningStats": {
      callback: (
        _ctx,
        query: OpeningStatsQuery,
      ): Promise<OpeningStatsRow[]> => {
        return store.queryOpeningStats(query);
      },
      description:
        "Groups indexed games by ECO code and tallies wins/losses/draws for a player's color, via a real SQL GROUP BY over the embedded SQLite cache.",
      signatures: ["chessSql.queryOpeningStats(query)"],
    },
    "chessSql.searchGames": {
      callback: (_ctx, query: SearchGamesQuery): Promise<SearchGameRow[]> => {
        return store.searchGames(query);
      },
      description:
        "Full-text search (SQLite FTS5) over indexed games' metadata, AI summary/tags, and PGN comments, ranked by relevance.",
      signatures: ["chessSql.searchGames(query)"],
    },
    "chessSql.queryRelatedGames": {
      callback: (
        _ctx,
        query: RelatedGamesQuery,
      ): Promise<RelatedGameCandidateRow[]> => {
        return store.queryRelatedGames(query);
      },
      description:
        "Scores and ranks candidate games related to the given game (same ECO, shared player) via SQL instead of a full JS scan.",
      signatures: ["chessSql.queryRelatedGames(query)"],
    },
    "chessSql.upsertAiAnnotation": {
      callback: (_ctx, annotation: AiAnnotationUpsert): Promise<void> => {
        return store.upsertAiAnnotation(annotation);
      },
      description:
        "Structured storage for a real AI generation's output (summary/tags/confidence/model), alongside the frontmatter a user sees on the page.",
      signatures: ["chessSql.upsertAiAnnotation(annotation)"],
    },
    "chessSql.syncAiAnnotationFromFrontmatter": {
      callback: (_ctx, sync: AiAnnotationFrontmatterSync): Promise<void> => {
        return store.syncAiAnnotationFromFrontmatter(sync);
      },
      description:
        "Keeps the SQL summary/tags mirror in step with a page's frontmatter on every save, without touching confidence/model attribution.",
      signatures: ["chessSql.syncAiAnnotationFromFrontmatter(sync)"],
    },
    "chessSql.deleteAiAnnotationsForPage": {
      callback: (_ctx, page: string): Promise<void> => {
        return store.deleteAiAnnotationsForPage(page);
      },
      description: "Deletes every AI annotation row belonging to a page.",
      signatures: ["chessSql.deleteAiAnnotationsForPage(page)"],
    },
    "chessSql.syncRepertoireLinesForPage": {
      callback: (
        _ctx,
        page: string,
        lines: RepertoireLineUpsert[],
      ): Promise<void> => {
        return store.syncRepertoireLinesForPage(page, lines);
      },
      description:
        "Reindex entry point: upserts a repertoire page's current lines (preserving SRS review state) and removes only the lines that no longer exist on the page.",
      signatures: ["chessSql.syncRepertoireLinesForPage(page, lines)"],
    },
    "chessSql.deleteRepertoireLinesForPage": {
      callback: (_ctx, page: string): Promise<void> => {
        return store.deleteRepertoireLinesForPage(page);
      },
      description: "Deletes every repertoire line belonging to a page.",
      signatures: ["chessSql.deleteRepertoireLinesForPage(page)"],
    },
    "chessSql.deleteEmbeddingsForPage": {
      callback: (_ctx, page: string): Promise<void> => {
        return store.deleteEmbeddingsForPage(page);
      },
      description:
        "Deletes every semantic-search embedding belonging to a page (Phase 5) — plain housekeeping, kept on chessSql.* rather than chessEmbedding.* since it never touches the embedding model.",
      signatures: ["chessSql.deleteEmbeddingsForPage(page)"],
    },
    "chessSql.getDueRepertoireLines": {
      callback: (_ctx, limit: number): Promise<RepertoireLineRow[]> => {
        return store.getDueRepertoireLines(limit);
      },
      description:
        "Returns repertoire lines due today or never reviewed, earliest-due first.",
      signatures: ["chessSql.getDueRepertoireLines(limit)"],
    },
    "chessSql.recordRepertoireReview": {
      callback: (
        _ctx,
        ref: string,
        grade: SrsGrade,
      ): Promise<RepertoireLineRow | null> => {
        return store.recordRepertoireReview(ref, grade);
      },
      description:
        "Applies an SRS grade (again/hard/good/easy) to a repertoire line via SM-2 and persists the result.",
      signatures: ["chessSql.recordRepertoireReview(ref, grade)"],
    },
    "chessSql.debugDump": {
      callback: (): Promise<DebugDump> => {
        return store.debugDump();
      },
      description:
        "Full dump of every chessSql-owned table, for the 'Chess: Kiểm tra dữ liệu SQLite (debug)' command — not meant for any other use.",
      signatures: ["chessSql.debugDump()"],
    },
  };
}
