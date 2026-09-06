import { describe, expect, test } from "vitest";
import { fenWidget, pgnWidget, puzzleWidget } from "./chess.ts";

describe("Chess Plug Unit Tests", () => {
  test("fenWidget generates valid HTML and SVG board for starting position", async () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const result = await fenWidget(fen, "TestPage");
    
    expect(result).toBeDefined();
    expect(result.html).toContain("chessnote-container");
    expect(result.html).toContain("chess-board");
    expect(result.html).toContain("Flip");
    expect(result.script).toContain("initialFen");
    expect(result.script).toContain("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR");
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
});
