import { describe, expect, test, vi } from "vitest";

// chess.ts now fetches piece-set/board-theme data (chess-themes) and move
// lists (chess-engine) via its own local external_syscalls.ts wrapper (a
// syscall, not a direct import — see that file's module comment) — mock
// that boundary with the real theme/engine-free data so these tests exercise
// real content without needing a live syscall dispatcher.
vi.mock("./external_syscalls.ts", async () => {
  const boardThemes = await import("../chess-themes/board_themes.ts");
  const pieceSets = await import("../chess-themes/piece_sets.ts");
  const gameReviewer = await import("../chess-engine/game_reviewer.ts");
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
    buildMoveList: (pgn: string) =>
      Promise.resolve(gameReviewer.buildMoveList(pgn)),
  };
});

const { applyMove, applySan, fenWidget, legalMoves, pgnWidget, puzzleWidget } =
  await import("./chess.ts");

describe("Chess Plug Unit Tests", () => {
  test("fenWidget generates valid HTML and SVG board for starting position", async () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const result = await fenWidget(fen, "TestPage");

    expect(result).toBeDefined();
    expect(result.html).toContain("chessnote-container");
    expect(result.html).toContain("chess-board");
    expect(result.html).toContain("Flip");
    expect(result.script).toContain("initialFen");
    expect(result.script).toContain(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR",
    );
  });

  test("fenWidget handles options like orientation, title, arrows, and highlights", async () => {
    const fenText = `r1bqkb1r/pppp1ppp/2n5/4p3/2B1n3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4
| title: Traxler Counterattack
| orientation: black
| arrows: c4-f7:red, f3-e5:green
| highlights: f7:red, e5:green`;

    const result = await fenWidget(fenText, "TestPage");
    expect(result.html).toContain("Traxler Counterattack");
    expect(result.script).toContain("black");
    expect(result.script).toContain("c4-f7:red");
  });

  test("pgnWidget parses PGN header, moves, and generates move tree", async () => {
    const pgn = `[Event "World Championship 2024"]
[White "Ding, Liren"]
[Black "Gukesh, D"]
[Result "0-1"]

1. d4 Nf6 2. c4 e6 3. Nc3 Bb4 0-1`;

    const result = await pgnWidget(pgn, "TestPage");
    expect(result.html).toContain("Ding, Liren vs Gukesh, D (0-1)");
    expect(result.html).toContain("World Championship 2024");
    expect(result.html).toContain("chess-pgn-tree");
    expect(result.script).toContain("Bb4");
    expect(result.script).toContain("reviewedMoves");
  });

  test("puzzleWidget parses puzzle FEN, turn, solution, and hint", async () => {
    const puzzleText = `fen: r1bqk2r/pp2bppp/2n1p3/2ppP3/3P4/2PB1N2/P1P2PPP/R1BQK2R w KQkq - 0 8
turn: white
solution: Bxh7+ Kxh7 Ng5+ Kg8 Qh5
hint: Greek Gift Sacrifice
themes: Sacrifice, Attack
rating: 1650`;

    const result = await puzzleWidget(puzzleText, "TestPage");
    expect(result.html).toContain("Tactics Puzzle • Rating: 1650");
    expect(result.html).toContain("Greek Gift Sacrifice");
    expect(result.script).toContain("Bxh7+");
    expect(result.script).toContain("Qh5");
  });

  // --- Real move-generation/validation behavior (the click-to-move engine
  // room, exposed as syscalls for the widget iframes — see chess.plug.yaml).
  // Unlike the tests above, these check actual chess.js-backed behavior, not
  // just that some substring appears in generated HTML/script.

  test("legalMoves returns real legal destinations for a piece, respecting check/pins", async () => {
    const start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const moves = legalMoves(start, "e2");
    expect(moves.map((m) => m.to).sort()).toEqual(["e3", "e4"]);

    // A pinned piece has no legal moves that expose the king: black queen on
    // e7 pins the white knight on e2 to the white king on e1 along the
    // e-file — a knight can never move along its own pin line, so it has no
    // legal moves at all here.
    const pinned = "k7/4q3/8/8/8/8/4N3/4K3 w - - 0 1";
    expect(legalMoves(pinned, "e2")).toEqual([]);
  });

  test("legalMoves flags promotion moves", async () => {
    const fen = "k7/4P3/8/8/8/8/8/4K3 w - - 0 1";
    const moves = legalMoves(fen, "e7");
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every((m) => m.promotion)).toBe(true);
  });

  test("legalMoves returns [] for an empty square or invalid FEN", async () => {
    const start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    expect(legalMoves(start, "e4")).toEqual([]);
    expect(legalMoves("not a fen", "e2")).toEqual([]);
  });

  test("applyMove plays a real legal move and reports the resulting position", async () => {
    const start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const result = applyMove(start, "e2", "e4") as any;
    expect(result.error).toBeUndefined();
    expect(result.san).toBe("e4");
    expect(result.fen).toContain(
      "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b",
    );
    expect(result.turn).toBe("b");
  });

  test("applyMove rejects an illegal move instead of silently doing nothing", async () => {
    const start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const result = applyMove(start, "e2", "e5") as any;
    expect(result.error).toBeDefined();
    expect(result.fen).toBeUndefined();
  });

  test("applySan chain detects checkmate (fool's mate: 1.f3 e5 2.g4 Qh4#)", async () => {
    const start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    let r = applySan(start, "f3") as any;
    expect(r.error).toBeUndefined();
    r = applySan(r.fen, "e5") as any;
    expect(r.error).toBeUndefined();
    r = applySan(r.fen, "g4") as any;
    expect(r.error).toBeUndefined();
    r = applySan(r.fen, "Qh4") as any;
    expect(r.error).toBeUndefined();
    expect(r.isCheckmate).toBe(true);
    expect(r.isGameOver).toBe(true);
  });

  test("applySan rejects a SAN move that doesn't match any legal move", async () => {
    const start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const result = applySan(start, "Qh5") as any;
    expect(result.error).toBeDefined();
  });

  // --- Honest error states instead of silently substituting/discarding bad
  // input (Giai đoạn 0/1: "đừng nuốt lỗi im lặng").

  test("fenWidget returns a visible error state for invalid FEN instead of silently falling back", async () => {
    const result: any = await fenWidget("not-a-real-fen", "TestPage");
    expect(result.script).toBeUndefined();
    expect(result.html).toContain("FEN không hợp lệ");
  });

  test("pgnWidget returns a visible error state for invalid PGN instead of silently resetting", async () => {
    const result: any = await pgnWidget("this is not a pgn {{{", "TestPage");
    expect(result.script).toBeUndefined();
    expect(result.html).toContain("PGN không hợp lệ");
  });

  test("puzzleWidget requires a solution to be gradable", async () => {
    const result: any = await puzzleWidget(
      "fen: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1\nturn: white",
      "TestPage",
    );
    expect(result.script).toBeUndefined();
    expect(result.html).toContain("thiếu đáp án");
  });

  // Regression test: the shipped demo puzzle (libraries/Library/Chess/Demo.md,
  // and the default INDEX.md content in build/build_client.ts) once had a FEN
  // whose king hadn't castled combined with a solution ("Kxh7") that's only
  // legal after castling — an illegal move a real solver would immediately
  // discover and be stuck on. Guard against that class of bug: any puzzle's
  // solution must be a fully legal move sequence against its own FEN.
  test("demo puzzle's solution is a fully legal move sequence against its FEN (chess.js-verified)", async () => {
    const fen = "5rk1/5ppp/8/8/8/3B1N2/8/3QKR2 w - - 0 1";
    const solution = ["Bxh7+", "Kxh7", "Ng5+", "Kg8", "Qh5"];
    let currentFen = fen;
    for (const san of solution) {
      const result = applySan(currentFen, san) as any;
      expect(result.error, `move "${san}" from ${currentFen}`).toBeUndefined();
      currentFen = result.fen;
    }
  });
});
