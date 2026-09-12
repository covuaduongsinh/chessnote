// SM-2 spaced-repetition scheduling — Phase 4 of
// docs/plans/2026-09-11-dbms-sqlite-wasm-tich-hop.md (Sổ tay Khai cuộc + SRS).
// Pure/testable, kept separate from client/data/chess_sql_store.ts's WASM-backed
// repertoire_lines table for the same reason as chess_pgn_date.ts/chess_pgn_fields.ts.
//
// Classic SM-2 uses a 0-5 "quality" score; this uses a 4-button Anki-style
// grade instead (easier to derive automatically from a training attempt's
// mistake count — see plugs/chess/repertoire/trainer.ts — and friendlier if a
// manual self-grading UI is ever added).

export type SrsGrade = "again" | "hard" | "good" | "easy";

export interface SrsState {
  easeFactor: number;
  intervalDays: number;
  reviewCount: number;
}

export interface SrsUpdateResult extends SrsState {
  /** ISO 8601 date (YYYY-MM-DD) the line next comes due. */
  dueDate: string;
}

export const DEFAULT_SRS_STATE: SrsState = {
  easeFactor: 2.5,
  intervalDays: 0,
  reviewCount: 0,
};

const MIN_EASE_FACTOR = 1.3;

function addDays(date: Date, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * "again" restarts the line from scratch (same as SM-2's quality<3 reset)
 * but keeps a floor on ease so it doesn't get punished into unusable
 * intervals by one bad attempt. "hard"/"good"/"easy" grow the interval by
 * decreasing/nominal/boosted multipliers, mirroring Anki's take on SM-2 —
 * chosen over stock SM-2's 0-5 quality scale because it maps directly onto
 * the 4 outcomes a training attempt naturally produces.
 */
export function sm2Update(
  state: SrsState,
  grade: SrsGrade,
  now: Date = new Date(),
): SrsUpdateResult {
  let { easeFactor, intervalDays, reviewCount } = state;

  switch (grade) {
    case "again":
      reviewCount = 0;
      intervalDays = 1;
      easeFactor = Math.max(MIN_EASE_FACTOR, easeFactor - 0.2);
      break;
    case "hard":
      reviewCount += 1;
      intervalDays = Math.max(1, Math.round(intervalDays * 1.2));
      easeFactor = Math.max(MIN_EASE_FACTOR, easeFactor - 0.15);
      break;
    case "good":
      reviewCount += 1;
      if (reviewCount === 1) intervalDays = 1;
      else if (reviewCount === 2) intervalDays = 6;
      else intervalDays = Math.round(intervalDays * easeFactor);
      break;
    case "easy":
      reviewCount += 1;
      intervalDays =
        reviewCount === 1 ? 4 : Math.round(intervalDays * easeFactor * 1.3);
      easeFactor = easeFactor + 0.15;
      break;
  }

  return {
    easeFactor,
    intervalDays,
    reviewCount,
    dueDate: addDays(now, intervalDays),
  };
}
