import { describe, expect, test } from "vitest";
import {
  BOARD_THEMES,
  DEFAULT_BOARD_THEME,
  generateBoardThemeCss,
  getBoardTheme,
} from "./board_themes.ts";
import {
  DEFAULT_PIECE_SET,
  getPieceSet,
  PIECE_SETS,
  PIECE_SETS_META,
} from "./piece_sets.ts";

describe("board_themes", () => {
  test("defines all standard themes", () => {
    const themeIds = [
      "textbook",
      "wood",
      "green",
      "blue",
      "maple",
      "monochrome",
      "parchment",
      "dark",
    ];
    for (const id of themeIds) {
      expect(BOARD_THEMES[id as keyof typeof BOARD_THEMES]).toBeDefined();
      const theme = BOARD_THEMES[id as keyof typeof BOARD_THEMES];
      expect(theme.light).toMatch(/^#|^rgba/);
      expect(theme.dark).toMatch(/^#|^rgba/);
      expect(theme.border).toMatch(/^#|^rgba/);
    }
  });

  test("getBoardTheme fallback to default", () => {
    expect(getBoardTheme().id).toBe(DEFAULT_BOARD_THEME);
    expect(getBoardTheme("invalid-theme").id).toBe(DEFAULT_BOARD_THEME);
    expect(getBoardTheme("wood").id).toBe("wood");
    expect(getBoardTheme("GREEN").id).toBe("green");
  });

  test("generateBoardThemeCss produces valid CSS variables", () => {
    const css = generateBoardThemeCss(BOARD_THEMES.textbook);
    expect(css).toContain("--sq-light:");
    expect(css).toContain("--sq-dark:");
    expect(css).toContain("--board-border:");
  });
});

describe("piece_sets", () => {
  const pieceKeys = [
    "wK",
    "wQ",
    "wR",
    "wB",
    "wN",
    "wP",
    "bK",
    "bQ",
    "bR",
    "bB",
    "bN",
    "bP",
  ];
  const setNames = [
    "merida",
    "alpha",
    "leipzig",
    "maestro",
    "cburnett",
    "spatial",
  ] as const;

  test("all piece sets contain all 12 standard chess pieces in valid SVG format", () => {
    for (const set of setNames) {
      const pieces = PIECE_SETS[set];
      expect(pieces).toBeDefined();
      for (const k of pieceKeys) {
        expect(pieces[k]).toBeDefined();
        expect(pieces[k]).toContain("<svg");
        expect(pieces[k]).toContain("</svg>");
      }
    }
  });

  test("piece sets metadata is defined with name and description", () => {
    for (const set of setNames) {
      const meta = PIECE_SETS_META[set];
      expect(meta).toBeDefined();
      expect(meta.name).toBeTruthy();
      expect(meta.nameVi).toBeTruthy();
      expect(meta.description).toBeTruthy();
    }
  });

  test("getPieceSet fallback to Merida", () => {
    expect(getPieceSet()).toBe(PIECE_SETS[DEFAULT_PIECE_SET]);
    expect(getPieceSet("non-existent")).toBe(PIECE_SETS[DEFAULT_PIECE_SET]);
    expect(getPieceSet("alpha")).toBe(PIECE_SETS.alpha);
    expect(getPieceSet("LEIPZIG")).toBe(PIECE_SETS.leipzig);
  });
});
