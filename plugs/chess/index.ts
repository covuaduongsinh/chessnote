import { Chess } from "chess.js";
import {
  collectNodesOfType,
  findNodeOfType,
  type ParseTree,
} from "@silverbulletmd/silverbullet/lib/tree";
import { index } from "@silverbulletmd/silverbullet/syscalls";
import type { IndexTreeEvent } from "@silverbulletmd/silverbullet/type/event";
import type { ObjectValue } from "@silverbulletmd/silverbullet/type/index";
import { extractFrontMatter, type FrontMatter } from "../index/frontmatter.ts";

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
    try {
      const chess = new Chess();
      chess.loadPgn(pgn);
      header = chess.header();
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
 * Registered directly against `page:index` (chess.plug.yaml), independent
 * of the `index` plug's own indexPage() pipeline. Safe to do so: queue.ts
 * clears a page's whole index once before dispatching page:index, and
 * index.indexObjects() only upserts the keys it's given rather than
 * replacing everything already stored for the page — so this and the
 * index plug's tags/headers/etc indexing don't step on each other.
 */
export async function indexChessGames({ name, tree }: IndexTreeEvent) {
  if (isTemplatePage(extractFrontMatter(tree))) {
    return;
  }
  const games = extractChessGames(name, tree);
  if (games.length > 0) {
    await index.indexObjects<ChessGameObject>(name, games);
  }
}
