import { describe, expect, test } from "vitest";
import {
  parseSrsState,
  serializeSrsState,
  srsKey,
  type PersistedSrsState,
} from "./srs_persist.ts";

const ENTRY = {
  dueDate: "2026-10-01",
  easeFactor: 2.65,
  intervalDays: 6,
  reviewCount: 2,
  lastGrade: "good",
};

describe("srsKey", () => {
  test("depends on page and move list, not on where the block sits in the page", () => {
    expect(srsKey("Openings/Italian", "e4 e5 Nf3")).toBe(
      srsKey("Openings/Italian", "e4 e5 Nf3"),
    );
    expect(srsKey("Openings/Italian", "e4 e5 Nf3")).not.toBe(
      srsKey("Openings/Italian", "e4 e5 Bc4"),
    );
    expect(srsKey("A", "e4")).not.toBe(srsKey("B", "e4"));
  });

  test("cannot collide when a page name ends like a move list starts", () => {
    expect(srsKey("a e4", "e5")).not.toBe(srsKey("a", "e4 e5"));
  });
});

describe("serializeSrsState / parseSrsState", () => {
  test("round-trips a state map", () => {
    const state: PersistedSrsState = { [srsKey("P", "e4 e5")]: ENTRY };
    expect(parseSrsState(serializeSrsState(state))).toEqual(state);
  });

  test("keeps null dueDate/lastGrade", () => {
    const state: PersistedSrsState = {
      k: { ...ENTRY, dueDate: null, lastGrade: null },
    };
    expect(parseSrsState(serializeSrsState(state))).toEqual(state);
  });

  test("returns {} for invalid JSON instead of throwing", () => {
    expect(parseSrsState("{not json")).toEqual({});
  });

  test("returns {} for a JSON array or scalar", () => {
    expect(parseSrsState("[1,2]")).toEqual({});
    expect(parseSrsState("42")).toEqual({});
    expect(parseSrsState("null")).toEqual({});
  });

  test("drops malformed entries but keeps valid ones", () => {
    const text = JSON.stringify({
      good: ENTRY,
      bad: { ...ENTRY, easeFactor: "2.5" },
      missing: { dueDate: null },
    });
    expect(parseSrsState(text)).toEqual({ good: ENTRY });
  });
});
