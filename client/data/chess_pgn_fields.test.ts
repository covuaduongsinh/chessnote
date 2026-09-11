import { describe, expect, test } from "vitest";
import { parseEloToInt } from "./chess_pgn_fields.ts";

describe("parseEloToInt", () => {
  test("parses a plain integer Elo", () => {
    expect(parseEloToInt("1850")).toBe(1850);
  });

  test("returns null for the PGN unknown-value placeholder", () => {
    expect(parseEloToInt("?")).toBeNull();
  });

  test("returns null for an empty string", () => {
    expect(parseEloToInt("")).toBeNull();
  });

  test("returns null for non-numeric garbage instead of a partial parse", () => {
    expect(parseEloToInt("1850abc")).toBeNull();
  });

  test("tolerates surrounding whitespace", () => {
    expect(parseEloToInt("  1850  ")).toBe(1850);
  });

  test("rejects a negative number (not valid for Elo, PGN spec has no sign)", () => {
    expect(parseEloToInt("-100")).toBeNull();
  });
});
