// Embedded SQLite WASM cache for chess games — originally Phase 1 of the
// DBMS integration (docs/plans/2026-09-11-dbms-sqlite-wasm-tich-hop.md), now
// its own plug (docs/plans/2026-09-12-lam-plug-co-vua-cai-dat-doc-lap.md):
// runs entirely inside this plug's own Web Worker sandbox, the same way
// plugs/chess-engine/arasan_engine.ts runs the Arasan WASM engine — nothing
// about SQLite WASM actually needs the client main thread; that was a
// design assumption from the original DBMS plan doc, not a real Worker
// sandbox limitation (see the ADR in MEMORY.md for the full story).
//
// The wasm binary is embedded directly into this plug's bundle (esbuild's
// `binary` loader, client/plugos/plug_compile.ts) rather than loaded from a
// Library asset like arasan_engine.ts's engine binary: unlike Arasan (a
// genuinely optional, heavy engine users opt into per Space), chess-db is a
// foundational dependency of chess-ai/chess-repertoire/chess — it must work
// out of the box, in every Space, with no separate "Library: Install" step
// (an earlier version of this file tried the Library-asset route and it
// silently no-oped in any Space that hadn't installed that Library, since
// nothing auto-provisions optional Library files into existing Spaces).
//
// Proof of concept for real SQL (filter + GROUP BY) over indexed games,
// something the Object Index's prefix-scan-then-filter-in-JS model can't
// do. Deliberately just a rebuildable cache, same philosophy as the Object
// Index (ADR-002 in MEMORY.md): an in-memory `:memory:` database, wiped and
// rebuilt from the space's PGN blocks on every reload. No OPFS persistence
// — cross-platform OPFS support is uneven, and rebuild cost is negligible
// at the game counts this app deals with today.
//
// The public sqlite-wasm .d.ts intentionally omits `sqlite3InitModule`'s
// parameter list (https://github.com/sqlite/sqlite-wasm/pull/129), even
// though the underlying Emscripten module still honors an options object at
// runtime (confirmed against dist/index.mjs). SQLITE3_INIT casts around
// that to pass `wasmBinary` and skip the network fetch entirely.
//
// `locateFile` is required too, not just `wasmBinary`: dist/index.mjs's
// findWasmBinary() always computes a `wasmBinaryFile` key (used only for an
// internal cache-equality check, `file == wasmBinaryFile && wasmBinary`)
// via `new URL("sqlite3.wasm", import.meta.url)` UNLESS `Module.locateFile`
// is set — and `import.meta.url` isn't a valid URL base once this module is
// esbuild-bundled into a plug and evaluated inside the worker sandbox's
// blob-URL context, so that `new URL()` throws synchronously ("Invalid
// URL"), silently failing init() (caught below) even though `wasmBinary`
// bytes were already supplied and the fetch itself was never needed.
// Passing `locateFile` sidesteps that dead code path entirely; the string
// it returns is never actually fetched.

import type {
  Database,
  Sqlite3Static,
  SqlValue,
} from "@sqlite.org/sqlite-wasm";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
// esbuild's `binary` loader (client/plugos/plug_compile.ts) turns this into
// an embedded Uint8Array at build time — see client/types/wasm_asset.d.ts.
import sqlite3Wasm from "@sqlite.org/sqlite-wasm/sqlite3.wasm";
import { parsePgnDateToIso } from "./chess_pgn_date.ts";
import { parseEloToInt } from "./chess_pgn_fields.ts";
import { type SrsGrade, sm2Update } from "./srs_sm2.ts";

