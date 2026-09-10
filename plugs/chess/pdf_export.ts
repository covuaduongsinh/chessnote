import { Chess } from "chess.js";
import {
  collectNodesOfType,
  findNodeOfType,
  type ParseTree,
} from "@silverbulletmd/silverbullet/lib/tree";
import { markdown } from "@silverbulletmd/silverbullet/syscalls";
import { CHESS_CSS, renderStaticBoardHtml } from "./board_renderer.ts";
import { buildMoveList, type MoveListEntry } from "./engine/game_reviewer.ts";

const DEFAULT_BOARD_SIZE = 400;
const MIN_BOARD_SIZE = 150;
const MAX_BOARD_SIZE = 700;

/**
 * `CHESS_CSS`'s `--bg-panel`/`--text-main`/etc. default to the app's *dark*
 * theme (see `board_renderer.ts`) because the live editor is usually dark;
 * a printed page is not, and doesn't carry a `data-theme` attribute to key
 * off of either. Overrides those to a plain light/paper scheme, plus the two
 * classes this module's own output uses that `CHESS_CSS` doesn't define
 * (`.chessnote-static-board`'s sizing, `.chess-pgn-movetext`'s typography).
 *
 * `boardSize` (px) controls `.chessnote-static-board`'s `max-width` — the
 * caller (`renderPageForPdf`) clamps it before it ever reaches here.
 */
function buildPdfExtraCss(boardSize: number): string {
  return `
:root {
  --bg-panel: #ffffff;
  --text-main: #111111;
  --text-muted: #555555;
  --board-border: #78350f;
}
.chessnote-static-board {
  width: 100%;
  max-width: ${boardSize}px;
  margin: 10px auto 16px;
  break-inside: avoid !important;
  page-break-inside: avoid !important;
  -webkit-column-break-inside: avoid !important;
  display: block;
  box-sizing: border-box;
}
.chessnote-static-board .chess-title {
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 6px;
  color: var(--text-main);
  break-after: avoid !important;
  page-break-after: avoid !important;
  -webkit-column-break-after: avoid !important;
}
.chessnote-static-board .chess-board {
  width: 100% !important;
  max-width: ${boardSize}px !important;
  height: auto !important;
  aspect-ratio: 1 / 1 !important;
  margin: 0 auto;
  display: grid !important;
  grid-template-columns: repeat(8, 1fr) !important;
  grid-template-rows: repeat(8, 1fr) !important;
  border: 1.5px solid var(--board-border, #78350f);
  border-radius: 4px;
  overflow: hidden;
  box-sizing: border-box;
  break-inside: avoid !important;
  page-break-inside: avoid !important;
  -webkit-column-break-inside: avoid !important;
}
.chessnote-static-board .chess-sq {
  width: 100% !important;
  height: auto !important;
  aspect-ratio: 1 / 1 !important;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}
.chessnote-static-board .chess-piece {
  width: 86% !important;
  height: 86% !important;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
.chessnote-static-board .chess-piece svg {
  width: 100%;
  height: 100%;
  display: block;
}
.chessnote-static-board .chess-coord {
  position: absolute;
  font-size: 8px;
  font-weight: 700;
  line-height: 1;
  pointer-events: none;
  opacity: 0.8;
}
.chessnote-static-board .coord-file { bottom: 1px; right: 2px; }
.chessnote-static-board .coord-rank { top: 1px; left: 2px; }
.chessnote-static-board .puzzle-hint-box {
  margin-top: 6px;
  break-inside: avoid !important;
}
.chessnote-static-board .fen-footer {
  margin-top: 6px;
  break-inside: avoid !important;
}
.chess-pgn-movetext {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  line-height: 1.5;
  margin: 4px 0 14px;
  word-break: break-word;
  break-inside: avoid !important;
  page-break-inside: avoid !important;
  -webkit-column-break-inside: avoid !important;
}
`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** `fen` block body: first line is the FEN, optional `| key: value` lines follow (see `fenWidget`). */
function renderFenBlockForPdf(bodyText: string): string {
  const lines = bodyText.trim().split("\n");
  const fen = lines[0]?.trim() ?? "";
  let title = "";
  let orientation: "white" | "black" = "white";
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("| title:")) {
      title = line.replace("| title:", "").trim();
    } else if (line.startsWith("| orientation:")) {
      orientation = line.includes("black") ? "black" : "white";
    }
  }
  return renderStaticBoardHtml(fen, { title, orientation, showFen: false });
}

