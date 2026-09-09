import { expect, test } from "vitest";
import { findRelatedGames } from "./related_games.ts";
import type { ChessGameObject } from "./index.ts";

function game(overrides: Partial<ChessGameObject> = {}): ChessGameObject {
  return {
    ref: `${overrides.page || "Page"}@1`,
    tag: "chess-game",
    page: "Page",
    pgn: "1. e4 e5 *",
    white: "Alice",
    black: "Bob",
    result: "*",
    date: "",
    eco: "",
    event: "",
    ...overrides,
  };
}

test("scores same-ECO games higher and explains why", () => {
  const current = { page: "Current", white: "Nobody", black: "Nobody2", eco: "C50" };
  const candidates = [
    game({ page: "SameEco", eco: "C50", white: "X", black: "Y" }),
    game({ page: "DifferentEco", eco: "B90", white: "X", black: "Y" }),
    game({ page: "NoEco", eco: "", white: "X", black: "Y" }),
  ];
  const results = findRelatedGames(current, candidates);
  expect(results.map((r) => r.page)).toEqual(["SameEco"]);
  expect(results[0].reasons).toContain("cùng mã khai cuộc ECO C50");
});

test("matches shared opponent regardless of which side they played", () => {
  const current = { page: "Current", white: "Alice", black: "Bob", eco: "" };
  const candidates = [
    game({ page: "AliceAsBlack", white: "Carol", black: "Alice" }),
    game({ page: "Unrelated", white: "Dave", black: "Eve" }),
  ];
  const results = findRelatedGames(current, candidates);
  expect(results.map((r) => r.page)).toEqual(["AliceAsBlack"]);
  expect(results[0].reasons[0]).toContain("Alice");
});

test("ignores placeholder names (White/Black/empty) as a shared-player signal", () => {
  const current = { page: "Current", white: "White", black: "Black", eco: "" };
  const candidates = [game({ page: "AlsoPlaceholder", white: "White", black: "Black" })];
  expect(findRelatedGames(current, candidates)).toEqual([]);
});

test("excludes games on the same page (assumed to be the game being viewed)", () => {
  const current = { page: "SamePage", white: "Alice", black: "Bob", eco: "C50" };
  const candidates = [game({ page: "SamePage", eco: "C50", white: "Alice", black: "Bob" })];
  expect(findRelatedGames(current, candidates)).toEqual([]);
});

test("combines ECO + shared-opponent scores and sorts descending", () => {
  const current = { page: "Current", white: "Alice", black: "Bob", eco: "C50" };
  const candidates = [
    game({ page: "EcoOnly", eco: "C50", white: "X", black: "Y" }), // score 3
    game({ page: "EcoAndOpponent", eco: "C50", white: "Alice", black: "Z" }), // score 5
    game({ page: "OpponentOnly", eco: "", white: "Bob", black: "Z" }), // score 2
  ];
  const results = findRelatedGames(current, candidates);
  expect(results.map((r) => r.page)).toEqual(["EcoAndOpponent", "EcoOnly", "OpponentOnly"]);
  expect(results[0].score).toBe(5);
});

test("caps results at the given limit", () => {
  const current = { page: "Current", white: "", black: "", eco: "C50" };
  const candidates = Array.from({ length: 10 }, (_, i) =>
    game({ page: `G${i}`, eco: "C50", white: "X", black: "Y" }),
  );
  expect(findRelatedGames(current, candidates, 3).length).toBe(3);
});

test("returns an empty list when nothing matches", () => {
  const current = { page: "Current", white: "Alice", black: "Bob", eco: "C50" };
  const candidates = [game({ page: "Other", eco: "B90", white: "X", black: "Y" })];
  expect(findRelatedGames(current, candidates)).toEqual([]);
});
