import { expect, test } from "vitest";
import { parseMarkdown } from "../../client/markdown_parser/parser.ts";
import {
  extractChessGames,
  isRepertoirePage,
  isTemplatePage,
} from "./index.ts";

const validPgn = `[Event "Casual Game"]
[White "Alice"]
[Black "Bob"]
[Result "1-0"]
[Date "2026.09.08"]
[ECO "C50"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d3 d6 1-0`;

const testPage = `
# My games

Some notes here.

\`\`\`pgn
${validPgn}
\`\`\`

Not a game:
\`\`\`fen
rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
\`\`\`

\`\`\`pgn
[White "Carol"]
[Black "Dave"]
[Result "0-1"]

1. d4 d5 0-1
\`\`\`
`.trim();

test("extracts chess-game objects from pgn code blocks", async () => {
  const tree = parseMarkdown(testPage);
  const games = extractChessGames("folder/games", tree);

  expect(games.length).toEqual(2);

  expect(games[0].tag).toEqual("chess-game");
  expect(games[0].page).toEqual("folder/games");
  expect(games[0].white).toEqual("Alice");
  expect(games[0].black).toEqual("Bob");
  expect(games[0].result).toEqual("1-0");
  expect(games[0].eco).toEqual("C50");
  expect(games[0].pgn).toContain("Nf3 Nc6");

  expect(games[1].white).toEqual("Carol");
  expect(games[1].black).toEqual("Dave");
  expect(games[1].result).toEqual("0-1");
  // No ECO header on the second game — should fall back to "", not throw.
  expect(games[1].eco).toEqual("");

  // ```fen``` blocks are not games and must not produce chess-game objects.
  expect(games.some((g) => g.page !== "folder/games")).toBe(false);

  // range covers the inner code text (usable for jump-to-block later)
  for (const g of games) {
    const [from, to] = g.range as unknown as [number, number];
    expect(testPage.slice(from, to)).toBe(g.pgn);
  }

  // refs must be unique per block
  expect(new Set(games.map((g) => g.ref)).size).toEqual(games.length);
});

test("skips a malformed pgn block instead of throwing", async () => {
  const page = `
\`\`\`pgn
this is not a valid pgn at all { [ } ]
\`\`\`
`.trim();
  const tree = parseMarkdown(page);
  expect(() => extractChessGames("folder/bad", tree)).not.toThrow();
  expect(extractChessGames("folder/bad", tree)).toEqual([]);
});

test("returns no games for a page with no pgn blocks", async () => {
  const tree = parseMarkdown("Just some regular note text, no code blocks.");
  expect(extractChessGames("folder/none", tree)).toEqual([]);
});

test("isTemplatePage flags page and slash templates, not real games", () => {
  expect(isTemplatePage({ tags: ["meta/template/page"] })).toBe(true);
  expect(isTemplatePage({ tags: ["meta/template/slash"] })).toBe(true);
  expect(isTemplatePage({ tags: ["meta/template"] })).toBe(true);
  expect(isTemplatePage({ tags: ["game"] })).toBe(false);
  expect(isTemplatePage({ tags: [] })).toBe(false);
  expect(isTemplatePage({})).toBe(false);
});

test("isRepertoirePage flags exactly the 'repertoire' tag", () => {
  expect(isRepertoirePage({ tags: ["repertoire"] })).toBe(true);
  expect(isRepertoirePage({ tags: ["repertoire", "openings"] })).toBe(true);
  expect(isRepertoirePage({ tags: ["game"] })).toBe(false);
  expect(isRepertoirePage({ tags: [] })).toBe(false);
  expect(isRepertoirePage({})).toBe(false);
});
