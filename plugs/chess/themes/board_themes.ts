/**
 * Board theme definitions for ChessNote.
 * Provides curated light/dark square colors, coordinate styling,
 * selection highlights, and board border colors suitable for
 * textbook publishing, magazine diagrams, tournament play, and dark mode.
 */

export type BoardThemeId =
  | "textbook"
  | "wood"
  | "green"
  | "blue"
  | "maple"
  | "monochrome"
  | "parchment"
  | "dark";

export interface BoardTheme {
  id: BoardThemeId;
  name: string;
  nameVi: string;
  light: string;
  dark: string;
  border: string;
  select: string;
  highlight: string;
  dest: string;
  coordLight: string;
  coordDark: string;
}

export const BOARD_THEMES: Record<BoardThemeId, BoardTheme> = {
  textbook: {
    id: "textbook",
    name: "Textbook",
    nameVi: "Giáo khoa / Sách báo",
    light: "#ffffff",
    dark: "#cbd5e1",
    border: "#64748b",
    select: "rgba(37, 99, 235, 0.4)",
    highlight: "rgba(59, 130, 246, 0.35)",
    dest: "rgba(100, 116, 139, 0.4)",
    coordLight: "#64748b",
    coordDark: "#475569",
  },
  wood: {
    id: "wood",
    name: "Classic Wood",
    nameVi: "Gỗ kinh điển",
    light: "#f0d9b5",
    dark: "#b58863",
    border: "#78350f",
    select: "rgba(20, 85, 30, 0.5)",
    highlight: "rgba(255, 255, 0, 0.45)",
    dest: "rgba(20, 85, 30, 0.3)",
    coordLight: "#b58863",
    coordDark: "#f0d9b5",
  },
  green: {
    id: "green",
    name: "Tournament Green",
    nameVi: "Xanh thi đấu (USCF)",
    light: "#ffffdd",
    dark: "#86a666",
    border: "#4d6438",
    select: "rgba(30, 90, 40, 0.5)",
    highlight: "rgba(247, 247, 105, 0.5)",
    dest: "rgba(40, 100, 50, 0.35)",
    coordLight: "#86a666",
    coordDark: "#ffffdd",
  },
  blue: {
    id: "blue",
    name: "ChessBase Blue",
    nameVi: "Xanh dương hiện đại",
    light: "#dee3e6",
    dark: "#8ca2ad",
    border: "#475569",
    select: "rgba(37, 99, 235, 0.45)",
    highlight: "rgba(147, 197, 253, 0.5)",
    dest: "rgba(59, 130, 246, 0.35)",
    coordLight: "#8ca2ad",
    coordDark: "#dee3e6",
  },
  maple: {
    id: "maple",
    name: "Walnut / Maple",
    nameVi: "Gỗ cao cấp / Óc chó",
    light: "#e2d6b5",
    dark: "#b88b4a",
    border: "#6d4314",
    select: "rgba(180, 83, 9, 0.5)",
    highlight: "rgba(251, 191, 36, 0.5)",
    dest: "rgba(146, 64, 14, 0.35)",
    coordLight: "#b88b4a",
    coordDark: "#e2d6b5",
  },
  monochrome: {
    id: "monochrome",
    name: "Newspaper B&W",
    nameVi: "Báo in / Đen trắng",
    light: "#ffffff",
    dark: "#b0b0b0",
    border: "#333333",
    select: "rgba(0, 0, 0, 0.3)",
    highlight: "rgba(120, 120, 120, 0.4)",
    dest: "rgba(0, 0, 0, 0.35)",
    coordLight: "#666666",
    coordDark: "#333333",
  },
  parchment: {
    id: "parchment",
    name: "Parchment",
    nameVi: "Giấy da cổ điển",
    light: "#eadeb8",
    dark: "#cbb17b",
    border: "#7c633a",
    select: "rgba(120, 53, 15, 0.45)",
    highlight: "rgba(217, 119, 6, 0.4)",
    dest: "rgba(146, 64, 14, 0.35)",
    coordLight: "#9a824e",
    coordDark: "#eadeb8",
  },
  dark: {
    id: "dark",
    name: "Dark Slate",
    nameVi: "Giao diện tối",
    light: "#475569",
    dark: "#1e293b",
    border: "#0f172a",
    select: "rgba(124, 58, 237, 0.45)",
    highlight: "rgba(56, 189, 248, 0.4)",
    dest: "rgba(56, 189, 248, 0.35)",
    coordLight: "#94a3b8",
    coordDark: "#64748b",
  },
};

export const DEFAULT_BOARD_THEME: BoardThemeId = "textbook";

export function getBoardTheme(themeId?: string): BoardTheme {
  if (!themeId) return BOARD_THEMES[DEFAULT_BOARD_THEME];
  const normalized = themeId.toLowerCase().trim() as BoardThemeId;
  return BOARD_THEMES[normalized] || BOARD_THEMES[DEFAULT_BOARD_THEME];
}

export function generateBoardThemeCss(theme: BoardTheme): string {
  return `
    --sq-light: ${theme.light};
    --sq-dark: ${theme.dark};
    --board-border: ${theme.border};
    --sq-select: ${theme.select};
    --sq-highlight: ${theme.highlight};
    --sq-dest: ${theme.dest};
  `;
}
