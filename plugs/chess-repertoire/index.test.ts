import { expect, test } from "vitest";
import { parseMarkdown } from "../../client/markdown_parser/parser.ts";
import { extractRepertoireLines } from "./index.ts";

const repertoirePage = `
\`\`\`fen
r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4
\`\`\`

\`\`\`pgn
[Event "Italian Game Repertoire"]
[Variation "Main Line"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 *
\`\`\`

\`\`\`pgn
[Event "Italian Game Repertoire"]
[Variation "Qe7 Defense"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Qe7 *
\`\`\`
`.trim();

const frontmatter = {
  tags: ["repertoire"],
  side: "White",
  openingName: "Italian Game (Giuoco Piano)",
  eco: "C50",
};

test("extracts one line per ```pgn``` block, tagged with the page's own frontmatter", () => {
  const tree = parseMarkdown(repertoirePage);
  const lines = extractRepertoireLines("Openings/Italian", tree, frontmatter);

  expect(lines.length).toBe(2);
  expect(lines[0].page).toBe("Openings/Italian");
  expect(lines[0].side).toBe("White");
  expect(lines[0].eco).toBe("C50");
  expect(lines[0].openingName).toBe("Italian Game (Giuoco Piano)");
  expect(lines[0].variationName).toBe("Main Line");
  expect(lines[0].movesSan).toBe("e4 e5 Nf3 Nc6 Bc4 Bc5 c3");

  expect(lines[1].variationName).toBe("Qe7 Defense");
  expect(lines[1].movesSan).toBe("e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Qe7");

  // refs must be unique per block, and a ```fen``` block must not produce a line
  expect(new Set(lines.map((l) => l.ref)).size).toBe(lines.length);
});

test("falls back to empty strings when frontmatter lacks side/eco/openingName", () => {
  const tree = parseMarkdown('```pgn\n[Event "Test"]\n\n1. e4 *\n```');
  const lines = extractRepertoireLines("Openings/Bare", tree, {
    tags: ["repertoire"],
  });
  expect(lines.length).toBe(1);
  expect(lines[0].side).toBe("");
  expect(lines[0].eco).toBe("");
  expect(lines[0].openingName).toBe("");
  expect(lines[0].variationName).toBe("");
});

test("skips a malformed pgn block instead of throwing", () => {
  const tree = parseMarkdown("```pgn\nthis is not valid pgn { [ } ]\n```");
  expect(() =>
    extractRepertoireLines("Openings/Bad", tree, { tags: ["repertoire"] }),
  ).not.toThrow();
  expect(
    extractRepertoireLines("Openings/Bad", tree, { tags: ["repertoire"] }),
  ).toEqual([]);
});

test("returns no lines for a page with no pgn blocks", () => {
  const tree = parseMarkdown("Just some prose, no code blocks.");
  expect(
    extractRepertoireLines("Openings/Empty", tree, { tags: ["repertoire"] }),
  ).toEqual([]);
});
