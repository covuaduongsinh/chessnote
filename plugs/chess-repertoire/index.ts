// Sổ tay Khai cuộc (Repertoire) — Phase 4 của
// docs/plans/2026-09-11-dbms-sqlite-wasm-tich-hop.md.
//
// Quyết định thiết kế nội dung (xem plan doc để biết lý do đầy đủ): mỗi
// "line" (biến) là MỘT khối ```pgn``` riêng trên trang repertoire — không
// dùng cú pháp biến thể ngoặc đơn (RAV) của PGN, vì chess.js không giữ lại
// RAV khi loadPgn()/history() (đã xác minh: buildMoveList() ở
// engine/game_reviewer.ts chỉ đọc dòng chính). Tái dùng nguyên vẹn cách quét
// mọi khối ```pgn``` trên trang mà extractChessGames() (../index.ts) đã có,
// tránh phải tự viết trình đọc RAV.
import {
  collectNodesOfType,
  findNodeOfType,
  type ParseTree,
} from "@silverbulletmd/silverbullet/lib/tree";
import type { IndexTreeEvent } from "@silverbulletmd/silverbullet/type/event";
import { Chess } from "chess.js";
import {
  extractFrontMatter,
  type FrontMatter,
  isRepertoirePage,
  syncRepertoireLinesForPage,
} from "./external_syscalls.ts";

export interface RepertoireLineDraft {
  ref: string;
  page: string;
  side: string;
  eco: string;
  openingName: string;
  variationName: string;
  movesSan: string;
}

/**
 * `side`/`eco`/`openingName` come from the PAGE's own frontmatter (see
 * libraries/Library/Chess/Templates/Opening_Repertoire.md: `side`, `eco`,
 * `openingName`) — one repertoire page is one opening, potentially many
 * lines/variations. `variationName` is per-block, read from that block's own
 * `[Variation "..."]` PGN tag so each line can be labeled individually.
 */
export function extractRepertoireLines(
  pageName: string,
  tree: ParseTree,
  frontmatter: FrontMatter,
): RepertoireLineDraft[] {
  const side = typeof frontmatter.side === "string" ? frontmatter.side : "";
  const eco = typeof frontmatter.eco === "string" ? frontmatter.eco : "";
  const openingName =
    typeof frontmatter.openingName === "string" ? frontmatter.openingName : "";

  const lines: RepertoireLineDraft[] = [];
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
    let movesSan: string;
    let variationName: string;
    try {
      const chess = new Chess();
      chess.loadPgn(pgn);
      movesSan = chess.history().join(" ");
      variationName = chess.header()["Variation"] || "";
    } catch {
      // Same "don't index garbage" stance as extractChessGames() — a
      // half-typed block mid-edit just doesn't get a line yet.
      continue;
    }
    if (!movesSan) continue;
    lines.push({
      ref: `${pageName}@${t.from!}`,
      page: pageName,
      side,
      eco,
      openingName,
      variationName,
      movesSan,
    });
  }
  return lines;
}

/**
 * Registered against `page:index` alongside (not instead of) indexChessGames
 * (../index.ts) — the two mutually exclude each other via
 * isTemplatePage()/isRepertoirePage() checks on the same frontmatter, so a
 * page is routed to exactly one of the two indexers.
 *
 * Uses chessSql.syncRepertoireLinesForPage(), NOT a
 * delete-then-repopulate — see that method's doc comment in
 * chess_sql_store.ts for why a blanket clear would destroy SRS review state
 * on every save.
 */
export async function indexRepertoireLines({ name, tree }: IndexTreeEvent) {
  const frontmatter = await extractFrontMatter(tree);
  if (!(await isRepertoirePage(frontmatter))) {
    return;
  }
  const lines = extractRepertoireLines(name, tree, frontmatter);
  await syncRepertoireLinesForPage(name, lines);
}
