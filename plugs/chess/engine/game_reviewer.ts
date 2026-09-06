import { Chess } from "chess.js";
import { centipawnsToWinChance, formatScore } from "./uci_protocol.ts";

export type MoveClassification =
  | "brilliant" // !!
  | "great" // !
  | "best" // Best engine move
  | "good" // Minor difference
  | "inaccuracy" // ?! (CPL 30 - 75)
  | "mistake" // ? (CPL 75 - 150)
  | "blunder" // ?? (CPL > 150)
  | "book"; // Opening book move

export interface ReviewedMove {
  moveNum: number;
  isWhite: boolean;
  san: string;
  from: string;
  to: string;
  fenBefore: string;
  fenAfter: string;
  scoreBefore: number; // in centipawns from perspective of side to move
  scoreAfter: number;
  cpl: number; // Centipawn loss (>= 0)
  classification: MoveClassification;
  bestMoveSan?: string;
}

export interface GameReviewReport {
  whiteAccuracy: number; // 0 - 100%
  blackAccuracy: number; // 0 - 100%
  whiteStats: Record<MoveClassification, number>;
  blackStats: Record<MoveClassification, number>;
  moves: ReviewedMove[];
  advantageGraph: { moveIdx: number; score: number }[]; // Scores from White perspective
}

/**
 * Fast Heuristic Positional & Material Evaluator for client-side rapid Game Review
 * Returns centipawns from White's perspective (+ = White better, - = Black better)
 */
export function evaluatePositionHeuristic(chess: Chess): number {
  if (chess.isGameOver()) {
    if (chess.isCheckmate()) {
      return chess.turn() === "w" ? -10000 : 10000;
    }
    return 0; // Draw (stalemate, repetition, etc.)
  }

  const board = chess.board();
  const pieceValues: Record<string, number> = {
    p: 100,
    n: 320,
    b: 330,
    r: 500,
    q: 900,
    k: 20000,
  };

  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!piece) continue;

      const val = pieceValues[piece.type] || 0;
      // Positional center bonus (d4, e4, d5, e5, c4, f4, c5, f5)
      let centerBonus = 0;
      if ((r === 3 || r === 4) && (c === 3 || c === 4)) centerBonus = 25;
      else if ((r >= 2 && r <= 5) && (c >= 2 && c <= 5)) centerBonus = 10;

      // Pawn advance bonus
      let pawnRankBonus = 0;
      if (piece.type === "p") {
        pawnRankBonus = piece.color === "w" ? (7 - r) * 5 : r * 5;
      }

      const totalPieceScore = val + centerBonus + pawnRankBonus;
      if (piece.color === "w") {
        score += totalPieceScore;
      } else {
        score -= totalPieceScore;
      }
    }
  }

  // Mobility bonus (number of legal moves)
  const mobility = chess.moves().length;
  if (chess.turn() === "w") {
    score += mobility * 3;
  } else {
    score -= mobility * 3;
  }

  return score;
}

/**
 * Reviews an entire PGN game and classifies every move
 */
export function reviewGame(pgn: string): GameReviewReport {
  const chess = new Chess();
  chess.loadPgn(pgn);

  const history = chess.history({ verbose: true });
  const sim = new Chess();

  const emptyStats = (): Record<MoveClassification, number> => ({
    brilliant: 0,
    great: 0,
    best: 0,
    good: 0,
    inaccuracy: 0,
    mistake: 0,
    blunder: 0,
    book: 0,
  });

  const whiteStats = emptyStats();
  const blackStats = emptyStats();
  const reviewedMoves: ReviewedMove[] = [];
  const advantageGraph: { moveIdx: number; score: number }[] = [];

  let totalWhiteWinLoss = 0;
  let totalBlackWinLoss = 0;
  let whiteMoveCount = 0;
  let blackMoveCount = 0;

  for (let i = 0; i < history.length; i++) {
    const move = history[i];
    const isWhite = i % 2 === 0;
    const fenBefore = sim.fen();
    const scoreBeforeWhite = evaluatePositionHeuristic(sim);

    // Get legal moves and find the best one according to evaluator
    const legalMoves = sim.moves({ verbose: true });
    let bestMoveSan = move.san;
    let bestMoveScore = isWhite ? -Infinity : Infinity;

    for (const cand of legalMoves) {
      sim.move(cand.san);
      const candScore = evaluatePositionHeuristic(sim);
      sim.undo();

      if (isWhite) {
        if (candScore > bestMoveScore) {
          bestMoveScore = candScore;
          bestMoveSan = cand.san;
        }
      } else {
        if (candScore < bestMoveScore) {
          bestMoveScore = candScore;
          bestMoveSan = cand.san;
        }
      }
    }

    // Execute actual played move
    sim.move(move.san);
    const fenAfter = sim.fen();
    const scoreAfterWhite = evaluatePositionHeuristic(sim);

    advantageGraph.push({ moveIdx: i, score: scoreAfterWhite });

    // Calculate CPL
    let cpl = 0;
    if (isWhite) {
      cpl = Math.max(0, bestMoveScore - scoreAfterWhite);
    } else {
      cpl = Math.max(0, scoreAfterWhite - bestMoveScore);
    }

    // Calculate win % delta
    const winBefore = centipawnsToWinChance(isWhite ? scoreBeforeWhite : -scoreBeforeWhite);
    const winAfter = centipawnsToWinChance(isWhite ? scoreAfterWhite : -scoreAfterWhite);
    const winLoss = Math.max(0, winBefore - winAfter);

    if (isWhite) {
      totalWhiteWinLoss += winLoss;
      whiteMoveCount++;
    } else {
      totalBlackWinLoss += winLoss;
      blackMoveCount++;
    }

    // Classification
    let classification: MoveClassification = "good";
    if (i < 6) {
      classification = "book";
    } else if (cpl === 0 || move.san === bestMoveSan) {
      // Check if it was a piece sacrifice that gives winning advantage (Brilliant !!)
      if ((move.san.includes("x") || move.captured) && Math.abs(scoreAfterWhite) > 300) {
        classification = "brilliant";
      } else {
        classification = "best";
      }
    } else if (cpl <= 30) {
      classification = "good";
    } else if (cpl <= 85) {
      classification = "inaccuracy";
    } else if (cpl <= 180) {
      classification = "mistake";
    } else {
      classification = "blunder";
    }

    if (isWhite) {
      whiteStats[classification]++;
    } else {
      blackStats[classification]++;
    }

    reviewedMoves.push({
      moveNum: Math.floor(i / 2) + 1,
      isWhite,
      san: move.san,
      from: move.from,
      to: move.to,
      fenBefore,
      fenAfter,
      scoreBefore: isWhite ? scoreBeforeWhite : -scoreBeforeWhite,
      scoreAfter: isWhite ? scoreAfterWhite : -scoreAfterWhite,
      cpl,
      classification,
      bestMoveSan,
    });
  }

  const whiteAccuracy = whiteMoveCount > 0
    ? Math.max(40, Math.min(99.5, 100 - (totalWhiteWinLoss / whiteMoveCount) * 2.2))
    : 100;
  const blackAccuracy = blackMoveCount > 0
    ? Math.max(40, Math.min(99.5, 100 - (totalBlackWinLoss / blackMoveCount) * 2.2))
    : 100;

  return {
    whiteAccuracy: parseFloat(whiteAccuracy.toFixed(1)),
    blackAccuracy: parseFloat(blackAccuracy.toFixed(1)),
    whiteStats,
    blackStats,
    moves: reviewedMoves,
    advantageGraph,
  };
}
