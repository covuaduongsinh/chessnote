import { describe, expect, test } from "vitest";
import { DEFAULT_SRS_STATE, sm2Update } from "./srs_sm2.ts";

const FIXED_NOW = new Date("2026-09-11T00:00:00Z");

describe("sm2Update", () => {
  test("first 'good' review schedules 1 day out and sets reviewCount to 1", () => {
    const result = sm2Update(DEFAULT_SRS_STATE, "good", FIXED_NOW);
    expect(result.reviewCount).toBe(1);
    expect(result.intervalDays).toBe(1);
    expect(result.dueDate).toBe("2026-09-12");
    expect(result.easeFactor).toBe(2.5);
  });

  test("second consecutive 'good' review schedules 6 days out", () => {
    const first = sm2Update(DEFAULT_SRS_STATE, "good", FIXED_NOW);
    const second = sm2Update(first, "good", FIXED_NOW);
    expect(second.reviewCount).toBe(2);
    expect(second.intervalDays).toBe(6);
  });

  test("third+ consecutive 'good' review multiplies interval by ease factor", () => {
    const s1 = sm2Update(DEFAULT_SRS_STATE, "good", FIXED_NOW);
    const s2 = sm2Update(s1, "good", FIXED_NOW);
    const s3 = sm2Update(s2, "good", FIXED_NOW);
    expect(s3.reviewCount).toBe(3);
    expect(s3.intervalDays).toBe(Math.round(6 * 2.5)); // 15
  });

  test("'again' resets reviewCount and interval to 1 day, and lowers ease", () => {
    const progressed = sm2Update(
      sm2Update(DEFAULT_SRS_STATE, "good", FIXED_NOW),
      "good",
      FIXED_NOW,
    );
    const failed = sm2Update(progressed, "again", FIXED_NOW);
    expect(failed.reviewCount).toBe(0);
    expect(failed.intervalDays).toBe(1);
    expect(failed.easeFactor).toBeCloseTo(2.3, 5);
  });

  test("ease factor never drops below the 1.3 floor even after repeated failures", () => {
    let state = DEFAULT_SRS_STATE;
    for (let i = 0; i < 20; i++) {
      state = sm2Update(state, "again", FIXED_NOW);
    }
    expect(state.easeFactor).toBeGreaterThanOrEqual(1.3);
  });

  test("'easy' grows the interval faster than 'good' from the same state", () => {
    const good = sm2Update(
      sm2Update(DEFAULT_SRS_STATE, "good", FIXED_NOW),
      "good",
      FIXED_NOW,
    );
    const easy = sm2Update(
      sm2Update(DEFAULT_SRS_STATE, "easy", FIXED_NOW),
      "easy",
      FIXED_NOW,
    );
    expect(easy.intervalDays).toBeGreaterThan(good.intervalDays);
    expect(easy.easeFactor).toBeGreaterThan(good.easeFactor);
  });

  test("'hard' grows the interval slower than 'good' and lowers ease", () => {
    const good = sm2Update(DEFAULT_SRS_STATE, "good", FIXED_NOW);
    const hard = sm2Update(DEFAULT_SRS_STATE, "hard", FIXED_NOW);
    expect(hard.easeFactor).toBeLessThan(good.easeFactor);
  });

  test("dueDate is computed from the given `now`, not wall-clock time", () => {
    const result = sm2Update(
      DEFAULT_SRS_STATE,
      "good",
      new Date("2020-01-01T00:00:00Z"),
    );
    expect(result.dueDate).toBe("2020-01-02");
  });
});
