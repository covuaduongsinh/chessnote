import { expect, test } from "vitest";
import { buildRelatedGameReasons } from "./related_games.ts";

// findRelatedGames() itself is SQL-backed (chessSql.queryRelatedGames) since
// Phase 3 of docs/plans/2026-09-11-dbms-sqlite-wasm-tich-hop.md, so it can't
// be exercised under vitest (WASM import fails outside a browser — see
// client/data/chess_pgn_date.ts's module comment for why). buildRelatedGameReasons()
// is the pure part that survived the migration: it re-derives the "why this
// game is related" text from (current, other) alone, independent of how the
// candidate set was scored/filtered. The scoring itself is verified manually
// (see the plan doc's Phase 3 checklist).

test("explains a same-ECO match", () => {
  const current = { white: "Nobody", black: "Nobody2", eco: "C50" };
  const other = { white: "X", black: "Y", eco: "C50" };
  expect(buildRelatedGameReasons(current, other)).toContain(
    "cùng mã khai cuộc ECO C50",
  );
});

test("does not claim an ECO match when ECOs differ or either is empty", () => {
  expect(
    buildRelatedGameReasons(
      { white: "A", black: "B", eco: "C50" },
      { white: "X", black: "Y", eco: "B90" },
    ),
  ).toEqual([]);
  expect(
    buildRelatedGameReasons(
      { white: "A", black: "B", eco: "" },
      { white: "X", black: "Y", eco: "" },
    ),
  ).toEqual([]);
});

test("explains a shared-player match regardless of which side they played", () => {
  const current = { white: "Alice", black: "Bob", eco: "" };
  const other = { white: "Carol", black: "Alice", eco: "" };
  const reasons = buildRelatedGameReasons(current, other);
  expect(reasons).toHaveLength(1);
  expect(reasons[0]).toContain("Alice");
});

test("ignores placeholder names (White/Black/empty) as a shared-player signal", () => {
  const current = { white: "White", black: "Black", eco: "" };
  const other = { white: "White", black: "Black", eco: "" };
  expect(buildRelatedGameReasons(current, other)).toEqual([]);
});

test("combines both reasons when ECO and player both match", () => {
  const current = { white: "Alice", black: "Bob", eco: "C50" };
  const other = { white: "Alice", black: "Z", eco: "C50" };
  const reasons = buildRelatedGameReasons(current, other);
  expect(reasons).toHaveLength(2);
  expect(reasons[0]).toContain("ECO C50");
  expect(reasons[1]).toContain("Alice");
});

test("deduplicates a name shared on both sides (e.g. self-play test data)", () => {
  const current = { white: "Alice", black: "Alice", eco: "" };
  const other = { white: "Alice", black: "Alice", eco: "" };
  const reasons = buildRelatedGameReasons(current, other);
  expect(reasons).toHaveLength(1);
  expect(reasons[0]).toBe("cùng người chơi: Alice");
});
