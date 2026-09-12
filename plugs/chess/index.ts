import {
  collectNodesOfType,
  findNodeOfType,
  type ParseTree,
} from "@silverbulletmd/silverbullet/lib/tree";
import { index } from "@silverbulletmd/silverbullet/syscalls";
import type { IndexTreeEvent } from "@silverbulletmd/silverbullet/type/event";
import type { ObjectValue } from "@silverbulletmd/silverbullet/type/index";
import { Chess } from "chess.js";
import { normalize } from "./text_normalize.ts";
import {
  deleteAiAnnotationsForPage,
  deleteEmbeddingsForPage,
  deleteGamesForPage,
  deleteRepertoireLinesForPage,
  extractFrontMatter,
  type FrontMatter,
  syncAiAnnotationFromFrontmatter,
  upsertGames,
} from "./external_syscalls.ts";

/**
 * One `chess-game` object per ```pgn``` code block found on a page. Header
 * fields only — the raw PGN is kept too so downstream AI features (trend
 * analysis, tagging, related-game search) don't have to re-open the page to
 * get move text, but no engine evaluation happens here: this indexer must
 * stay fast, it runs on every save via the same indexQueue as tags/headers.
 */
export interface ChessGameFields {
  page: string;
  pgn: string;
  white: string;
  black: string;
  result: string;
  date: string;
  eco: string;
  event: string;
  /** Move-annotation comments (PGN `{...}` text), space-joined. Empty if none. */
  comments: string;
  /** Raw `WhiteElo`/`BlackElo` PGN headers, e.g. "1850" or "?" — unparsed, empty if absent. */
  whiteElo: string;
  blackElo: string;
  /** Raw `TimeControl` PGN header, e.g. "180+2". */
  timeControl: string;
  /** Raw `Opening`/`Variation` PGN headers — full opening name, not just ECO. Empty if the source PGN didn't include them. */
  opening: string;
  variation: string;
}

export type ChessGameObject = ObjectValue<ChessGameFields>;

export function extractChessGames(
  pageName: string,
  tree: ParseTree,
): ChessGameObject[] {
  const games: ChessGameObject[] = [];
  for (const t of collectNodesOfType(tree, "FencedCode")) {
    const codeInfoNode = findNodeOfType(t, "CodeInfo");
    if (!codeInfoNode || codeInfoNode.children![0].text! !== "pgn") {
      continue;
    }
    const codeTextNode = findNodeOfType(t, "CodeText");
    if (!codeTextNode) {
      continue;
    }
    const pgn = codeTextNode.children![0].text!.trim();
    if (!pgn) {
      continue;
    }
    let header: Record<string, string | null>;
    let comments: string;
    try {
      const chess = new Chess();
      chess.loadPgn(pgn);
      header = chess.header();
      comments = chess
        .getComments()
        .map((c) => c.comment)
        .join(" ");
    } catch {
      // Same "don't index garbage" stance as the other indexers: a page
      // mid-edit with a half-typed PGN block just doesn't get a chess-game
      // object yet, rather than throwing and losing the rest of the page's
      // index (tags, headers, search, ...).
      continue;
    }
    games.push({
      ref: `${pageName}@${t.from!}`,
      tag: "chess-game",
      range: [codeTextNode.from!, codeTextNode.to!],
      page: pageName,
      pgn,
      white: header["White"] || "",
      black: header["Black"] || "",
      result: header["Result"] || "*",
      date: header["Date"] || "",
      eco: header["ECO"] || "",
      event: header["Event"] || "",
      comments,
      whiteElo: header["WhiteElo"] || "",
      blackElo: header["BlackElo"] || "",
      timeControl: header["TimeControl"] || "",
      opening: header["Opening"] || "",
      variation: header["Variation"] || "",
    });
  }
  return games;
}

/**
 * Templates (`meta/template/page` for page templates like the built-in
 * Library/Chess/Templates/*, `meta/template/slash` for slash-command
 * snippets like Library/Chess/Slash_Templates/insert-pgn) embed PGN headers
 * as either unresolved Space Lua interpolations like `${page.white}` —
 * meaningless (and, read directly, a Lua "attempt to index a nil value"
 * error baked into the text) until instantiated into a real page — or
 * literal placeholder values ("White"/"Black"/"*"). Cross-note AI features
 * need real games, not templates/snippets, so any `meta/template*` page is
 * excluded from `chess-game` indexing entirely.
 */
export function isTemplatePage(frontmatter: FrontMatter): boolean {
  return (frontmatter.tags || []).some(
    (t) => t === "meta/template" || t.startsWith("meta/template/"),
  );
}