/** `puzzle` block body: `key: value` lines (see `puzzleWidget`) — only `fen`/`hint` matter for a static print. */
function renderPuzzleBlockForPdf(bodyText: string): string {
  const lines = bodyText.trim().split("\n");
  let fen = "";
  let hint = "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("fen:")) {
      fen = trimmed.replace("fen:", "").trim();
    } else if (trimmed.startsWith("hint:")) {
      hint = trimmed.replace("hint:", "").trim();
    }
  }
  const board = renderStaticBoardHtml(fen, { title: "Bài tập cờ", showFen: false });
  const hintHtml = hint
    ? `<div class="puzzle-hint-box">Gợi ý: ${escapeHtml(hint)}</div>`
    : "";
  return `${board}${hintHtml}`;
}

const START_POSITION_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function labelForMove(entry: MoveListEntry): string {
  return entry.isWhite
    ? `sau nước ${entry.moveNum}`
    : `sau nước đen ${entry.moveNum}`;
}

/**
 * Resolves a `pgn` block's optional `[DisplayMove "..."]` PGN tag (a custom
 * tag — chess.js loads and round-trips arbitrary tag pairs without them
 * affecting move parsing) to the move it refers to, so the PDF board can show
 * that position instead of always the game's start.
 *
 * Accepted `tagValue` forms: `"17"`/`"17w"` (after White's move 17), `"17b"`
 * (after Black's move 17), `"last"` (the game's final move). A value with no
 * exact match (typo, or past the game's actual move count) falls back to the
 * latest move at or before the one requested, so "close enough" input still
 * does something sensible instead of erroring on a single-user's own notes.
 * Returns `null` (→ caller keeps the start position) when there's no tag, no
 * moves, or nothing at or before the requested move.
 */
function resolveDisplayMove(
  moves: MoveListEntry[],
  tagValue: string | undefined,
): { entry: MoveListEntry; label: string } | null {
  if (!tagValue || moves.length === 0) return null;
  const trimmed = tagValue.trim();

  if (trimmed.toLowerCase() === "last") {
    const entry = moves[moves.length - 1];
    return { entry, label: labelForMove(entry) };
  }

  const match = /^(\d+)\s*(w|b)?$/i.exec(trimmed);
  if (!match) return null;
  const moveNum = parseInt(match[1], 10);
  const isWhite = (match[2] ?? "w").toLowerCase() !== "b";

  let entry = moves.find((m) => m.moveNum === moveNum && m.isWhite === isWhite);
  if (!entry) {
    const candidates = moves.filter((m) =>
      m.moveNum < moveNum || (m.moveNum === moveNum && m.isWhite && !isWhite)
    );
    entry = candidates[candidates.length - 1];
  }
  return entry ? { entry, label: labelForMove(entry) } : null;
}

/**
 * `pgn` block body: a raw PGN game. A static print defaults to the starting
 * position (an interactive replay, which is what `pgnWidget` shows instead,
 * has no equivalent on paper) plus the full movetext in standard notation —
 * unless the PGN's own `[DisplayMove "..."]` tag points at a specific move
 * (see `resolveDisplayMove`), in which case the board shows that position and
 * the title notes which move it is.
 */
