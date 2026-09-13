import { Chess } from "chess.js";
import {
  generateBoardThemeCss,
  getBoardTheme,
  getPieceSet,
} from "./external_syscalls.ts";
import { openChessLenient } from "./fen_utils.ts";

function escapeHtmlForBoard(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * A fully static rendering of a FEN position: every square/piece is baked
 * directly into the returned HTML string (via chess.js's `board()` + vector
 * piece set), unlike `fenWidget`'s interactive board — which is a
 * shell plus a `<script>` that draws the squares client-side in a live
 * iframe. Needed for PDF export (see `pdf_export.ts`): a headless print pass
 * only gets one static snapshot of the DOM, with no interactivity and no
 * onload script expected to run first.
 *
 * Sized to fill its container (`width/height: 100%` on `.chess-board`, from
 * `CHESS_CSS`) rather than the widget's fixed 360px — the caller wraps it in
 * whatever fixed-width box the print layout needs (see
 * `.chessnote-static-board-wrapper` in `pdf_export.ts`).
 */
export async function renderStaticBoardHtml(
  fen: string,
  opts: {
    orientation?: "white" | "black";
    title?: string;
    showFen?: boolean;
    pieceSet?: string;
    boardTheme?: string;
  } = {},
): Promise<string> {
  const orientation = opts.orientation === "black" ? "black" : "white";
  const pieceSvgs = await getPieceSet(opts.pieceSet);
  const theme = await getBoardTheme(opts.boardTheme);

  let boardRows: ReturnType<Chess["board"]>;
  try {
    boardRows = openChessLenient(fen).board();
  } catch (e) {
    return `<div class="chess-error-banner">FEN không hợp lệ: ${escapeHtmlForBoard(
      fen,
    )} (${e instanceof Error ? escapeHtmlForBoard(e.message) : ""})</div>`;
  }

  let squares = "";
  for (let displayRow = 0; displayRow < 8; displayRow++) {
    for (let displayCol = 0; displayCol < 8; displayCol++) {
      // Map display position back to the absolute board square so the
      // light/dark pattern and file/rank labels stay correct under either
      // orientation — only *where* each square is drawn flips, not what it is.
      const row = orientation === "white" ? displayRow : 7 - displayRow;
      const col = orientation === "white" ? displayCol : 7 - displayCol;
      const rankNum = 8 - row; // row 0 = rank 8 (chess.js's board() convention)
      const fileLetter = String.fromCharCode(97 + col); // col 0 = file a
      const isLight = (col + (rankNum - 1)) % 2 === 1;
      const piece = boardRows[row][col];
      const pieceHtml = piece
        ? `<div class="chess-piece">${
            pieceSvgs[`${piece.color}${piece.type.toUpperCase()}`] ?? ""
          }</div>`
        : "";
      const rankLabel =
        displayCol === 0
          ? `<span class="chess-coord coord-rank">${rankNum}</span>`
          : "";
      const fileLabel =
        displayRow === 7
          ? `<span class="chess-coord coord-file">${fileLetter}</span>`
          : "";
      squares += `<div class="chess-sq ${isLight ? "light" : "dark"}">${rankLabel}${fileLabel}${pieceHtml}</div>`;
    }
  }

  const titleHtml = opts.title
    ? `<div class="chess-title">${escapeHtmlForBoard(opts.title)}</div>`
    : "";
  const fenFooterHtml =
    opts.showFen === false
      ? ""
      : `<div class="fen-footer"><span>${escapeHtmlForBoard(fen)}</span></div>`;

  return `
<div class="chessnote-static-board">
  ${titleHtml}
  <div class="chess-board" style="${await generateBoardThemeCss(theme)}">${squares}</div>
  ${fenFooterHtml}
</div>`;
}

/** Thin function wrapper so other plugs (chess-pdf-export) can reach the
 * constant below via a syscall — a manifest `path:` must point to a
 * function, not a plain export. */
export function getChessCss(): string {
  return CHESS_CSS;
}

export const CHESS_CSS = `
:root {
  --sq-light: #ffffff;
  --sq-dark: #d8dce2;
  --sq-select: rgba(44, 62, 80, 0.4);
  --sq-highlight: rgba(255, 215, 0, 0.45);
  --sq-dest: rgba(44, 62, 80, 0.25);
  --board-border: #2c3e50;
  --bg-panel: var(--sidebar-background, #1e293b);
  --text-main: var(--text-color, #f1f5f9);
  --text-muted: #94a3b8;
  --btn-bg: #334155;
  --btn-hover: #475569;
  --btn-active: #2563eb;
  --accent: #38bdf8;
}

[data-theme="light"] {
  --sq-light: #ffffff;
  --sq-dark: #d8dce2;
  --sq-select: rgba(44, 62, 80, 0.4);
  --sq-highlight: rgba(255, 215, 0, 0.45);
  --sq-dest: rgba(44, 62, 80, 0.25);
  --board-border: #2c3e50;
  --bg-panel: #f8fafc;
  --text-main: #0f172a;
  --text-muted: #64748b;
  --btn-bg: #e2e8f0;
  --btn-hover: #cbd5e1;
  --btn-active: #2563eb;
}

html, body {
  margin: 0;
  padding: 0;
  overflow: hidden !important;
  background: transparent;
}

* {
  box-sizing: border-box;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.chessnote-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: var(--bg-panel);
  color: var(--text-main);
  padding: 14px;
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  max-width: 100%;
  margin: 0;
}

.chessnote-layout {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 14px;
  align-items: flex-start;
}

.chessnote-board-container {
  display: flex;
  flex-direction: row;
  gap: 8px;
  align-items: stretch;
}

/* Evaluation Bar */
.chess-eval-bar-wrapper {
  width: 22px;
  height: 360px;
  background: #262626;
  border-radius: 5px;
  overflow: hidden;
  display: flex;
  flex-direction: column-reverse;
  position: relative;
  border: 1px solid rgba(148, 163, 184, 0.3);
}

.chess-eval-bar-fill {
  background: #ffffff;
  width: 100%;
  height: 50%;
  transition: height 0.3s ease-out;
}

.chess-eval-bar-text {
  position: absolute;
  top: 4px;
  left: 0;
  right: 0;
  font-size: 10px;
  font-weight: 800;
  text-align: center;
  color: #0f172a;
  z-index: 5;
  pointer-events: none;
}

.chessnote-board-wrapper {
  position: relative;
  width: 360px;
  height: 360px;
  flex-shrink: 0;
  user-select: none;
  -webkit-user-select: none;
  touch-action: manipulation;
  border-radius: 6px;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

@media (max-width: 600px) {
  .chessnote-layout {
    flex-direction: column;
    align-items: center;
  }
  .chessnote-board-container {
    width: 100%;
    justify-content: center;
  }
  .chessnote-board-wrapper {
    width: min(340px, calc(100vw - 50px));
    height: min(340px, calc(100vw - 50px));
  }
  .chess-eval-bar-wrapper {
    height: min(340px, calc(100vw - 50px)) !important;
  }
  .chessnote-panel {
    width: 100%;
    min-width: 0;
  }
  .chess-controls {
    justify-content: center;
  }
  .chess-btn {
    min-width: 42px;
    min-height: 38px;
    font-size: 13px;
  }
}

.chess-board {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  grid-template-rows: repeat(8, 1fr);
  width: 100%;
  height: 100%;
  position: relative;
}

.chess-sq {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}

.chess-sq.light { background-color: var(--sq-light); }
.chess-sq.dark { background-color: var(--sq-dark); }
.chess-sq.selected { background-color: var(--sq-select) !important; }
.chess-sq.highlight { background-color: var(--sq-highlight) !important; }

.chess-sq.dest::after {
  content: "";
  position: absolute;
  width: 28%;
  height: 28%;
  background-color: var(--sq-dest);
  border-radius: 50%;
  pointer-events: none;
}

.chess-sq.dest.has-piece::after {
  width: 88%;
  height: 88%;
  background: transparent;
  border: 4px solid var(--sq-dest);
  border-radius: 50%;
}

.chess-piece {
  width: 90%;
  height: 90%;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  transition: transform 0.1s ease;
}

.chess-coord {
  position: absolute;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  pointer-events: none;
  opacity: 0.75;
}

.coord-file { bottom: 2px; right: 3px; }
.coord-rank { top: 2px; left: 3px; }
.chess-sq.light .chess-coord { color: var(--sq-dark); }
.chess-sq.dark .chess-coord { color: var(--sq-light); }

.chess-arrows-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 10;
  overflow: visible;
}

.chessnote-panel {
  flex: 1;
  min-width: 260px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.chess-header {
  border-bottom: 1px solid rgba(148, 163, 184, 0.2);
  padding-bottom: 6px;
}

.chess-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-main);
  margin-bottom: 2px;
}

.chess-subtitle {
  font-size: 12px;
  color: var(--text-muted);
}

.chess-controls {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.chess-btn {
  background: var(--btn-bg);
  color: var(--text-main);
  border: 1px solid rgba(148, 163, 184, 0.25);
  padding: 5px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: all 0.15s ease;
}

.chess-btn:hover {
  background: var(--btn-hover);
  border-color: rgba(148, 163, 184, 0.4);
}

.chess-btn:active {
  transform: translateY(1px);
}

.chess-btn.active {
  background: var(--btn-active);
  color: #ffffff;
  border-color: var(--btn-active);
}

.chess-btn.btn-engine {
  background: #1e3a8a;
  color: #93c5fd;
  border-color: #3b82f6;
}
.chess-btn.btn-engine.active {
  background: #2563eb;
  color: #ffffff;
}

.chess-engine-panel {
  background: rgba(30, 58, 138, 0.2);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 8px;
  padding: 8px;
  font-size: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.engine-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.engine-score {
  font-weight: 800;
  font-size: 13px;
  color: #38bdf8;
}

.engine-bestmove {
  font-weight: 600;
  color: #4ade80;
}

.chess-pgn-tree {
  max-height: 200px;
  overflow-y: auto;
  background: rgba(0, 0, 0, 0.15);
  border-radius: 8px;
  padding: 8px;
  font-size: 13px;
  line-height: 1.8;
}

.move-num {
  font-weight: 700;
  color: var(--text-muted);
  margin-right: 4px;
}

.move-item {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 5px;
  border-radius: 4px;
  cursor: pointer;
  margin: 1px 2px;
  font-weight: 500;
}

.move-item:hover {
  background: rgba(56, 189, 248, 0.2);
}

.move-item.active {
  background: var(--btn-active);
  color: #ffffff;
  font-weight: 700;
}

.badge-brilliant { color: #06b6d4; font-weight: 900; }
.badge-great { color: #3b82f6; font-weight: 900; }
.badge-best { color: #22c55e; font-weight: 700; }
.badge-inaccuracy { color: #eab308; font-weight: 700; }
.badge-mistake { color: #f97316; font-weight: 700; }
.badge-blunder { color: #ef4444; font-weight: 900; }

.review-report-box {
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 8px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.accuracy-row {
  display: flex;
  justify-content: space-around;
  align-items: center;
  font-size: 13px;
  font-weight: 700;
}

.accuracy-white { color: #f8fafc; }
.accuracy-black { color: #94a3b8; }

.review-status {
  font-size: 12px;
  color: #94a3b8;
}
.review-status.error {
  color: #ef4444;
  font-weight: 600;
}

.chess-btn.btn-ai {
  background: #4c1d95;
  color: #d8b4fe;
  border-color: #7c3aed;
}
.chess-btn.btn-ai.active {
  background: #7c3aed;
  color: #ffffff;
}

.chess-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.chess-edit-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: rgba(234, 179, 8, 0.12);
  border: 1px solid rgba(234, 179, 8, 0.35);
  border-radius: 8px;
  padding: 10px;
}

.chess-edit-palette {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 4px;
}

.chess-edit-piece-btn {
  background: var(--btn-bg);
  border: 2px solid transparent;
  border-radius: 6px;
  padding: 2px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 32px;
}

.chess-edit-piece-btn:hover {
  background: var(--btn-hover);
}

.chess-edit-piece-btn.armed {
  border-color: #eab308;
  background: rgba(234, 179, 8, 0.25);
}

.chess-edit-tools {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--text-main);
}

.chess-edit-tool.armed {
  background: #eab308;
  color: #1e293b;
  border-color: #eab308;
}

.chess-edit-turn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}

.chess-edit-fen-row {
  display: flex;
  gap: 6px;
}

.chess-edit-fen-input {
  flex: 1;
  min-width: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  background: rgba(0, 0, 0, 0.2);
  color: var(--text-main);
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 6px;
  padding: 5px 8px;
}

.ai-coach-panel {
  background: rgba(76, 29, 149, 0.2);
  border: 1px solid rgba(124, 58, 237, 0.3);
  border-radius: 8px;
  padding: 10px;
  font-size: 13px;
  line-height: 1.5;
  color: #e9d5ff;
  white-space: pre-wrap;
}
.ai-coach-panel.error {
  color: #ef4444;
  font-weight: 600;
}

.puzzle-banner {
  padding: 8px 12px;
  border-radius: 6px;
  font-weight: 600;
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.puzzle-banner.pending { background: rgba(56, 189, 248, 0.15); color: #38bdf8; }
.puzzle-banner.correct { background: rgba(34, 197, 94, 0.2); color: #22c55e; }
.puzzle-banner.wrong { background: rgba(239, 68, 68, 0.2); color: #ef4444; }

.chess-error-banner {
  padding: 8px 12px;
  border-radius: 6px;
  font-weight: 600;
  font-size: 12px;
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

.promotion-picker {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 20;
  background: rgba(15, 23, 42, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.promotion-picker button {
  width: 48px;
  height: 48px;
  border: 2px solid #38bdf8;
  border-radius: 8px;
  background: #1e293b;
  cursor: pointer;
  padding: 4px;
}

.promotion-picker button:hover { background: #334155; }

.puzzle-hint-box {
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
  border-left: 3px solid #f59e0b;
}

.fen-footer {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  color: var(--text-muted);
  background: rgba(0, 0, 0, 0.2);
  padding: 6px 10px;
  border-radius: 6px;
  word-break: break-all;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.chess-related-games {
  margin-top: 4px;
  padding: 8px 10px;
  background: rgba(0, 0, 0, 0.15);
  border-radius: 8px;
  font-size: 12px;
}

.chess-related-title {
  font-weight: 600;
  margin-bottom: 4px;
  color: var(--text-muted);
}

.chess-related-item {
  display: flex;
  flex-direction: column;
  padding: 4px 0;
}

.chess-related-item a {
  color: inherit;
  text-decoration: underline;
}

.chess-related-reason {
  font-size: 11px;
  color: var(--text-muted);
}

.chess-theme-modal {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: var(--bg-panel, #1e293b);
  border: 1px solid rgba(148, 163, 184, 0.3);
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
  border-radius: 10px;
  padding: 14px;
  z-index: 50;
  min-width: 250px;
  max-width: 90%;
  display: flex;
  flex-direction: column;
  gap: 10px;
  color: var(--text-main, #f1f5f9);
}

.chess-theme-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  font-weight: 700;
  border-bottom: 1px solid rgba(148, 163, 184, 0.2);
  padding-bottom: 6px;
}

.chess-theme-modal-close {
  background: transparent;
  border: none;
  color: var(--text-muted, #94a3b8);
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  padding: 2px 4px;
  border-radius: 4px;
}
.chess-theme-modal-close:hover {
  background: rgba(148, 163, 184, 0.2);
  color: var(--text-main, #f1f5f9);
}

.chess-theme-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.chess-theme-field label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted, #94a3b8);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.chess-theme-select {
  background: var(--btn-bg, #334155);
  color: var(--text-main, #f1f5f9);
  border: 1px solid rgba(148, 163, 184, 0.3);
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  outline: none;
}
.chess-theme-select:focus {
  border-color: var(--btn-active, #2563eb);
}
.chess-theme-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 4px;
}
.chess-theme-btn-default {
  background: #2563eb;
  color: #ffffff;
  border: none;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  transition: background 0.15s ease;
}
.chess-theme-btn-default:hover {
  background: #1d4ed8;
}
.chess-theme-btn-reset {
  background: transparent;
  color: var(--text-muted, #94a3b8);
  border: 1px solid rgba(148, 163, 184, 0.3);
  padding: 5px 8px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}
.chess-theme-btn-reset:hover {
  background: rgba(148, 163, 184, 0.15);
  color: var(--text-main, #f1f5f9);
}
.chess-theme-status {
  font-size: 11px;
  color: #10b981;
  text-align: center;
  font-weight: 600;
  padding: 2px 0;
}
`;
