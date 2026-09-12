import { describe, expect, test, vi } from "vitest";

// board_renderer.ts now fetches piece-set/board-theme data from the
// chess-themes plug via a syscall (chess-core's own external_syscalls.ts)
// instead of importing it directly — see the same mock rationale in
// chess.test.ts.
vi.mock("./external_syscalls.ts", async () => {
  const boardThemes = await import("../chess-themes/board_themes.ts");
  const pieceSets = await import("../chess-themes/piece_sets.ts");
  return {
    getPieceSet: (name?: string) =>
      Promise.resolve(pieceSets.getPieceSet(name)),
    getAllPieceSets: () => Promise.resolve(pieceSets.getAllPieceSets()),
    getBoardTheme: (id?: string) =>
      Promise.resolve(boardThemes.getBoardTheme(id)),
    getAllBoardThemes: () => Promise.resolve(boardThemes.getAllBoardThemes()),
    generateBoardThemeCss: (theme: unknown) =>
      Promise.resolve(
        boardThemes.generateBoardThemeCss(
          theme as Parameters<typeof boardThemes.generateBoardThemeCss>[0],
        ),
      ),
  };
});

const { renderStaticBoardHtml } = await import("./board_renderer.ts");

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
// Two kings only, no other pieces — enough to be a valid FEN for chess.js
// (which requires exactly one king per side) while keeping every other
// square empty, so the coloring test below isn't obscured by piece markup.
const KINGS_ONLY_FEN = "k7/8/8/8/8/8/8/7K w - - 0 1";

describe("renderStaticBoardHtml", () => {
  test("renders 64 squares with all 32 starting pieces placed", async () => {
    const html = await renderStaticBoardHtml(START_FEN);
    expect((html.match(/class="chess-sq /g) || []).length).toBe(64);
    expect((html.match(/class="chess-piece"/g) || []).length).toBe(32);
  });

  test("labels the a-file and rank 1 on the edge squares", async () => {
    const html = await renderStaticBoardHtml(START_FEN);
    expect(html).toContain('coord-file">a<');
    expect(html).toContain('coord-rank">1<');
  });

  // Standard board coloring: a1 dark, h1 light, a8 light, h8 dark. Squares
  // are emitted in display order (row-major, white orientation = board order).
  test("corner squares match standard chessboard coloring", async () => {
    const html = await renderStaticBoardHtml(KINGS_ONLY_FEN);
    const squares = html.match(/<div class="chess-sq [a-z]+">/g) || [];
    expect(squares).toHaveLength(64);
    expect(squares[0]).toContain("light"); // a8
    expect(squares[7]).toContain("dark"); // h8
    expect(squares[56]).toContain("dark"); // a1
    expect(squares[63]).toContain("light"); // h1
  });

  test("black orientation renders a different square order than white", async () => {
    const white = await renderStaticBoardHtml(KINGS_ONLY_FEN, {
      orientation: "white",
    });
    const black = await renderStaticBoardHtml(KINGS_ONLY_FEN, {
      orientation: "black",
    });
    expect(white).not.toBe(black);
    // Same coloring rule still holds under the flip: h8 (now bottom-left) is dark.
    const blackSquares = black.match(/<div class="chess-sq [a-z]+">/g) || [];
    expect(blackSquares[56]).toContain("dark"); // h8 under black orientation
  });

  test("invalid FEN returns an error banner instead of throwing", async () => {
    const html = await renderStaticBoardHtml("not a fen");
    expect(html).toContain("chess-error-banner");
    expect(html).toContain("không hợp lệ");
  });

  test("renders a kingless teaching diagram instead of an error banner", async () => {
    const loneRook = "8/8/8/8/3R4/8/8/8 w - - 0 1";
    const html = await renderStaticBoardHtml(loneRook);
    expect(html).not.toContain("chess-error-banner");
    expect((html.match(/class="chess-piece"/g) || []).length).toBe(1);
  });

  test("includes the title when given", async () => {
    const html = await renderStaticBoardHtml(START_FEN, {
      title: "Vị trí khai cuộc",
    });
    expect(html).toContain("Vị trí khai cuộc");
  });

  test("shows the FEN itself in a footer for reference", async () => {
    const html = await renderStaticBoardHtml(START_FEN);
    expect(html).toContain(START_FEN);
  });

  test("hides the FEN footer when showFen is false", async () => {
    const html = await renderStaticBoardHtml(START_FEN, { showFen: false });
    expect(html).not.toContain(START_FEN);
    expect(html).not.toContain("fen-footer");
  });

  test("renders custom pieceSet and boardTheme", async () => {
    const html = await renderStaticBoardHtml(START_FEN, {
      pieceSet: "leipzig",
      boardTheme: "wood",
    });
    expect(html).toContain("chessnote-static-board");
    expect(html).toContain("--sq-light: #f0d9b5;");
    expect(html).toContain("--sq-dark: #b58863;");
    expect(html).toContain("<svg");
  });
});
