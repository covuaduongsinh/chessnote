import { Chess, validateFen } from "chess.js";

/**
 * True only when the sole defect chess.js's own validator finds in `fen` is
 * a missing white and/or black king. Every other structural/legality rule
 * (row count, piece characters, move counters, pawns on the back rank, too
 * many kings, ...) still counts as a real error.
 */
export function isMissingKingOnly(fen: string): boolean {
  const { ok, error } = validateFen(fen);
  return !ok && /missing (white|black) king/.test(error ?? "");
}

/**
 * Like `new Chess(fen)`, but tolerates a FEN with one or both kings missing —
 * needed for teaching diagrams that show a single piece's control pattern
 * (e.g. "every square a rook attacks") without a full legal position.
 * Throws for every other kind of invalid FEN, same as the strict
 * constructor.
 */
export function openChessLenient(fen: string): Chess {
  try {
    return new Chess(fen);
  } catch (e) {
    if (isMissingKingOnly(fen)) {
      return new Chess(fen, { skipValidation: true });
    }
    throw e;
  }
}

/** Whether `chess`'s current position has both a white and a black king. */
export function hasBothKings(chess: Chess): boolean {
  const pieces = chess.board().flat();
  return (
    pieces.some((p) => p?.type === "k" && p.color === "w") &&
    pieces.some((p) => p?.type === "k" && p.color === "b")
  );
}