function renderPgnBlockForPdf(bodyText: string): string {
  const trimmedPgn = bodyText.trim();
  let chess: Chess;
  try {
    chess = new Chess();
    if (trimmedPgn) {
      chess.loadPgn(trimmedPgn);
    }
  } catch (e) {
    return `<div class="chess-error-banner">PGN không hợp lệ: ${
      e instanceof Error ? escapeHtml(e.message) : ""
    }</div>`;
  }

  const header = chess.header();
  const white = header["White"] || "White";
  const black = header["Black"] || "Black";
  const result = header["Result"] || "*";

  let moves: MoveListEntry[] = [];
  try {
    moves = buildMoveList(trimmedPgn);
  } catch {
    // Malformed PGN already surfaced above via the loadPgn catch; an empty
    // move list here just means no moves to list/display, not a second error.
  }

  const displayMove = resolveDisplayMove(moves, header["DisplayMove"] ?? undefined);
  const titleSuffix = displayMove ? ` — ${displayMove.label}` : "";
  const board = renderStaticBoardHtml(displayMove?.entry.fenAfter ?? START_POSITION_FEN, {
    title: `${white} vs ${black} (${result})${titleSuffix}`,
    showFen: false,
  });

  let movetext = "";
  for (const move of moves) {
    movetext += move.isWhite ? `${move.moveNum}. ${move.san} ` : `${move.san} `;
  }
  return `${board}<div class="chess-pgn-movetext">${escapeHtml(movetext.trim())}</div>`;
}

/**
 * Turns page markdown into print-ready HTML: every `fen`/`pgn`/`puzzle` code
 * fence is replaced with a static, non-interactive board rendering (see
 * `board_renderer.ts`) before handing the rest to `markdown.markdownToHtml` —
 * that pipeline has no special handling for these fences (codeWidget
 * rendering only exists in the live editor's iframe path) and would
 * otherwise emit a bare `<pre><code>` block of raw FEN/PGN/puzzle text.
 *
 * Called by the "PDF: Xuất file PDF" exporter in
 * `Library/Std/Infrastructure/Export.md`, which then hands the result to
 * `editor.exportPdf` for the actual PDF rendering + download.
 *
 * `boardSize` (px, default {@link DEFAULT_BOARD_SIZE}) sets how wide each
 * static board renders — clamped to [{@link MIN_BOARD_SIZE},
 * {@link MAX_BOARD_SIZE}] so a bad config/frontmatter value can't shrink
 * boards past legibility or blow past a single PDF column's width.
 */
export async function renderPageForPdf(
  text: string,
  boardSize?: number,
): Promise<string> {
  const clampedBoardSize = Math.min(
    MAX_BOARD_SIZE,
    Math.max(MIN_BOARD_SIZE, boardSize ?? DEFAULT_BOARD_SIZE),
  );
  const tree = (await markdown.parseMarkdown(text)) as ParseTree;
  const replacements: { from: number; to: number; html: string }[] = [];

  for (const node of collectNodesOfType(tree, "FencedCode")) {
    const codeInfoNode = findNodeOfType(node, "CodeInfo");
    if (!codeInfoNode) continue;
    const lang = codeInfoNode.children![0].text!;
    if (lang !== "fen" && lang !== "pgn" && lang !== "puzzle") continue;
    const codeTextNode = findNodeOfType(node, "CodeText");
    const body = codeTextNode?.children?.[0]?.text ?? "";
    if (node.from == null || node.to == null) continue;

    const html = lang === "fen"
      ? renderFenBlockForPdf(body)
      : lang === "pgn"
      ? renderPgnBlockForPdf(body)
      : renderPuzzleBlockForPdf(body);
    replacements.push({ from: node.from, to: node.to, html });
  }

  // Splice back-to-front so earlier offsets stay valid as the string shrinks/grows.
  replacements.sort((a, b) => b.from - a.from);
  let spliced = text;
  for (const r of replacements) {
    spliced = spliced.slice(0, r.from) + r.html + spliced.slice(r.to);
  }

  const bodyHtml = (await markdown.markdownToHtml(spliced)) as unknown as string;
  return `<style>${CHESS_CSS}${buildPdfExtraCss(clampedBoardSize)}</style>${bodyHtml}`;
}
