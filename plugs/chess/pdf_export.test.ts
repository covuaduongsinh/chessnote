import { describe, expect, test, vi } from "vitest";
import { parseMarkdown } from "../../client/markdown_parser/parser.ts";

// `markdownToHtml` is mocked (rather than exercising the real renderer) since
// this module's own job is the fen/pgn/puzzle splice — not markdown-to-HTML
// correctness, which `client/markdown_renderer` already has its own tests
// for. `parseMarkdown` uses the real parser: `collectNodesOfType`/
// `findNodeOfType` need a real `ParseTree` shape (FencedCode/CodeInfo/
// CodeText with correct offsets) to find anything.
const markdownToHtmlMock = vi.fn(async (text: string) => `<HTML>${text}</HTML>`);
vi.mock("@silverbulletmd/silverbullet/syscalls", () => ({
  markdown: {
    parseMarkdown: (text: string) => parseMarkdown(text),
    markdownToHtml: (text: string) => markdownToHtmlMock(text),
  },
}));

const { renderPageForPdf } = await import("./pdf_export.ts");

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("renderPageForPdf", () => {
  test("replaces a fen block with a static board, leaving surrounding text alone", async () => {
    const page = [
      "# My game",
      "",
      "Some notes here.",
      "",
      "```fen",
      START_FEN,
      "```",
      "",
      "More notes.",
    ].join("\n");

    const html = await renderPageForPdf(page);

    expect(markdownToHtmlMock).toHaveBeenCalledTimes(1);
    const splicedArg = markdownToHtmlMock.mock.calls[0][0] as string;
    expect(splicedArg).toContain("# My game");
    expect(splicedArg).toContain("Some notes here.");
    expect(splicedArg).toContain("More notes.");
    expect(splicedArg).not.toContain("```fen");
    expect(splicedArg).toContain("chessnote-static-board");
    expect(html).toContain("chessnote-static-board");
    expect(html).toContain("chess-sq");
    expect(html).not.toContain(START_FEN);
    expect(html).not.toContain('class="fen-footer"');
  });

  test("replaces a pgn block with the starting position and full movetext", async () => {
    const pgn = [
      '[White "Alice"]',
      '[Black "Bob"]',
      '[Result "1-0"]',
      "",
      "1. e4 e5 2. Nf3 Nc6 1-0",
    ].join("\n");
    const page = "```pgn\n" + pgn + "\n```";

    const html = await renderPageForPdf(page);

    const splicedArg = markdownToHtmlMock.mock.calls.at(-1)![0] as string;
    expect(splicedArg).toContain("chess-pgn-movetext");
    expect(splicedArg).toContain("Alice vs Bob (1-0)");
    expect(splicedArg).toContain("1. e4");
    expect(splicedArg).toContain("2. Nf3");
    expect(html).toContain("chess-pgn-movetext");
    expect(html).not.toContain(START_FEN);
    expect(html).not.toContain('class="fen-footer"');
  });

  describe("[DisplayMove] tag on a pgn block", () => {
    const pieceCount = (html: string) =>
      (html.match(/class="chess-piece"/g) || []).length;

    // 1. e4 d5 (32 pieces, no capture yet) 2. exd5 (White captures — 31)
    // Qxd5 (Black recaptures — 30). Piece count after each ply is distinct,
    // so it doubles as a cheap proxy for "which position is this?" without
    // asserting on a brittle full FEN/board-HTML string.
    const pgnWithCaptures = (displayMove?: string) =>
      [
        '[White "Alice"]',
        '[Black "Bob"]',
        '[Result "*"]',
        ...(displayMove ? [`[DisplayMove "${displayMove}"]`] : []),
        "",
        "1. e4 d5 2. exd5 Qxd5 *",
      ].join("\n");

    test("with no tag, still shows the starting position (32 pieces)", async () => {
      const html = await renderPageForPdf("```pgn\n" + pgnWithCaptures() + "\n```");
      expect(pieceCount(html)).toBe(32);
      expect(html).not.toContain("sau nước");
    });

    test('"2" (and "2w") show the position after White\'s move 2', async () => {
      const html = await renderPageForPdf("```pgn\n" + pgnWithCaptures("2") + "\n```");
      expect(pieceCount(html)).toBe(31);
      expect(html).toContain("Alice vs Bob (*) — sau nước 2");

      const htmlW = await renderPageForPdf("```pgn\n" + pgnWithCaptures("2w") + "\n```");
      expect(pieceCount(htmlW)).toBe(31);
    });

    test('"2b" shows the position after Black\'s move 2', async () => {
      const html = await renderPageForPdf("```pgn\n" + pgnWithCaptures("2b") + "\n```");
      expect(pieceCount(html)).toBe(30);
      expect(html).toContain("sau nước đen 2");
    });

    test('"last" shows the game\'s final move', async () => {
      const html = await renderPageForPdf("```pgn\n" + pgnWithCaptures("last") + "\n```");
      expect(pieceCount(html)).toBe(30);
      expect(html).toContain("sau nước đen 2");
    });

    test("a move number past the game's end falls back to the last actual move", async () => {
      const html = await renderPageForPdf("```pgn\n" + pgnWithCaptures("20") + "\n```");
      expect(pieceCount(html)).toBe(30);
      expect(html).toContain("sau nước đen 2");
    });

    test("a nonsense value falls back to the starting position", async () => {
      const html = await renderPageForPdf("```pgn\n" + pgnWithCaptures("abc") + "\n```");
      expect(pieceCount(html)).toBe(32);
      expect(html).not.toContain("sau nước");
    });
  });

  test("replaces a puzzle block with a board and its hint", async () => {
    const page = [
      "```puzzle",
      "fen: 4k3/8/8/8/8/8/8/4K2R w - - 0 1",
      "hint: đẩy tốt lên phong cấp",
      "solution: Rh8",
      "```",
    ].join("\n");

    const html = await renderPageForPdf(page);

    expect(html).toContain("puzzle-hint-box");
    expect(html).toContain("đẩy tốt lên phong cấp");
    expect(html).not.toContain("4k3/8/8/8/8/8/8/4K2R w - - 0 1");
    expect(html).not.toContain('class="fen-footer"');
  });

  test("an invalid fen block renders an error banner instead of breaking the export", async () => {
    const page = "```fen\nnot a fen\n```";
    const html = await renderPageForPdf(page);
    expect(html).toContain("chess-error-banner");
  });

  test("leaves plain markdown with no board blocks untouched aside from markdownToHtml", async () => {
    const page = "# Just text\n\nNo boards here.";
    await renderPageForPdf(page);
    expect(markdownToHtmlMock).toHaveBeenLastCalledWith(page);
  });

  test("splices multiple board blocks without corrupting offsets", async () => {
    const page = [
      "```fen",
      START_FEN,
      "```",
      "",
      "Middle text",
      "",
      "```fen",
      "8/8/8/8/8/8/8/4K2k w - - 0 1",
      "```",
    ].join("\n");

    await renderPageForPdf(page);

    const splicedArg = markdownToHtmlMock.mock.calls.at(-1)![0] as string;
    expect(splicedArg).toContain("Middle text");
    expect((splicedArg.match(/chessnote-static-board/g) || []).length).toBe(2);
  });

  test("a code fence in an unrelated language is left as-is", async () => {
    const page = "```js\nconsole.log('hi')\n```";
    await renderPageForPdf(page);
    const splicedArg = markdownToHtmlMock.mock.calls.at(-1)![0] as string;
    expect(splicedArg).toContain("console.log");
  });

  test("wraps the output in a <style> tag carrying the chess board CSS", async () => {
    const html = await renderPageForPdf("# No boards");
    expect(html).toMatch(/^<style>/);
    expect(html).toContain("chess-sq");
    expect(html).toContain("chessnote-static-board");
  });

  test("defaults the board size to 400px when no size is given", async () => {
    const html = await renderPageForPdf("# No boards");
    expect(html).toContain("max-width: 400px");
    expect(html).toContain("aspect-ratio: 1 / 1");
  });

  test("uses a custom board size when given", async () => {
    const html = await renderPageForPdf("# No boards", 250);
    expect(html).toContain("max-width: 250px");
    expect(html).not.toContain("max-width: 400px");
  });

  test("clamps a board size below the minimum", async () => {
    const html = await renderPageForPdf("# No boards", 10);
    expect(html).toContain("max-width: 150px");
  });

  test("clamps a board size above the maximum", async () => {
    const html = await renderPageForPdf("# No boards", 5000);
    expect(html).toContain("max-width: 700px");
  });
});
