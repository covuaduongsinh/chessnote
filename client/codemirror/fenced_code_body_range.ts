import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";

/**
 * The body range (excluding the ``` fence lines themselves) of the
 * FencedCode node that contains document position `pos` -- used by
 * iframe_widget.ts's "replaceBody" message handler to let a widget write its
 * own edited content back into the page, without needing to carry a from/to
 * captured at construction time (which would go stale the moment an
 * unrelated edit earlier in the document shifts this fence's position --
 * CodeMirror can reuse the same IFrameWidget instance across such shifts
 * since `eq()` only compares `bodyText`). Resolving fresh from the DOM
 * position at click time instead is what makes this robust to that.
 *
 * Kept in its own module (no DOM-touching imports) so it can be unit tested
 * directly with a plain EditorState -- iframe_widget.ts itself transitively
 * imports widget_sandbox_iframe.ts, which calls `document.createElement` at
 * module load time and can't be imported in this project's DOM-less vitest
 * setup.
 *
 * Mirrors the line-splitting math in fenced_code.ts's decorator (kept as a
 * separate small copy rather than a shared export -- it's ~10 lines, and
 * duplicating it here avoids a cross-file refactor of code that already
 * works, for a change this size).
 */
export function findFencedCodeBodyRange(
  state: EditorState,
  pos: number,
): { from: number; to: number } | null {
  // deno-lint-ignore no-explicit-any
  let node: any = syntaxTree(state).resolveInner(pos, 1);
  while (node && node.name !== "FencedCode") node = node.parent;
  if (!node) return null;
  const text = state.sliceDoc(node.from, node.to);
  const lineStrings = text.split("\n");
  if (lineStrings.length < 3) return null; // no body lines between the fences
  const lines: { from: number; to: number }[] = [];
  let fromIt = node.from;
  for (const line of lineStrings) {
    lines.push({ from: fromIt, to: fromIt + line.length });
    fromIt += line.length + 1;
  }
  const firstLine = lines[0], lastLine = lines[lines.length - 1];
  if (!firstLine || !lastLine) return null;
  return { from: firstLine.to + 1, to: lastLine.from - 1 };
}