/**
 * Repertoire pages (`tags: repertoire`, see
 * libraries/Library/Chess/Templates/Opening_Repertoire.md) embed ```pgn```
 * blocks too — one per line/variation (Phase 4 of the DBMS plan) — but those
 * aren't real played games (`White: "Repertoire Master"` placeholder, etc.).
 * Routed to plugs/chess-repertoire/index.ts's own indexer instead, excluded
 * here the same way isTemplatePage() excludes templates, so they don't
 * pollute chess_games/trends/related-games/QA with fake games.
 */
export function isRepertoirePage(frontmatter: FrontMatter): boolean {
  return (frontmatter.tags || []).includes("repertoire");
}

/**
 * Text blob fed into the FTS5 index (Phase 2 of the DBMS plan): metadata +
 * tags/AI summary from the page's frontmatter + PGN move comments, all
 * normalized (diacritics stripped, lowercased) via
 * plugs/chess/text_normalize.ts so it matches the same normalization
 * applied to search keywords in plugs/chess-ai/qa.ts (via chess/plug_api.ts).
 */
function frontmatterSummary(frontmatter: FrontMatter): string {
  return typeof frontmatter.chessSummary === "string"
    ? frontmatter.chessSummary
    : "";
}

function buildSearchBlob(
  game: ChessGameObject,
  frontmatter: FrontMatter,
): string {
  const tags = (frontmatter.tags || []).join(" ");
  return normalize(
    [
      game.white,
      game.black,
      game.eco,
      game.event,
      tags,
      frontmatterSummary(frontmatter),
      game.comments,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

/**
 * Registered directly against `page:index` (chess.plug.yaml), independent
 * of the `index` plug's own indexPage() pipeline. Safe to do so: queue.ts
 * clears a page's whole index once before dispatching page:index, and
 * index.indexObjects() only upserts the keys it's given rather than
 * replacing everything already stored for the page — so this and the
 * index plug's tags/headers/etc indexing don't step on each other.
 */
export async function indexChessGames({ name, tree }: IndexTreeEvent) {
  const frontmatter = await extractFrontMatter(tree);
  if (isTemplatePage(frontmatter) || isRepertoirePage(frontmatter)) {
    return;
  }
  const games = extractChessGames(name, tree);
  if (games.length > 0) {
    await index.indexObjects<ChessGameObject>(name, games);
  }
  // Same clear-then-repopulate lifecycle as the Object Index above (see the
  // module comment): drop this page's SQLite rows before re-adding whatever
  // ```pgn``` blocks currently exist, so edits/removals aren't left stale.
  // Includes ai_annotations (Phase 5b) and game_embeddings (Phase 5) — a
  // removed ```pgn``` block's ref shouldn't leave a stale annotation or
  // embedding row behind either. Embeddings aren't recomputed here (only via
  // the explicit "Chess: Tính embedding ngữ nghĩa" command) — this just
  // invalidates the now-stale one, same as chess-game-review's cache
  // invalidation (see ai/trends.ts's module comment).
  await deleteGamesForPage(name);
  await deleteAiAnnotationsForPage(name);
  await deleteEmbeddingsForPage(name);
  if (games.length > 0) {
    await upsertGames(
      games.map((g) => ({
        ref: g.ref,
        page: g.page,
        white: g.white,
        black: g.black,
        result: g.result,
        dateRaw: g.date,
        eco: g.eco,
        event: g.event,
        summary: frontmatterSummary(frontmatter),
        searchBlob: buildSearchBlob(g, frontmatter),
        whiteEloRaw: g.whiteElo,
        blackEloRaw: g.blackElo,
        timeControl: g.timeControl,
        opening: g.opening,
        variation: g.variation,
      })),
    );
    // Phase 5b: keep the structured summary/tags mirror in step with the
    // page's own frontmatter on every save — never touches
    // confidence/model_version/generated_at (see chess_sql_store.ts's
    // syncAiAnnotationFromFrontmatter doc comment for why).
    for (const g of games) {
      await syncAiAnnotationFromFrontmatter({
        ref: g.ref,
        page: g.page,
        summary: frontmatterSummary(frontmatter),
        tags: frontmatter.tags || [],
      });
    }
  }
}

/**
 * Companion to indexChessGames for full page deletion: `page:index` is never
 * dispatched for a deleted page (plugs/index/queue.ts returns early once the
 * page read 404s), so without this, a deleted page's rows would outlive it
 * in the SQLite cache (the Object Index doesn't need this — it's cleared via
 * index.clearFileIndex() directly in that same early-return path).
 */
export async function deleteChessGamesForPage(pageName: string) {
  await deleteGamesForPage(pageName);
  await deleteAiAnnotationsForPage(pageName);
  await deleteEmbeddingsForPage(pageName);
  // Harmless no-op DELETE if pageName was never a repertoire page — no need
  // to re-read the (now-deleted) page's frontmatter just to check first.
  await deleteRepertoireLinesForPage(pageName);
}
