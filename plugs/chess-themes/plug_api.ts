// Thin cross-plug API for chess-themes, mirroring the plugs/index/plug_api.ts
// pattern: every export just forwards to the syscall this plug's manifest
// registers, so callers in other plugs (chess-core, chess-pdf-export, ...)
// never import chess-themes' actual data/logic directly — only this proxy,
// which keeps chess-themes independently buildable/removable as its own
// `.plug.js`.
import { syscall } from "@silverbulletmd/silverbullet/syscall";
import type { BoardTheme, BoardThemeId } from "./board_themes.ts";
import type { PieceSetId, PieceSetMeta } from "./piece_sets.ts";

export function getPieceSet(name?: string): Promise<Record<string, string>> {
  return syscall("chess.themes.getPieceSet", name);
}

export function getAllPieceSets(): Promise<{
  sets: Record<PieceSetId, Record<string, string>>;
  meta: Record<PieceSetId, PieceSetMeta>;
  default: PieceSetId;
}> {
  return syscall("chess.themes.getAllPieceSets");
}

export function getBoardTheme(themeId?: string): Promise<BoardTheme> {
  return syscall("chess.themes.getBoardTheme", themeId);
}

export function getAllBoardThemes(): Promise<{
  themes: Record<BoardThemeId, BoardTheme>;
  default: BoardThemeId;
}> {
  return syscall("chess.themes.getAllBoardThemes");
}

export function generateBoardThemeCss(theme: BoardTheme): Promise<string> {
  return syscall("chess.themes.generateBoardThemeCss", theme);
}
