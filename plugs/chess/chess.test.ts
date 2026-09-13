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

  test("fenWidget renders a board-editor toggle/palette and its embedded script has no JS syntax errors", async () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const result: any = await fenWidget(fen, "TestPage");

    expect(result.html).toContain("Sửa bàn cờ");
    expect(result.html).toContain("edit_palette");
    // Castling rights + en-passant controls (Giai đoạn 2, 2026-09-13) --
    // added alongside the existing piece palette/turn radios/FEN input.
    expect(result.html).toContain("edit_castle_K");
    expect(result.html).toContain("edit_castle_Q");
    expect(result.html).toContain("edit_castle_k");
    expect(result.html).toContain("edit_castle_q");
    expect(result.html).toContain("edit_ep_select");
    // `new Function` only parses the source (never executes it, since the
    // script assumes a real DOM/syscall bridge) -- catches the exact class
    // of embedded-template-literal typo that's easy to introduce and easy
    // to miss by eye in a multi-hundred-line inline <script>.
    expect(() => new Function(result.script)).not.toThrow();
  });

  test("fenWidget's board-editor script also parses cleanly for a kingless FEN", async () => {
    const result: any = await fenWidget("8/8/8/8/3R4/8/8/8 w - - 0 1", "TestPage");
    expect(() => new Function(result.script)).not.toThrow();
  });

  // --- Board-editor castling/en-passant geometry (Giai đoạn 2, 2026-09-13) ---
  //
  // computeCastlingAvailability/computeEnPassantCandidates live inline inside
  // the widget's embedded <script> (no DOM here to actually mount it and
  // click checkboxes -- see the module comment on `new Function` above), so
  // this pulls the REAL shipped function source out of result.script by name
  // (brace-balanced, not a hand-copied reimplementation that could silently
  // drift from what's actually deployed) and exercises it directly.
  function extractFunction(script: string, name: string): (...args: any[]) => any {
    const start = script.indexOf(`function ${name}(`);
    if (start === -1) throw new Error(`function ${name} not found in script`);
    const braceStart = script.indexOf("{", start);
    let depth = 0;
    let i = braceStart;
    for (; i < script.length; i++) {
      if (script[i] === "{") depth++;
      else if (script[i] === "}") {
        depth--;
        if (depth === 0) break;
      }
    }
    const source = script.slice(start, i + 1);
    return new Function(`${source}; return ${name};`)();
  }

  test("computeCastlingAvailability requires the king AND rook both on their home square", async () => {
    const result: any = await fenWidget("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "TestPage");
    const compute = extractFunction(result.script, "computeCastlingAvailability");

    expect(compute({ e1: "wK", h1: "wR", a1: "wR", e8: "bK", h8: "bR", a8: "bR" })).toEqual({
      K: true,
      Q: true,
      k: true,
      q: true,
    });
    // h1 rook missing -> only White kingside is lost.
    expect(compute({ e1: "wK", a1: "wR", e8: "bK", h8: "bR", a8: "bR" })).toEqual({
      K: false,
      Q: true,
      k: true,
      q: true,
    });
    // King not on e1 at all -> both White rights lost, Black unaffected.
    expect(compute({ e2: "wK", h1: "wR", a1: "wR", e8: "bK", h8: "bR", a8: "bR" })).toEqual({
      K: false,
      Q: false,
      k: true,
      q: true,
    });
    expect(compute({})).toEqual({ K: false, Q: false, k: false, q: false });
  });

  test("computeEnPassantCandidates only offers a square behind an opposing pawn that could have just double-stepped", async () => {
    const result: any = await fenWidget("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "TestPage");
    const compute = extractFunction(result.script, "computeEnPassantCandidates");

    // White to move: black pawn on e5, e6/e7 empty -> e6 is a candidate.
    expect(compute({ e5: "bP" }, "w")).toEqual(["e6"]);
    // e7 occupied -> the pawn couldn't have come from there, no candidate.
    expect(compute({ e5: "bP", e7: "bP" }, "w")).toEqual([]);
    // e6 (the target square itself) occupied -> not a candidate either.
    expect(compute({ e5: "bP", e6: "wP" }, "w")).toEqual([]);
    // Black to move: white pawn on d4, d2/d3 empty -> d3 is a candidate.
    expect(compute({ d4: "wP" }, "b")).toEqual(["d3"]);
    // Nothing set up -> no candidates.
    expect(compute({}, "w")).toEqual([]);
    // Two independent double-steps -> both offered (a legitimate ambiguity
    // an editor can't resolve from a static board alone).
    expect(compute({ a5: "bP", h5: "bP" }, "w")).toEqual(["a6", "h6"]);
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

  // --- Kingless teaching diagrams (e.g. "every square a lone rook
  // controls") — see fen_utils.ts's openChessLenient.

  test("legalMoves still computes real destinations for a piece on a kingless FEN", async () => {
    const loneRook = "8/8/8/8/3R4/8/8/8 w - - 0 1";
    const moves = legalMoves(loneRook, "d4");
    // A rook alone on an empty board controls its full rank + file (7 + 7).
    expect(moves.length).toBe(14);
  });

  test("applyMove still plays a real move on a kingless FEN", async () => {
    const loneRook = "8/8/8/8/3R4/8/8/8 w - - 0 1";
    const result = applyMove(loneRook, "d4", "d8") as any;
    expect(result.error).toBeUndefined();
    expect(result.fen).toContain("3R4/8/8/8/8/8/8/8 b");
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

  test("fenWidget renders a diagram (not an error) for a FEN missing one or both kings", async () => {
    const noKingsAtAll = "8/8/8/8/3R4/8/8/8 w - - 0 1";
    const missingBlackKing = "4K3/8/8/8/3R4/8/8/8 w - - 0 1";
    for (const fen of [noKingsAtAll, missingBlackKing]) {
      const result: any = await fenWidget(fen, "TestPage");
      expect(result.html).not.toContain("FEN không hợp lệ");
      expect(result.html).toContain("chessnote-container");
      // Engine Eval makes no sense without a real position — hidden instead
      // of silently returning a meaningless evaluation.
      expect(result.html).toContain("Minh hoạ chiến thuật");
      expect(result.html).toMatch(/_eval_toggle"[^>]*display: none/);
    }
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
