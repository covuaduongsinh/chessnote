// Thin cross-plug API for chess-core (plugs/chess/), mirroring
// plugs/index/plug_api.ts, plugs/chess-themes/plug_api.ts and
// plugs/chess-engine/plug_api.ts: every export just forwards to the syscall
// this plug's manifest registers, so callers in other chess-* plugs never
// import chess-core's actual widget/rendering logic directly.
import { syscall } from "@silverbulletmd/silverbullet/syscall";
import type { ParseTree } from "@silverbulletmd/silverbullet/lib/tree";
import type { FrontMatter } from "./external_syscalls.ts";
import type { ChessGameObject } from "./index.ts";

export function isRepertoirePage(frontmatter: FrontMatter): Promise<boolean> {
  return syscall("chess.isRepertoirePage", frontmatter);
}

export function extractChessGames(
  pageName: string,
  tree: ParseTree,
): Promise<ChessGameObject[]> {
  return syscall("chess.extractChessGames", pageName, tree);
}

export function extractKeywords(question: string): Promise<string[]> {
  return syscall("chess.textExtractKeywords", question);
}

export function renderStaticBoardHtml(
  fen: string,
  opts: {
    orientation?: "white" | "black";
    title?: string;
    showFen?: boolean;
    pieceSet?: string;
    boardTheme?: string;
  } = {},
): Promise<string> {
  return syscall("chess.renderStaticBoardHtml", fen, opts);
}

export function getChessCss(): Promise<string> {
  return syscall("chess.getCss");
}
