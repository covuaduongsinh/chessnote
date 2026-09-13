import { EditorState } from "@codemirror/state";
import { describe, expect, test } from "vitest";
import { buildExtendedMarkdownLanguage } from "../markdown_parser/parser.ts";
import { findFencedCodeBodyRange } from "./fenced_code_body_range.ts";

function stateFor(doc: string): EditorState {
  return EditorState.create({
    doc,
    extensions: [buildExtendedMarkdownLanguage()],
  });
}

describe("findFencedCodeBodyRange", () => {
  test("finds the body of a single-line fence, excluding both fence lines", () => {
    const doc = "# Title\n\n```fen\nrnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1\n```\n";
    const fenceStart = doc.indexOf("```fen");
    const state = stateFor(doc);
    const range = findFencedCodeBodyRange(state, fenceStart)!;
    expect(range).not.toBeNull();
    expect(state.sliceDoc(range.from, range.to)).toBe(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    );
  });

  test("finds the body of a multi-line fence", () => {
    const doc = "```pgn\n1. e4 e5\n2. Nf3 Nc6\n```\n";
    const state = stateFor(doc);
    const range = findFencedCodeBodyRange(state, 0)!;
    expect(state.sliceDoc(range.from, range.to)).toBe("1. e4 e5\n2. Nf3 Nc6");
  });

  test("resolves correctly when pos is somewhere inside the fence, not just at its start", () => {
    const doc = "```fen\nrnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1\n```\n";
    const state = stateFor(doc);
    const posInsideBody = doc.indexOf("KQkq");
    const range = findFencedCodeBodyRange(state, posInsideBody)!;
    expect(state.sliceDoc(range.from, range.to)).toBe(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    );
  });

  test("returns null for a position outside any fenced code block", () => {
    const doc = "just a paragraph, no fence here\n";
    const state = stateFor(doc);
    expect(findFencedCodeBodyRange(state, 5)).toBeNull();
  });

  test("returns null for a fence with no body lines", () => {
    const doc = "```\n```\n";
    const state = stateFor(doc);
    expect(findFencedCodeBodyRange(state, 0)).toBeNull();
  });

  test("locates the SECOND of two identical fences by position, not by content", () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const doc = `\`\`\`fen\n${fen}\n\`\`\`\n\nsome text in between\n\n\`\`\`fen\n${fen}\n\`\`\`\n`;
    const state = stateFor(doc);
    const secondFenceStart = doc.lastIndexOf("```fen");
    const range = findFencedCodeBodyRange(state, secondFenceStart)!;
    // The range found must be the SECOND fence's body, not the first's --
    // i.e. its offset must be past the "some text in between" marker.
    expect(range.from).toBeGreaterThan(doc.indexOf("in between"));
    expect(state.sliceDoc(range.from, range.to)).toBe(fen);
  });
});
