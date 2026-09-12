import { describe, expect, test } from "vitest";
import { parsePgnDateToIso } from "./chess_pgn_date.ts";

describe("parsePgnDateToIso", () => {
  test("converts a fully-specified PGN date", () => {
    expect(parsePgnDateToIso("2026.09.11")).toBe("2026-09-11");
  });

  test("rejects PGN dates with unknown parts", () => {
    expect(parsePgnDateToIso("2026.??.??")).toBeNull();
    expect(parsePgnDateToIso("2026.09.??")).toBeNull();
  });

  test("rejects an empty date", () => {
    expect(parsePgnDateToIso("")).toBeNull();
  });

  test("rejects a syntactically valid but impossible date", () => {
    expect(parsePgnDateToIso("2026.13.40")).toBeNull();
  });

  test("tolerates surrounding whitespace", () => {
    expect(parsePgnDateToIso("  2026.09.11  ")).toBe("2026-09-11");
  });
});