type Sqlite3InitFn = (opts?: {
  wasmBinary?: Uint8Array;
  locateFile?: (path: string) => string;
}) => Promise<Sqlite3Static>;
const SQLITE3_INIT = sqlite3InitModule as unknown as Sqlite3InitFn;

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS chess_games (
     ref TEXT PRIMARY KEY,
     page TEXT NOT NULL,
     white TEXT,
     black TEXT,
     result TEXT,
     date_raw TEXT,
     date_parsed TEXT,
     eco TEXT,
     event TEXT,
     summary TEXT,
     white_elo INTEGER,
     black_elo INTEGER,
     time_control TEXT,
     opening TEXT,
     variation TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS idx_chess_games_page ON chess_games(page)`,
  `CREATE INDEX IF NOT EXISTS idx_chess_games_eco ON chess_games(eco)`,
  // Phase 5b: structured storage for AI-generated output, alongside (not
  // replacing) the frontmatter `chessSummary`/`tags` a user actually sees in
  // their page. `confidence`/`model_version`/`generated_at` have no
  // frontmatter equivalent — only set by upsertAiAnnotation() (called right
  // after a real AI generation), never touched by the page-save sync path
  // (syncAiAnnotationFromFrontmatter(), called from indexChessGames on every
  // reindex) which only keeps `summary`/tags in step with the page's own
  // frontmatter.
  `CREATE TABLE IF NOT EXISTS ai_annotations (
     ref TEXT PRIMARY KEY,
     page TEXT NOT NULL,
     summary TEXT,
     confidence REAL,
     model_version TEXT,
     generated_at TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS ai_annotation_tags (
     ref TEXT NOT NULL,
     tag TEXT NOT NULL,
     PRIMARY KEY (ref, tag)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_ai_annotation_tags_tag ON ai_annotation_tags(tag)`,
  // Phase 4: Sổ tay Khai cuộc (Repertoire) + SRS. Unlike chess_games (a pure
  // rebuildable cache), due_date/ease_factor/interval_days/review_count/
  // last_grade are review STATE — upsertRepertoireLines() below deliberately
  // never overwrites them for a `ref` that already exists, only the fields
  // that mirror the page's own content (see its own doc comment).
  `CREATE TABLE IF NOT EXISTS repertoire_lines (
     ref TEXT PRIMARY KEY,
     page TEXT NOT NULL,
     side TEXT,
     eco TEXT,
     opening_name TEXT,
     variation_name TEXT,
     moves_san TEXT NOT NULL,
     due_date TEXT,
     ease_factor REAL NOT NULL DEFAULT 2.5,
     interval_days INTEGER NOT NULL DEFAULT 0,
     review_count INTEGER NOT NULL DEFAULT 0,
     last_grade TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS idx_repertoire_due ON repertoire_lines(due_date)`,
  `CREATE INDEX IF NOT EXISTS idx_repertoire_page ON repertoire_lines(page)`,
  // Phase 5 (stretch): semantic search. Computed on-demand only (the
  // "Chess: Tính embedding ngữ nghĩa" command), never automatically on save
  // — same reasoning as ai/tagging.ts's module comment for why AI-adjacent
  // work never runs on autosave. `embedding` is a raw float32 BLOB (see
  // embedding_store.ts's float32ToBytes/bytesToFloat32) — ranking is
  // brute-force cosine similarity in JS (searchByEmbedding below), not a SQL
  // vector index: sqlite-vec's WASM-loadable-extension compatibility with
  // @sqlite.org/sqlite-wasm was flagged as unverified in the plan doc and
  // deliberately not depended on here.
  `CREATE TABLE IF NOT EXISTS game_embeddings (
     ref TEXT PRIMARY KEY,
     page TEXT NOT NULL,
     embedding BLOB NOT NULL,
     model_id TEXT NOT NULL,
     computed_at TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_game_embeddings_page ON game_embeddings(page)`,
];

// Created separately from SCHEMA_STATEMENTS (see init()) so a build without
// FTS5 compiled in degrades to "no search" instead of breaking every other
// table — Phase 2 of the plan doc flags this as unverified.
const FTS_SCHEMA_STATEMENT = `CREATE VIRTUAL TABLE IF NOT EXISTS chess_games_fts USING fts5(
     ref UNINDEXED,
     blob
   )`;

export interface ChessSqlGameRow {
  ref: string;
  page: string;
  white: string;
  black: string;
  result: string;
  /** Raw PGN `Date` header, e.g. "2026.09.11" or "2026.??.??". */
  dateRaw: string;
  eco: string;
  event: string;
  /** AI-generated summary (frontmatter `chessSummary`), empty if never AI-tagged. Superseded by a dedicated table in Phase 5b — kept here in Phase 2 only so search-result citations can display it without a second query. */
  summary: string;
  /** Raw PGN `WhiteElo`/`BlackElo` headers, e.g. "1850" or "?" — parsed to INTEGER (or NULL) at upsert time via parseEloToInt(). */
  whiteEloRaw: string;
  blackEloRaw: string;
  /** Raw PGN `TimeControl` header, e.g. "180+2". Stored as-is, not parsed further in Phase 3. */
  timeControl: string;
  /** Raw PGN `Opening`/`Variation` headers — full opening name, not just the ECO code. Empty if the source PGN didn't include them (common for hand-typed games). */
  opening: string;
  variation: string;
  /**
   * Pre-normalized (diacritics stripped, lowercased — see
   * plugs/chess/ai/text_normalize.ts) text blob fed into `chess_games_fts`:
   * white/black/eco/event/tags/AI summary/PGN comments joined. Empty string
   * is fine (game just won't surface in text search).
   */
  searchBlob: string;
}

export interface SearchGamesQuery {
  /** Already-normalized keywords (see plugs/chess/ai/text_normalize.ts) — matched as an FTS5 prefix OR query, not required to all match. */
  keywords: string[];
  limit: number;
}

export interface SearchGameRow {
  ref: string;
  page: string;
  white: string;
  black: string;
  result: string;
  eco: string;
  event: string;
  summary: string;
}

export interface OpeningStatsQuery {
  playerName: string;
  /** ISO 8601 date (YYYY-MM-DD); only games with a fully-specified, parseable PGN date on/after this are counted. */
  sinceDate?: string;
}

export interface OpeningStatsRow {
  eco: string;
  wins: number;
  losses: number;
  draws: number;
  total: number;
}

export interface RelatedGamesQuery {
  /** Excluded from results — the game currently being viewed. */
  page: string;
  /** null when the current game's white/black is a placeholder name ("White"/"Black"/"") — the caller (plugs/chess/related_games.ts) already filtered that via meaningfulName(), this layer just does the SQL match. */
  white: string | null;
  black: string | null;
  eco: string;
  limit: number;
}

export interface RelatedGameCandidateRow {
  page: string;
  white: string;
  black: string;
  result: string;
  eco: string;
  score: number;
}

/** Full write, right after a real AI generation — sets confidence/model attribution. */
export interface AiAnnotationUpsert {
  ref: string;
  page: string;
  summary: string;
  tags: string[];
  confidence: number | null;
  modelVersion: string;
}

/** Page-save sync write (indexChessGames) — keeps summary/tags in step with frontmatter, leaves confidence/model/generated_at whatever they last were (or NULL if never AI-annotated). */
export interface AiAnnotationFrontmatterSync {
  ref: string;
  page: string;
  summary: string;
  tags: string[];
}

/** Mirrors a repertoire page's own content — never touches review state (see repertoire_lines' schema comment). */
export interface RepertoireLineUpsert {
  ref: string;
  page: string;
  side: string;
  eco: string;
  openingName: string;
  variationName: string;
  movesSan: string;
}

export interface RepertoireLineRow {
  ref: string;
  page: string;
  side: string;
  eco: string;
  openingName: string;
  variationName: string;
  movesSan: string;
  dueDate: string | null;
  easeFactor: number;
  intervalDays: number;
  reviewCount: number;
  lastGrade: string | null;
}

export interface EmbeddingUpsert {
  ref: string;
  page: string;
  /** Raw float32 bytes — see embedding_store.ts's float32ToBytes(). */
  embedding: Uint8Array;
  modelId: string;
}

export interface EmbeddingRow {
  ref: string;
  embedding: Uint8Array;
}

// --- debugDump()'s row shapes (see that method's doc comment) ---

export interface DebugChessGameRow {
  ref: string;
  page: string;
  white: string;
  black: string;
  result: string;
  dateRaw: string;
  eco: string;
  event: string;
  summary: string;
  whiteElo: number | null;
  blackElo: number | null;
  timeControl: string;
  opening: string;
  variation: string;
}

export interface DebugAiAnnotationRow {
  ref: string;
  page: string;
  summary: string;
  confidence: number | null;
  modelVersion: string | null;
  generatedAt: string | null;
  /** Comma-joined via GROUP_CONCAT — a debug view, not meant for parsing back. */
  tags: string;
}

export interface DebugEmbeddingRow {
  ref: string;
  page: string;
  modelId: string;
  computedAt: string;
}

export interface DebugDump {
  chessGames: DebugChessGameRow[];
  aiAnnotations: DebugAiAnnotationRow[];
  repertoireLines: RepertoireLineRow[];
  embeddings: DebugEmbeddingRow[];
  /** Whether this WASM build has FTS5 (Phase 2's searchGames() silently no-ops without it — see chess_games_fts's schema comment). */
  ftsAvailable: boolean;
}

export class ChessSqlStore {
  private db: Database | undefined;
  private ftsAvailable = false;
  private readonly whenReady: Promise<void>;

  constructor() {
    this.whenReady = this.init().catch((e) => {
      // Every public method below degrades to a no-op/empty-result when
      // `this.db` stays undefined, so a WASM init failure (unsupported
      // browser, out of memory, ...) doesn't break page indexing or the
      // "Chess: Thống kê khai cuộc" command — it just means no SQL stats,
      // same "rebuildable cache" fallback stance as the rest of Phase 1.
      console.error(
        "[chess-sql] Không khởi tạo được SQLite WASM, tính năng SQL sẽ tắt:",
        e,
      );
    });
  }

  private async init(): Promise<void> {
    const sqlite3 = await SQLITE3_INIT({
      wasmBinary: sqlite3Wasm,
      locateFile: (path) => path,
    });
    const db = new sqlite3.oo1.DB(":memory:");
    for (const statement of SCHEMA_STATEMENTS) {
      db.exec(statement);
    }
    try {
      db.exec(FTS_SCHEMA_STATEMENT);
      this.ftsAvailable = true;
    } catch (e) {
      console.error(
        "[chess-sql] Bản dựng SQLite WASM này không có FTS5, tắt tìm kiếm toàn văn:",
        e,
      );
    }
    this.db = db;
  }

  private async ensureDb(): Promise<Database | undefined> {
    await this.whenReady;
    return this.db;
  }

  async upsertGames(games: ChessSqlGameRow[]): Promise<void> {
    if (games.length === 0) return;
    const db = await this.ensureDb();
    if (!db) return;
    db.transaction(() => {
      for (const g of games) {
        db.exec(
          `INSERT INTO chess_games
             (ref, page, white, black, result, date_raw, date_parsed, eco, event, summary,
              white_elo, black_elo, time_control, opening, variation)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(ref) DO UPDATE SET
             page = excluded.page,
             white = excluded.white,
             black = excluded.black,
             result = excluded.result,
             date_raw = excluded.date_raw,
             date_parsed = excluded.date_parsed,
             eco = excluded.eco,
             event = excluded.event,
             summary = excluded.summary,
             white_elo = excluded.white_elo,
             black_elo = excluded.black_elo,
             time_control = excluded.time_control,
             opening = excluded.opening,
             variation = excluded.variation`,
          {
            bind: [
              g.ref,
              g.page,
              g.white,
              g.black,
              g.result,
              g.dateRaw,
              parsePgnDateToIso(g.dateRaw),
              g.eco,
              g.event,
              g.summary,
              parseEloToInt(g.whiteEloRaw),
              parseEloToInt(g.blackEloRaw),
              g.timeControl,
              g.opening,
              g.variation,
            ],
          },
        );
        if (this.ftsAvailable) {
          // FTS5 has no ON CONFLICT/unique-constraint upsert — delete then
          // reinsert, same net effect for a table keyed by `ref`.
          db.exec(`DELETE FROM chess_games_fts WHERE ref = ?`, {
            bind: [g.ref],
          });
          db.exec(`INSERT INTO chess_games_fts (ref, blob) VALUES (?, ?)`, {
            bind: [g.ref, g.searchBlob],
          });
        }
      }
    });
  }

  async deleteGamesForPage(page: string): Promise<void> {
    const db = await this.ensureDb();
    if (!db) return;
    if (this.ftsAvailable) {
      // Must run before the chess_games delete below — it looks up which
      // refs belong to this page via chess_games itself.
      db.exec(
        `DELETE FROM chess_games_fts WHERE ref IN (SELECT ref FROM chess_games WHERE page = ?)`,
        { bind: [page] },
      );
    }
    db.exec(`DELETE FROM chess_games WHERE page = ?`, { bind: [page] });
  }

  /** Full-text search over white/black/eco/event/tags/AI summary/PGN comments (see ChessSqlGameRow.searchBlob), ranked by FTS5 bm25(). Empty array if the WASM build lacks FTS5 or no keywords/games match. */
  async searchGames(query: SearchGamesQuery): Promise<SearchGameRow[]> {
    const db = await this.ensureDb();
    if (!db || !this.ftsAvailable || query.keywords.length === 0) return [];

    // Prefix match per keyword ("kw*"), ORed together — closest FTS5
    // equivalent to the old substring-scan semantics (see plan doc §Phase 2).
    const matchQuery = query.keywords
      .map((k) => `"${k.replace(/"/g, '""')}"*`)
      .join(" OR ");

    const rows = db.exec(
      `SELECT g.ref AS ref, g.page AS page, g.white AS white, g.black AS black,
              g.result AS result, g.eco AS eco, g.event AS event, g.summary AS summary
       FROM chess_games_fts f
       JOIN chess_games g ON g.ref = f.ref
       WHERE f.blob MATCH ?
       ORDER BY bm25(chess_games_fts)
       LIMIT ?`,
      {
        bind: [matchQuery, query.limit],
        rowMode: "object",
        returnValue: "resultRows",
      },
    );
    return rows as unknown as SearchGameRow[];
  }

  /** Groups indexed games by ECO code and tallies wins/losses/draws for the given player's color in each game — real `GROUP BY` SQL, not a JS scan-and-filter. */
  async queryOpeningStats(
    query: OpeningStatsQuery,
  ): Promise<OpeningStatsRow[]> {
    const db = await this.ensureDb();
    if (!db || !query.playerName) return [];

    const conditions = ["(white = ? OR black = ?)"];
    const bind: SqlValue[] = [query.playerName, query.playerName];
    if (query.sinceDate) {
      conditions.push("date_parsed >= ?");
      bind.push(query.sinceDate);
    }

    const rows = db.exec(
      `SELECT
         COALESCE(NULLIF(eco, ''), '(không rõ)') AS eco,
         SUM(CASE
           WHEN (white = ? AND result = '1-0') OR (black = ? AND result = '0-1')
           THEN 1 ELSE 0
         END) AS wins,
         SUM(CASE
           WHEN (white = ? AND result = '0-1') OR (black = ? AND result = '1-0')
           THEN 1 ELSE 0
         END) AS losses,
         SUM(CASE WHEN result = '1/2-1/2' THEN 1 ELSE 0 END) AS draws,
         COUNT(*) AS total
       FROM chess_games
       WHERE ${conditions.join(" AND ")}
       GROUP BY eco
       ORDER BY total DESC`,
      {
        bind: [
          query.playerName,
          query.playerName,
          query.playerName,
          query.playerName,
          ...bind,
        ],
        rowMode: "object",
        returnValue: "resultRows",
      },
    );
    return rows as unknown as OpeningStatsRow[];
  }

  /**
   * Scores candidate games for "related to the game currently being viewed":
   * +3 same ECO, +2 shares a player name (case-insensitive) with either side
   * of the current game. Filtering/scoring/sorting/limiting happens here in
   * SQL; the human-readable "reasons" text is rebuilt in TS from the
   * returned rows (see plugs/chess/related_games.ts's
   * buildRelatedGameReasons()) — that part stays pure/testable.
   */
  async queryRelatedGames(
    query: RelatedGamesQuery,
  ): Promise<RelatedGameCandidateRow[]> {
    const db = await this.ensureDb();
    if (!db) return [];

    const rows = db.exec(
      `SELECT * FROM (
         SELECT page, white, black, result, eco,
           (CASE WHEN eco = ? AND ? != '' THEN 3 ELSE 0 END) +
           (CASE WHEN
              (? IS NOT NULL AND (white = ? COLLATE NOCASE OR black = ? COLLATE NOCASE))
              OR (? IS NOT NULL AND (white = ? COLLATE NOCASE OR black = ? COLLATE NOCASE))
            THEN 2 ELSE 0 END) AS score
         FROM chess_games
         WHERE page != ?
       )
       WHERE score > 0
       ORDER BY score DESC
       LIMIT ?`,
      {
        bind: [
          query.eco,
          query.eco,
          query.white,
          query.white,
          query.white,
          query.black,
          query.black,
          query.black,
          query.page,
          query.limit,
        ],
        rowMode: "object",
        returnValue: "resultRows",
      },
    );
    return rows as unknown as RelatedGameCandidateRow[];
  }

  private replaceAnnotationTags(
    db: Database,
    ref: string,
    tags: string[],
  ): void {
    db.exec(`DELETE FROM ai_annotation_tags WHERE ref = ?`, { bind: [ref] });
    for (const tag of tags) {
      db.exec(`INSERT INTO ai_annotation_tags (ref, tag) VALUES (?, ?)`, {
        bind: [ref, tag],
      });
    }
  }

  /** Full write after a real AI generation — see AiAnnotationUpsert. */
  async upsertAiAnnotation(annotation: AiAnnotationUpsert): Promise<void> {
    const db = await this.ensureDb();
    if (!db) return;
    db.transaction(() => {
      db.exec(
        `INSERT INTO ai_annotations (ref, page, summary, confidence, model_version, generated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(ref) DO UPDATE SET
           page = excluded.page,
           summary = excluded.summary,
           confidence = excluded.confidence,
           model_version = excluded.model_version,
           generated_at = excluded.generated_at`,
        {
          bind: [
            annotation.ref,
            annotation.page,
            annotation.summary,
            annotation.confidence,
            annotation.modelVersion,
            new Date().toISOString(),
          ],
        },
      );
      this.replaceAnnotationTags(db, annotation.ref, annotation.tags);
    });
  }

  /** Page-save sync — see AiAnnotationFrontmatterSync. Always upserts (even to empty summary/no tags) so manually clearing `chessSummary`/tags from frontmatter is reflected here too — same "SQL mirrors the page" stance as chess_games. */
  async syncAiAnnotationFromFrontmatter(
    sync: AiAnnotationFrontmatterSync,
  ): Promise<void> {
    const db = await this.ensureDb();
    if (!db) return;
    db.transaction(() => {
      db.exec(
        `INSERT INTO ai_annotations (ref, page, summary, confidence, model_version, generated_at)
         VALUES (?, ?, ?, NULL, NULL, NULL)
         ON CONFLICT(ref) DO UPDATE SET
           page = excluded.page,
           summary = excluded.summary`,
        { bind: [sync.ref, sync.page, sync.summary] },
      );
      this.replaceAnnotationTags(db, sync.ref, sync.tags);
    });
  }

  async deleteAiAnnotationsForPage(page: string): Promise<void> {
    const db = await this.ensureDb();
    if (!db) return;
    db.exec(
      `DELETE FROM ai_annotation_tags WHERE ref IN (SELECT ref FROM ai_annotations WHERE page = ?)`,
      { bind: [page] },
    );
    db.exec(`DELETE FROM ai_annotations WHERE page = ?`, { bind: [page] });
  }

  private static readonly REPERTOIRE_SELECT_COLUMNS = `ref, page, side, eco,
           opening_name AS openingName,
           variation_name AS variationName,
           moves_san AS movesSan,
           due_date AS dueDate,
           ease_factor AS easeFactor,
           interval_days AS intervalDays,
           review_count AS reviewCount,
           last_grade AS lastGrade`;

  /** Upserts repertoire lines without wrapping its own transaction — see RepertoireLineUpsert's doc comment: existing review state (due_date/ease_factor/interval_days/review_count/last_grade) is never touched here, only content fields. New refs get SRS defaults (matching the table's own column defaults) via the INSERT branch. Callers own the transaction (sqlite-wasm forbids nesting them) — see syncRepertoireLinesForPage, the sole caller. */
  private upsertRepertoireLinesInner(
    db: Database,
    lines: RepertoireLineUpsert[],
  ): void {
    for (const l of lines) {
      db.exec(
        `INSERT INTO repertoire_lines
           (ref, page, side, eco, opening_name, variation_name, moves_san)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(ref) DO UPDATE SET
           page = excluded.page,
           side = excluded.side,
           eco = excluded.eco,
           opening_name = excluded.opening_name,
           variation_name = excluded.variation_name,
           moves_san = excluded.moves_san`,
        {
          bind: [
            l.ref,
            l.page,
            l.side,
            l.eco,
            l.openingName,
            l.variationName,
            l.movesSan,
          ],
        },
      );
    }
  }

  async deleteRepertoireLinesForPage(page: string): Promise<void> {
    const db = await this.ensureDb();
    if (!db) return;
    db.exec(`DELETE FROM repertoire_lines WHERE page = ?`, { bind: [page] });
  }

  /**
   * The reindex entry point plugs/chess/repertoire/index.ts calls on every
   * page save — NOT a blanket clear-then-repopulate like chess_games'
   * lifecycle (that would wipe review state on every edit). Instead: upsert
   * the given lines (preserving state for refs that still exist, per
   * upsertRepertoireLines), then delete only the refs that belonged to this
   * page before but aren't in `lines` anymore (a variation block the user
   * removed).
   *
   * Skips the stale-ref cleanup step entirely when `lines` is empty — a page
   * transiently parsing to zero valid ```pgn``` blocks (mid-edit, like
   * chess_games already tolerates) must never be read as "delete every line
   * on this page," since that would permanently destroy SRS progress rather
   * than just needing a rebuild like the pure-cache tables do.
   */
  async syncRepertoireLinesForPage(
    page: string,
    lines: RepertoireLineUpsert[],
  ): Promise<void> {
    const db = await this.ensureDb();
    if (!db) return;
    db.transaction(() => {
      if (lines.length > 0) {
        const placeholders = lines.map(() => "?").join(", ");
        db.exec(
          `DELETE FROM repertoire_lines WHERE page = ? AND ref NOT IN (${placeholders})`,
          { bind: [page, ...lines.map((l) => l.ref)] },
        );
      }
      this.upsertRepertoireLinesInner(db, lines);
    });
  }

  /** Lines due today or never reviewed, earliest-due first — the "Ôn tập khai cuộc" command's queue. */
  async getDueRepertoireLines(limit: number): Promise<RepertoireLineRow[]> {
    const db = await this.ensureDb();
    if (!db) return [];
    const rows = db.exec(
      `SELECT ${ChessSqlStore.REPERTOIRE_SELECT_COLUMNS}
       FROM repertoire_lines
       WHERE due_date IS NULL OR due_date <= date('now')
       ORDER BY due_date ASC
       LIMIT ?`,
      { bind: [limit], rowMode: "object", returnValue: "resultRows" },
    );
    return rows as unknown as RepertoireLineRow[];
  }

  /** Applies an SRS grade to one line (sm2Update — client/data/srs_sm2.ts) and persists the result. Returns null if the ref doesn't exist. */
  async recordRepertoireReview(
    ref: string,
    grade: SrsGrade,
  ): Promise<RepertoireLineRow | null> {
    const db = await this.ensureDb();
    if (!db) return null;

    const existing = db.exec(
      `SELECT ease_factor AS easeFactor, interval_days AS intervalDays, review_count AS reviewCount
       FROM repertoire_lines WHERE ref = ?`,
      { bind: [ref], rowMode: "object", returnValue: "resultRows" },
    ) as unknown as {
      easeFactor: number;
      intervalDays: number;
      reviewCount: number;
    }[];
    if (existing.length === 0) return null;

    const updated = sm2Update(existing[0], grade);
    db.exec(
      `UPDATE repertoire_lines
       SET ease_factor = ?, interval_days = ?, review_count = ?, due_date = ?, last_grade = ?
       WHERE ref = ?`,
      {
        bind: [
          updated.easeFactor,
          updated.intervalDays,
          updated.reviewCount,
          updated.dueDate,
          grade,
          ref,
        ],
      },
    );

    const rows = db.exec(
      `SELECT ${ChessSqlStore.REPERTOIRE_SELECT_COLUMNS} FROM repertoire_lines WHERE ref = ?`,
      { bind: [ref], rowMode: "object", returnValue: "resultRows" },
    );
    return (rows as unknown as RepertoireLineRow[])[0] ?? null;
  }

  async upsertEmbedding(e: EmbeddingUpsert): Promise<void> {
    const db = await this.ensureDb();
    if (!db) return;
    db.exec(
      `INSERT INTO game_embeddings (ref, page, embedding, model_id, computed_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(ref) DO UPDATE SET
         page = excluded.page,
         embedding = excluded.embedding,
         model_id = excluded.model_id,
         computed_at = excluded.computed_at`,
      {
        bind: [e.ref, e.page, e.embedding, e.modelId, new Date().toISOString()],
      },
    );
  }

  async deleteEmbeddingsForPage(page: string): Promise<void> {
    const db = await this.ensureDb();
    if (!db) return;
    db.exec(`DELETE FROM game_embeddings WHERE page = ?`, { bind: [page] });
  }

  /** Whether any game has a computed embedding yet — qa.ts uses this to decide between semantic search and the Phase 2 FTS5 fallback. */
  async hasAnyEmbeddings(): Promise<boolean> {
    const db = await this.ensureDb();
    if (!db) return false;
    const rows = db.exec(`SELECT 1 FROM game_embeddings LIMIT 1`, {
      rowMode: "array",
      returnValue: "resultRows",
    });
    return (rows as unknown[]).length > 0;
  }

  /** Every stored (ref, embedding) pair — the brute-force cosine-ranking candidate set (see the game_embeddings schema comment for why there's no SQL-side vector index in this phase). */
  async getAllEmbeddings(): Promise<EmbeddingRow[]> {
    const db = await this.ensureDb();
    if (!db) return [];
    const rows = db.exec(`SELECT ref, embedding FROM game_embeddings`, {
      rowMode: "object",
      returnValue: "resultRows",
    });
    return rows as unknown as EmbeddingRow[];
  }

  /** Fetches display fields for a specific set of refs, in no particular order — callers (chessEmbedding.search) apply their own ranking order on top. */
  async getGamesByRefs(refs: string[]): Promise<SearchGameRow[]> {
    if (refs.length === 0) return [];
    const db = await this.ensureDb();
    if (!db) return [];
    const placeholders = refs.map(() => "?").join(", ");
    const rows = db.exec(
      `SELECT ref, page, white, black, result, eco, event, summary
       FROM chess_games WHERE ref IN (${placeholders})`,
      { bind: refs, rowMode: "object", returnValue: "resultRows" },
    );
    return rows as unknown as SearchGameRow[];
  }

  /**
   * Full dump of every table this store owns — no UI anywhere else shows
   * white_elo/black_elo/time_control/opening/variation (Phase 3),
   * ai_annotations/ai_annotation_tags (Phase 5b), or game_embeddings' rows
   * (Phase 5), so this is the one place to actually SEE that data short of a
   * DevTools console session against `client.clientSystem.chessSqlStore`
   * directly. Used by plugs/chess/ai/debug_dump.ts's "Chess: Kiểm tra dữ
   * liệu SQLite (debug)" command — not meant for anything else, hence
   * everything in one wide call rather than composable narrow ones.
   */
  async debugDump(): Promise<DebugDump> {
    const db = await this.ensureDb();
    if (!db) {
      return {
        chessGames: [],
        aiAnnotations: [],
        repertoireLines: [],
        embeddings: [],
        ftsAvailable: this.ftsAvailable,
      };
    }

    const chessGames = db.exec(
      `SELECT ref, page, white, black, result, date_raw AS dateRaw, eco, event, summary,
              white_elo AS whiteElo, black_elo AS blackElo, time_control AS timeControl,
              opening, variation
       FROM chess_games ORDER BY page`,
      { rowMode: "object", returnValue: "resultRows" },
    ) as unknown as DebugChessGameRow[];

    const aiAnnotations = db.exec(
      `SELECT a.ref AS ref, a.page AS page, a.summary AS summary, a.confidence AS confidence,
              a.model_version AS modelVersion, a.generated_at AS generatedAt,
              COALESCE(
                (SELECT GROUP_CONCAT(tag, ', ') FROM ai_annotation_tags t WHERE t.ref = a.ref),
                ''
              ) AS tags
       FROM ai_annotations a ORDER BY a.page`,
      { rowMode: "object", returnValue: "resultRows" },
    ) as unknown as DebugAiAnnotationRow[];

    const repertoireLines = db.exec(
      `SELECT ${ChessSqlStore.REPERTOIRE_SELECT_COLUMNS} FROM repertoire_lines ORDER BY page`,
      { rowMode: "object", returnValue: "resultRows" },
    ) as unknown as RepertoireLineRow[];

    const embeddings = db.exec(
      `SELECT ref, page, model_id AS modelId, computed_at AS computedAt
       FROM game_embeddings ORDER BY page`,
      { rowMode: "object", returnValue: "resultRows" },
    ) as unknown as DebugEmbeddingRow[];

    return {
      chessGames,
      aiAnnotations,
      repertoireLines,
      embeddings,
      ftsAvailable: this.ftsAvailable,
    };
  }
}
