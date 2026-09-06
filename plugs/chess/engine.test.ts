import { describe, expect, test } from "vitest";
import { parseUciInfoLine, centipawnsToWinChance, formatScore } from "./engine/uci_protocol.ts";
import { reviewGame, evaluatePositionHeuristic } from "./engine/game_reviewer.ts";
import { Chess } from "chess.js";

describe("Chess Engine & Game Review Unit Tests", () => {
  test("parseUciInfoLine correctly parses depth, score cp, nodes, pv", () => {
    const line = "info depth 16 seldepth 22 score cp 145 nodes 152340 nps 1200000 time 127 pv e2e4 c7c5 g1f3";
    const info = parseUciInfoLine(line);
    
    expect(info).not.toBeNull();
    expect(info?.depth).toBe(16);
    expect(info?.seldepth).toBe(22);
    expect(info?.scoreCp).toBe(145);
    expect(info?.nodes).toBe(152340);
    expect(info?.pv).toEqual(["e2e4", "c7c5", "g1f3"]);
  });

  test("parseUciInfoLine correctly parses mate in X", () => {
    const line = "info depth 20 score mate 3 pv f7f8q g8f8 d1d8";
    const info = parseUciInfoLine(line);
    
    expect(info?.scoreMate).toBe(3);
    expect(info?.scoreCp).toBeUndefined();
    expect(formatScore(undefined, 3)).toBe("+M3");
    expect(formatScore(undefined, -2)).toBe("-M2");
  });

  test("centipawnsToWinChance calculates proper winning probability", () => {
    expect(Math.round(centipawnsToWinChance(0))).toBe(50);
    expect(centipawnsToWinChance(200)).toBeGreaterThan(65);
    expect(centipawnsToWinChance(-200)).toBeLessThan(35);
  });

  test("evaluatePositionHeuristic evaluates standard positions", () => {
    const startPos = new Chess();
    const evalStart = evaluatePositionHeuristic(startPos);
    expect(Math.abs(evalStart)).toBeLessThanOrEqual(100); // Equal starting balance within 1 pawn mobility

    const whiteUpQueen = new Chess("rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    expect(evaluatePositionHeuristic(whiteUpQueen)).toBeGreaterThan(800);
  });

  test("reviewGame generates accuracy percentages and move classifications", () => {
    const pgn = `[Event "Short Game"]
[White "Player 1"]
[Black "Player 2"]
[Result "1-0"]

1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0`;

    const report = reviewGame(pgn);
    expect(report.whiteAccuracy).toBeGreaterThan(70);
    expect(report.blackAccuracy).toBeLessThanOrEqual(100);
    expect(report.moves.length).toBe(7);
    expect(report.moves[6].san).toBe("Qxf7#");
    expect(report.whiteStats.best + report.whiteStats.good + report.whiteStats.brilliant + report.whiteStats.book).toBeGreaterThan(0);
    expect(report.advantageGraph.length).toBe(7);
  });
});
