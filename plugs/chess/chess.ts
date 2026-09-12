import { system } from "@silverbulletmd/silverbullet/syscalls";
import { Chess } from "chess.js";
import { CHESS_CSS } from "./board_renderer.ts";
import { findRelatedGames, type RelatedGameMatch } from "./related_games.ts";
import { hasBothKings, openChessLenient } from "./fen_utils.ts";
import {
  buildMoveList,
  generateBoardThemeCss,
  getAllBoardThemes,
  getAllPieceSets,
  getBoardTheme,
} from "./external_syscalls.ts";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function safeGetConfig<T>(key: string, defaultValue: T): Promise<T> {
  try {
    return await system.getConfig<T>(key, defaultValue);
  } catch {
    return defaultValue;
  }
}

function generateThemeModalHtml(widgetId: string): string {
  return `
  <div class="chess-theme-modal" id="${widgetId}_theme_modal" style="display: none;">
    <div class="chess-theme-modal-header">
      <span>🎨 Tuỳ Chỉnh & Cài Đặt Giao Diện Cờ</span>
      <button class="chess-theme-modal-close" id="${widgetId}_theme_close" title="Đóng">✕</button>
    </div>
    <div class="chess-theme-field">
      <label for="${widgetId}_piece_select">Bộ quân cờ (Piece Set)</label>
      <select class="chess-theme-select" id="${widgetId}_piece_select">
        <option value="merida">Merida (Chuẩn giáo khoa / Sách báo)</option>
        <option value="alpha">Alpha (Sách cờ châu Âu)</option>
        <option value="leipzig">Leipzig (Truyền thống Đức)</option>
        <option value="cburnett">Staunton Hiện đại (Cburnett)</option>
        <option value="maestro">Maestro (Tạp chí FIDE / Informator)</option>
        <option value="spatial">Báo in / Đơn sắc (Spatial)</option>
      </select>
    </div>
    <div class="chess-theme-field">
      <label for="${widgetId}_board_select">Màu bàn cờ (Board Theme)</label>
      <select class="chess-theme-select" id="${widgetId}_board_select">
        <option value="textbook">Giáo khoa / Sách báo (Textbook)</option>
        <option value="wood">Gỗ kinh điển (Classic Wood)</option>
        <option value="green">Xanh thi đấu (Tournament Green)</option>
        <option value="blue">Xanh dương hiện đại (ChessBase Blue)</option>
        <option value="maple">Gỗ óc chó cao cấp (Walnut / Maple)</option>
        <option value="monochrome">Báo in đen trắng (Newspaper B&W)</option>
        <option value="parchment">Giấy da cổ điển (Parchment)</option>
        <option value="dark">Giao diện tối (Dark Slate)</option>
      </select>
    </div>
    <div class="chess-theme-actions">
      <button class="chess-theme-btn-default" id="${widgetId}_save_default_btn" title="Lưu giao diện này làm mặc định cho tất cả tài liệu">
        ⭐ Đặt làm mặc định cho mọi tài liệu
      </button>
      <button class="chess-theme-btn-reset" id="${widgetId}_reset_default_btn" title="Khôi phục mặc định chuẩn Textbook & Merida">
        🔄 Khôi phục chuẩn Textbook
      </button>
      <div class="chess-theme-status" id="${widgetId}_theme_status" style="display: none;"></div>
    </div>
  </div>`;
}

/** Compact error state shown instead of a board when input can't be parsed. */
function errorWidgetHtml(title: string, message: string): string {
  return `
<style>${CHESS_CSS}</style>
<div class="chessnote-container">
  <div class="chess-header">
    <div class="chess-title">⚠️ ${escapeHtml(title)}</div>
  </div>
  <div style="padding: 8px 4px; color: var(--text-muted, #94a3b8);">${escapeHtml(message)}</div>
</div>`;
}

/**
 * Legal destination squares for the piece on `square`, using real chess.js
 * rules (checks, pins, castling, en passant all handled by chess.js itself).
 * Exposed as a syscall (see chess.plug.yaml) so the interactive board running
 * inside the sandboxed widget iframe — which has no access to this module's
 * imports — can call back into this plug worker (where chess.js *is*
 * available) via the iframe's built-in `syscall()` bridge instead of
 * reimplementing chess rules in inline iframe JS.
 */
export function legalMoves(
  fen: string,
  square: string,
): { to: string; san: string; promotion: boolean }[] {
  try {
    const chess = openChessLenient(fen);
    const moves = chess.moves({ square: square as any, verbose: true });
    return moves.map((m) => ({
      to: m.to,
      san: m.san,
      promotion: !!m.promotion,
    }));
  } catch (_e) {
    return [];
  }
}

export interface ChessMoveResult {
  fen: string;
  san: string;
  captured?: string;
  turn: "w" | "b";
  inCheck: boolean;
  isCheckmate: boolean;
  isStalemate: boolean;
  isDraw: boolean;
  isGameOver: boolean;
}

function describeResult(
  chess: Chess,
  san: string,
  captured?: string,
): ChessMoveResult {
  return {
    fen: chess.fen(),
    san,
    captured,
    turn: chess.turn(),
    inCheck: chess.inCheck(),
    isCheckmate: chess.isCheckmate(),
    isStalemate: chess.isStalemate(),
    isDraw: chess.isDraw(),
    isGameOver: chess.isGameOver(),
  };
}

/** Applies a from/to (+ optional promotion) move to `fen` using chess.js. */
export function applyMove(
  fen: string,
  from: string,
  to: string,
  promotion?: string,
): ChessMoveResult | { error: string } {
  try {
    const chess = openChessLenient(fen);
    const move = chess.move({ from, to, promotion: promotion || undefined });
    return describeResult(chess, move.san, move.captured);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "illegal move" };
  }
}

/** Applies a move given in SAN notation to `fen` using chess.js. */
export function applySan(
  fen: string,
  san: string,
): ChessMoveResult | { error: string } {
  try {
    const chess = openChessLenient(fen);
    const move = chess.move(san);
    return describeResult(chess, move.san, move.captured);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "illegal move" };
  }
}

/**
 * FEN Code Widget with a real Arasan (NNUE, WASM) engine evaluation.
 *
 * The "Engine Eval" button calls the chess.engineEval syscall, backed by
 * engine/arasan_engine.ts, which runs the real Arasan UCI engine compiled to
 * WebAssembly. Requires the optional "Chess Engine" Library to be installed
 * in the Space (see EngineNotInstalledError in arasan_engine.ts); the panel
 * surfaces that error message when it isn't. See
 * docs/plans/2026-09-07-danh-gia-va-ke-hoach-hoan-thien-chessnote.md, Giai
 * đoạn 2.
 */
export async function fenWidget(bodyText: string, _pageName: string) {
  const lines = bodyText.trim().split("\n");
  const fen = lines[0].trim();
  let orientation: "white" | "black" = "white";
  let title = "Chess Position";
  const arrows: string[] = [];
  const highlights: Record<string, string> = {};

  const { sets: PIECE_SETS, default: DEFAULT_PIECE_SET } =
    await getAllPieceSets();
  const { themes: BOARD_THEMES, default: DEFAULT_BOARD_THEME } =
    await getAllBoardThemes();

  const globalPieceSet = await safeGetConfig<string>(
    "chess.pieceSet",
    DEFAULT_PIECE_SET,
  );
  const globalBoardTheme = await safeGetConfig<string>(
    "chess.boardTheme",
    DEFAULT_BOARD_THEME,
  );
  let blockPieceSet = globalPieceSet;
  let blockBoardTheme = globalBoardTheme;
  let hasExplicitPieceSet = false;
  let hasExplicitBoardTheme = false;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("| orientation:")) {
      orientation = line.includes("black") ? "black" : "white";
    } else if (line.startsWith("| title:")) {
      title = line.replace("| title:", "").trim();
    } else if (line.startsWith("| arrows:")) {
      const arrowList = line.replace("| arrows:", "").trim().split(",");
      arrows.push(...arrowList.map((a) => a.trim()).filter(Boolean));
    } else if (line.startsWith("| highlights:")) {
      const hlList = line.replace("| highlights:", "").trim().split(",");
      for (const hl of hlList) {
        const [sq, color] = hl.split(":").map((s) => s.trim());
        if (sq) highlights[sq] = color || "yellow";
      }
    } else if (line.startsWith("| pieceSet:") || line.startsWith("| pieces:")) {
      blockPieceSet = line.replace(/\| (pieceSet|pieces):/, "").trim();
      hasExplicitPieceSet = true;
    } else if (
      line.startsWith("| boardTheme:") ||
      line.startsWith("| theme:") ||
      line.startsWith("| board:")
    ) {
      blockBoardTheme = line.replace(/\| (boardTheme|theme|board):/, "").trim();
      hasExplicitBoardTheme = true;
    }
  }

  let noKing: boolean;
  try {
    noKing = !hasBothKings(openChessLenient(fen));
  } catch (e) {
    return {
      html: errorWidgetHtml(
        "FEN không hợp lệ",
        `Không thể đọc chuỗi FEN: "${fen}". ${e instanceof Error ? e.message : ""}`.trim(),
      ),
    };
  }

  const widgetId = `chess_fen_${Math.random().toString(36).substring(2, 9)}`;
  const initialTheme = await getBoardTheme(blockBoardTheme);

  const html = `
<style>${CHESS_CSS}</style>
<div class="chessnote-container" id="${widgetId}" style="${await generateBoardThemeCss(initialTheme)}">
  ${generateThemeModalHtml(widgetId)}
  <div class="chess-header">
    <div class="chess-title">${escapeHtml(title)}</div>
    <div class="chess-subtitle">${
      noKing
        ? "Minh hoạ chiến thuật (không đủ 2 Vua — không hỗ trợ Engine Eval/chiếu hết)"
        : "FEN Interactive Board • Arasan Engine (NNUE, WASM)"
    }</div>
  </div>
  <div class="chessnote-layout">
    <div class="chessnote-board-container">
      <div class="chess-eval-bar-wrapper" id="${widgetId}_eval_bar" style="display: none;">
        <div class="chess-eval-bar-fill" id="${widgetId}_eval_fill"></div>
        <span class="chess-eval-bar-text" id="${widgetId}_eval_text">0.0</span>
      </div>
      <div class="chessnote-board-wrapper">
        <div class="chess-board" id="${widgetId}_board"></div>
        <svg class="chess-arrows-layer" id="${widgetId}_arrows" viewBox="0 0 100 100" preserveAspectRatio="none"></svg>
      </div>
    </div>
    <div class="chessnote-panel">
      <div class="chess-error-banner" id="${widgetId}_error" style="display: none;"></div>
      <div class="chess-controls">
        <button class="chess-btn btn-engine" id="${widgetId}_eval_toggle" style="${
    noKing ? "display: none;" : ""
  }">⚡ Engine Eval</button>
        <button class="chess-btn" id="${widgetId}_theme_btn" title="Tuỳ chỉnh bàn cờ và quân cờ">🎨 Theme</button>
        <button class="chess-btn" id="${widgetId}_flip">🔄 Flip</button>
        <button class="chess-btn" id="${widgetId}_reset">⏮ Reset</button>
        <button class="chess-btn" id="${widgetId}_copy_fen">📋 Copy FEN</button>
        <button class="chess-btn" id="${widgetId}_lichess">🔍 Lichess Analysis</button>
      </div>
      <div class="chess-engine-panel" id="${widgetId}_engine_panel" style="display: none;">
        <div class="engine-line">
          <span>Engine: <strong>Arasan (NNUE, WASM)</strong></span>
          <span class="engine-score" id="${widgetId}_engine_score">Eval: 0.0</span>
        </div>
        <div class="engine-line">
          <span>Best move: <strong class="engine-bestmove" id="${widgetId}_best_move">-</strong></span>
        </div>
      </div>
      <div class="fen-footer">
        <span id="${widgetId}_fen_text">${escapeHtml(fen)}</span>
      </div>
    </div>
  </div>
</div>
`;

  const script = `
(function() {
  const PIECE_SETS = ${JSON.stringify(PIECE_SETS)};
  const BOARD_THEMES = ${JSON.stringify(BOARD_THEMES)};
  const initialFen = ${JSON.stringify(fen)};
  let currentFen = initialFen;
  let orientation = ${JSON.stringify(orientation)};
  const baseArrows = ${JSON.stringify(arrows)};
  const highlights = ${JSON.stringify(highlights)};
  const hasExplicitPieceSet = ${JSON.stringify(hasExplicitPieceSet)};
  const hasExplicitBoardTheme = ${JSON.stringify(hasExplicitBoardTheme)};

  let currentPieceSet = ${JSON.stringify(blockPieceSet)};
  let currentBoardTheme = ${JSON.stringify(blockBoardTheme)};
  try {
    const defaultPiece = localStorage.getItem("chessnote_default_piece_set") || localStorage.getItem("chessnote_piece_set");
    const defaultBoard = localStorage.getItem("chessnote_default_board_theme") || localStorage.getItem("chessnote_board_theme");
    if (!hasExplicitPieceSet && defaultPiece && PIECE_SETS[defaultPiece]) currentPieceSet = defaultPiece;
    if (!hasExplicitBoardTheme && defaultBoard && BOARD_THEMES[defaultBoard]) currentBoardTheme = defaultBoard;
  } catch (_e) {}
  
  let selectedSquare = null;
  let legalMoves = []; // [{to, san, promotion}] for the currently selected square
  let isEngineOn = false;
  let currentBestMove = null;
  let isBusy = false; // true while a move syscall round-trip is in flight

  const boardEl = document.getElementById("${widgetId}_board");
  const arrowsEl = document.getElementById("${widgetId}_arrows");
  const fenTextEl = document.getElementById("${widgetId}_fen_text");
  const errorEl = document.getElementById("${widgetId}_error");
  const flipBtn = document.getElementById("${widgetId}_flip");
  const resetBtn = document.getElementById("${widgetId}_reset");
  const copyFenBtn = document.getElementById("${widgetId}_copy_fen");
  const lichessBtn = document.getElementById("${widgetId}_lichess");
  const evalToggleBtn = document.getElementById("${widgetId}_eval_toggle");
  const evalBarEl = document.getElementById("${widgetId}_eval_bar");
  const evalFillEl = document.getElementById("${widgetId}_eval_fill");
  const evalTextEl = document.getElementById("${widgetId}_eval_text");
  const enginePanel = document.getElementById("${widgetId}_engine_panel");
  const engineScoreEl = document.getElementById("${widgetId}_engine_score");
  const bestMoveEl = document.getElementById("${widgetId}_best_move");

  const themeBtn = document.getElementById("${widgetId}_theme_btn");
  const themeModal = document.getElementById("${widgetId}_theme_modal");
  const themeCloseBtn = document.getElementById("${widgetId}_theme_close");
  const pieceSelect = document.getElementById("${widgetId}_piece_select");
  const boardSelect = document.getElementById("${widgetId}_board_select");
  const saveDefaultBtn = document.getElementById("${widgetId}_save_default_btn");
  const resetDefaultBtn = document.getElementById("${widgetId}_reset_default_btn");
  const themeStatus = document.getElementById("${widgetId}_theme_status");

  if (pieceSelect) pieceSelect.value = currentPieceSet;
  if (boardSelect) boardSelect.value = currentBoardTheme;

  function applyTheme(boardKey, pieceKey, saveAsDefault = false) {
    if (BOARD_THEMES[boardKey]) currentBoardTheme = boardKey;
    if (PIECE_SETS[pieceKey]) currentPieceSet = pieceKey;
    try {
      localStorage.setItem("chessnote_piece_set", currentPieceSet);
      localStorage.setItem("chessnote_board_theme", currentBoardTheme);
      if (saveAsDefault) {
        localStorage.setItem("chessnote_default_piece_set", currentPieceSet);
        localStorage.setItem("chessnote_default_board_theme", currentBoardTheme);
      }
    } catch (_e) {}

    const theme = BOARD_THEMES[currentBoardTheme] || BOARD_THEMES["textbook"];
    const container = document.getElementById("${widgetId}");
    if (container) {
      container.style.setProperty("--sq-light", theme.light);
      container.style.setProperty("--sq-dark", theme.dark);
      container.style.setProperty("--board-border", theme.border);
      container.style.setProperty("--sq-select", theme.select);
      container.style.setProperty("--sq-highlight", theme.highlight);
      container.style.setProperty("--sq-dest", theme.dest);
    }
    renderBoard();
  }

  // Initial theme application
  applyTheme(currentBoardTheme, currentPieceSet, false);

  if (themeBtn && themeModal) {
    themeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      themeModal.style.display = themeModal.style.display === "none" ? "flex" : "none";
    });
  }
  if (themeCloseBtn && themeModal) {
    themeCloseBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      themeModal.style.display = "none";
    });
  }
  if (pieceSelect) {
    pieceSelect.addEventListener("change", (e) => {
      applyTheme(boardSelect ? boardSelect.value : currentBoardTheme, e.target.value, false);
    });
  }
  if (boardSelect) {
    boardSelect.addEventListener("change", (e) => {
      applyTheme(e.target.value, pieceSelect ? pieceSelect.value : currentPieceSet, false);
    });
  }
  if (saveDefaultBtn) {
    saveDefaultBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const p = pieceSelect ? pieceSelect.value : currentPieceSet;
      const b = boardSelect ? boardSelect.value : currentBoardTheme;
      applyTheme(b, p, true);
      try {
        window.dispatchEvent(new CustomEvent("chessnote_theme_changed", {
          detail: { pieceSet: p, boardTheme: b }
        }));
      } catch (_e) {}
      if (themeStatus) {
        themeStatus.textContent = "✓ Đã lưu làm mặc định cho mọi tài liệu!";
        themeStatus.style.display = "block";
        setTimeout(() => { themeStatus.style.display = "none"; }, 3000);
      }
    });
  }
  if (resetDefaultBtn) {
    resetDefaultBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      try {
        localStorage.removeItem("chessnote_default_piece_set");
        localStorage.removeItem("chessnote_default_board_theme");
        localStorage.removeItem("chessnote_piece_set");
        localStorage.removeItem("chessnote_board_theme");
      } catch (_e) {}
      if (pieceSelect) pieceSelect.value = "merida";
      if (boardSelect) boardSelect.value = "textbook";
      applyTheme("textbook", "merida", false);
      try {
        window.dispatchEvent(new CustomEvent("chessnote_theme_changed", {
          detail: { pieceSet: "merida", boardTheme: "textbook" }
        }));
      } catch (_e) {}
      if (themeStatus) {
        themeStatus.textContent = "✓ Đã khôi phục chuẩn Textbook & Merida!";
        themeStatus.style.display = "block";
        setTimeout(() => { themeStatus.style.display = "none"; }, 3000);
      }
    });
  }

  window.addEventListener("chessnote_theme_changed", (e) => {
    if (!e || !e.detail) return;
    if (!hasExplicitBoardTheme && e.detail.boardTheme) {
      currentBoardTheme = e.detail.boardTheme;
      if (boardSelect) boardSelect.value = currentBoardTheme;
    }
    if (!hasExplicitPieceSet && e.detail.pieceSet) {
      currentPieceSet = e.detail.pieceSet;
      if (pieceSelect) pieceSelect.value = currentPieceSet;
    }
    applyTheme(currentBoardTheme, currentPieceSet, false);
  });

  function showError(msg) {
    if (!msg) {
      errorEl.style.display = "none";
      return;
    }
    errorEl.textContent = "⚠️ " + msg;
    errorEl.style.display = "block";
  }

  function gameOverMessage(result) {
    if (result.isCheckmate) return "Chiếu hết! " + (result.turn === "w" ? "Đen" : "Trắng") + " thắng.";
    if (result.isStalemate) return "Hết nước đi hợp lệ (Stalemate) — hòa.";
    if (result.isDraw) return "Ván đấu hòa.";
    return null;
  }

  function askPromotion(moverColor) {
    return new Promise((resolve) => {
      const picker = document.createElement("div");
      picker.className = "promotion-picker";
      const currentPieces = PIECE_SETS[currentPieceSet] || PIECE_SETS["merida"];
      ["q", "r", "b", "n"].forEach((p) => {
        const btn = document.createElement("button");
        btn.innerHTML = currentPieces[moverColor + p.toUpperCase()] || p;
        btn.addEventListener("click", () => {
          picker.remove();
          resolve(p);
        });
        picker.appendChild(btn);
      });
      boardEl.parentElement.appendChild(picker);
    });
  }

  function parseFenBoard(f) {
    const parts = f.split(" ");
    const rows = parts[0].split("/");
    const board = {};
    for (let r = 0; r < 8; r++) {
      let col = 0;
      for (const ch of rows[r]) {
        if (!isNaN(ch)) {
          col += parseInt(ch, 10);
        } else {
          const file = String.fromCharCode(97 + col);
          const rank = 8 - r;
          const isWhite = ch === ch.toUpperCase();
          board[file + rank] = (isWhite ? "w" : "b") + ch.toUpperCase();
          col++;
        }
      }
    }
    return board;
  }

  let lastEvalFen = null;
  let evalRequestSeq = 0;

  async function updateEngineEval() {
    if (!isEngineOn) return;
    if (currentFen === lastEvalFen) return;
    const mySeq = ++evalRequestSeq;
    engineScoreEl.innerText = "Đang phân tích...";
    bestMoveEl.innerText = "…";
    try {
      const result = await syscall("chess.engineEval", currentFen, 12);
      if (mySeq !== evalRequestSeq) return;
      lastEvalFen = currentFen;
      let scoreStr;
      let winChance;
      if (result.mateIn !== null && result.mateIn !== undefined) {
        scoreStr = (result.mateIn > 0 ? "M" + result.mateIn : "-M" + Math.abs(result.mateIn));
        winChance = result.mateIn > 0 ? 99 : 1;
      } else {
        const cp = result.scoreCp || 0;
        const pawns = (cp / 100).toFixed(1);
        scoreStr = cp > 0 ? "+" + pawns : String(pawns);
        winChance = 100 / (1 + Math.exp(-0.00368208 * cp));
      }
      engineScoreEl.innerText = "Arasan eval: " + scoreStr + (result.depth ? " (depth " + result.depth + ")" : "");
      evalTextEl.innerText = scoreStr;
      bestMoveEl.innerText = result.bestMove || "-";
      evalFillEl.style.height = Math.max(5, Math.min(95, winChance)) + "%";
      currentBestMove = result.bestMove && result.bestMove.length >= 4
        ? result.bestMove.slice(0, 2) + "-" + result.bestMove.slice(2, 4)
        : null;
      renderArrows();
    } catch (e) {
      if (mySeq !== evalRequestSeq) return;
      lastEvalFen = null;
      engineScoreEl.innerText = "⚠️ " + (e && e.message ? e.message : "Không thể phân tích");
      evalTextEl.innerText = "–";
      bestMoveEl.innerText = "-";
    }
  }

  function renderBoard() {
    boardEl.innerHTML = "";
    const boardState = parseFenBoard(currentFen);
    const files = orientation === "white" ? ["a","b","c","d","e","f","g","h"] : ["h","g","f","e","d","c","b","a"];
    const ranks = orientation === "white" ? [8,7,6,5,4,3,2,1] : [1,2,3,4,5,6,7,8];
    const destSquares = {};
    legalMoves.forEach((m) => { destSquares[m.to] = m; });
    const currentPieces = PIECE_SETS[currentPieceSet] || PIECE_SETS["merida"];

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const file = files[c];
        const rank = ranks[r];
        const sq = file + rank;
        const isLight = (file.charCodeAt(0) - 97 + rank) % 2 !== 0;

        const sqDiv = document.createElement("div");
        sqDiv.className = "chess-sq " + (isLight ? "light" : "dark");
        sqDiv.dataset.sq = sq;

        if (selectedSquare === sq) {
          sqDiv.classList.add("selected");
        }
        if (highlights[sq]) {
          sqDiv.classList.add("highlight");
        }
        if (destSquares[sq]) {
          sqDiv.classList.add("dest");
          if (boardState[sq]) sqDiv.classList.add("has-piece");
        }

        if (boardState[sq]) {
          const piece = boardState[sq];
          const pieceDiv = document.createElement("div");
          pieceDiv.className = "chess-piece";
          pieceDiv.innerHTML = currentPieces[piece] || "";
          sqDiv.appendChild(pieceDiv);
        }

        if (c === 7) {
          const rankLabel = document.createElement("span");
          rankLabel.className = "chess-coord coord-rank";
          rankLabel.innerText = rank;
          sqDiv.appendChild(rankLabel);
        }
        if (r === 7) {
          const fileLabel = document.createElement("span");
          fileLabel.className = "chess-coord coord-file";
          fileLabel.innerText = file;
          sqDiv.appendChild(fileLabel);
        }

        sqDiv.addEventListener("click", () => handleSquareClick(sq, boardState));
        boardEl.appendChild(sqDiv);
      }
    }
    renderArrows();
    updateEngineEval();
  }

  function renderArrows() {
    arrowsEl.innerHTML = "";
    const activeArrows = [...baseArrows];
    if (currentBestMove) activeArrows.push(currentBestMove + ":green");

    activeArrows.forEach(arrowStr => {
      const [fromTo, color] = arrowStr.split(":");
      const [from, to] = fromTo.split("-");
      if (!from || !to) return;

      const strokeColor = color === "green" ? "#22c55e" : color === "red" ? "#ef4444" : "#38bdf8";
      const files = orientation === "white" ? ["a","b","c","d","e","f","g","h"] : ["h","g","f","e","d","c","b","a"];
      const ranks = orientation === "white" ? [8,7,6,5,4,3,2,1] : [1,2,3,4,5,6,7,8];

      const fromC = files.indexOf(from[0]);
      const fromR = ranks.indexOf(parseInt(from[1], 10));
      const toC = files.indexOf(to[0]);
      const toR = ranks.indexOf(parseInt(to[1], 10));

      if (fromC === -1 || fromR === -1 || toC === -1 || toR === -1) return;

      // The <svg> has viewBox="0 0 100 100" (see the html template above) so
      // these coordinates are percentages of the board — scale-invariant
      // regardless of how large the board is actually rendered (fixes
      // arrows drifting off-square on the narrower mobile board width).
      const sqSize = 100 / 8;
      const x1 = fromC * sqSize + sqSize / 2;
      const y1 = fromR * sqSize + sqSize / 2;
      const x2 = toC * sqSize + sqSize / 2;
      const y2 = toR * sqSize + sqSize / 2;

      const markerId = "arrowhead_" + Math.random().toString(36).substring(2, 7);
      const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
      const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
      marker.setAttribute("id", markerId);
      marker.setAttribute("viewBox", "0 0 10 10");
      marker.setAttribute("refX", "5");
      marker.setAttribute("refY", "5");
      marker.setAttribute("markerWidth", "2.2");
      marker.setAttribute("markerHeight", "2.2");
      marker.setAttribute("orient", "auto-start-reverse");

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", "M 0 1 L 10 5 L 0 9 z");
      path.setAttribute("fill", strokeColor);
      marker.appendChild(path);
      defs.appendChild(marker);
      arrowsEl.appendChild(defs);

      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", x1);
      line.setAttribute("y1", y1);
      line.setAttribute("x2", x2);
      line.setAttribute("y2", y2);
      line.setAttribute("stroke", strokeColor);
      line.setAttribute("stroke-width", "1.2");
      line.setAttribute("stroke-opacity", "0.85");
      line.setAttribute("marker-end", "url(#" + markerId + ")");
      arrowsEl.appendChild(line);
    });
  }

  async function handleSquareClick(sq, boardState) {
    if (isBusy) return;

    // Clicking a highlighted legal destination while a piece is selected:
    // attempt the move for real via chess.js (through the syscall bridge).
    const attemptedMove = selectedSquare
      ? legalMoves.find((m) => m.to === sq)
      : null;
    if (selectedSquare && attemptedMove) {
      const from = selectedSquare;
      isBusy = true;
      selectedSquare = null;
      legalMoves = [];
      try {
        let promotion = undefined;
        if (attemptedMove.promotion) {
          const moverColor = currentFen.split(" ")[1] === "w" ? "w" : "b";
          promotion = await askPromotion(moverColor);
        }
        const result = await syscall("chess.applyMove", currentFen, from, sq, promotion);
        if (result && result.error) {
          showError("Nước đi không hợp lệ: " + result.error);
          renderBoard();
          return;
        }
        showError(null);
        currentFen = result.fen;
        fenTextEl.innerText = currentFen;
        const overMsg = gameOverMessage(result);
        if (overMsg) showError(overMsg);
        renderBoard();
      } finally {
        isBusy = false;
      }
      return;
    }

    if (selectedSquare === sq) {
      selectedSquare = null;
      legalMoves = [];
      renderBoard();
      return;
    }

    if (!boardState[sq]) {
      selectedSquare = null;
      legalMoves = [];
      renderBoard();
      return;
    }

    // Only allow selecting a piece belonging to the side to move (FEN's
    // active-color field), so you can't "select" the opponent's pieces.
    const activeColor = currentFen.split(" ")[1] === "w" ? "w" : "b";
    if (boardState[sq][0] !== activeColor) {
      selectedSquare = null;
      legalMoves = [];
      renderBoard();
      return;
    }

    selectedSquare = sq;
    isBusy = true;
    try {
      legalMoves = await syscall("chess.legalMoves", currentFen, sq) || [];
    } finally {
      isBusy = false;
    }
    renderBoard();
  }

  evalToggleBtn.addEventListener("click", () => {
    isEngineOn = !isEngineOn;
    evalToggleBtn.classList.toggle("active", isEngineOn);
    evalBarEl.style.display = isEngineOn ? "flex" : "none";
    enginePanel.style.display = isEngineOn ? "flex" : "none";
    if (!isEngineOn) {
      evalRequestSeq++; // invalidate any in-flight analysis
      lastEvalFen = null;
      currentBestMove = null;
      renderArrows();
    }
    updateEngineEval();
  });

  flipBtn.addEventListener("click", () => {
    orientation = orientation === "white" ? "black" : "white";
    renderBoard();
  });

  resetBtn.addEventListener("click", () => {
    currentFen = initialFen;
    selectedSquare = null;
    legalMoves = [];
    showError(null);
    fenTextEl.innerText = currentFen;
    renderBoard();
  });

  copyFenBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(currentFen);
    copyFenBtn.innerText = "✓ Copied!";
    setTimeout(() => { copyFenBtn.innerText = "📋 Copy FEN"; }, 1500);
  });

  lichessBtn.addEventListener("click", () => {
    const url = "https://lichess.org/analysis/" + encodeURIComponent(currentFen.replace(/ /g, "_"));
    window.open(url, "_blank");
  });

  renderBoard();
})();
`;

  return { html, script };
}

/**
 * PGN Code Widget with a live Arasan (NNUE, WASM) eval bar and an on-demand
 * full-game "Game Review" (also real Arasan analysis, one search per
 * position — see reviewGame() in engine/game_reviewer.ts). The move
 * list/navigation itself (buildMoveList()) stays chess.js-only and
 * synchronous so browsing the game is instant regardless of whether a full
 * review has been run.
 */
export async function pgnWidget(bodyText: string, pageName: string) {
  const trimmedPgn = bodyText.trim();
  let chess: Chess;
  try {
    chess = new Chess();
    if (trimmedPgn) {
      chess.loadPgn(trimmedPgn);
    }
  } catch (e) {
    return {
      html: errorWidgetHtml(
        "PGN không hợp lệ",
        `Không thể đọc biên bản ván đấu này. ${e instanceof Error ? e.message : ""}`.trim(),
      ),
    };
  }

  const header = chess.header();
  const white = header["White"] || "White";
  const black = header["Black"] || "Black";
  const event = header["Event"] || "Game Analysis";
  const result = header["Result"] || "*";
  const date = header["Date"] || "";
  const eco = header["ECO"] || "";

  const { sets: PIECE_SETS, default: DEFAULT_PIECE_SET } =
    await getAllPieceSets();
  const { themes: BOARD_THEMES, default: DEFAULT_BOARD_THEME } =
    await getAllBoardThemes();

  const globalPieceSet = await safeGetConfig<string>(
    "chess.pieceSet",
    DEFAULT_PIECE_SET,
  );
  const globalBoardTheme = await safeGetConfig<string>(
    "chess.boardTheme",
    DEFAULT_BOARD_THEME,
  );
  const hasExplicitPieceSet = Boolean(header["PieceSet"] || header["Pieces"]);
  const hasExplicitBoardTheme = Boolean(
    header["BoardTheme"] || header["Theme"],
  );
  const blockPieceSet =
    header["PieceSet"] || header["Pieces"] || globalPieceSet;
  const blockBoardTheme =
    header["BoardTheme"] || header["Theme"] || globalBoardTheme;

  // Cheap, chess.js-only move list for navigation — the real (engine-backed)
  // full review is fetched lazily via the chess.reviewGame syscall, only
  // when the user clicks "Game Review" (see the widget script below).
  const moveList = await buildMoveList(bodyText.trim());

  // Related games (Giai đoạn D, SQL hoá ở Phase 3): thuần rule-based (cùng
  // ECO, cùng người chơi) qua chessSql.queryRelatedGames — rẻ, không
  // AI/engine, nên tính luôn ở đây thay vì phải chờ người dùng bấm nút. Không
  // chặn render bàn cờ nếu SQLite chưa sẵn sàng hoặc lỗi tạm thời.
  let relatedGames: RelatedGameMatch[] = [];
  try {
    relatedGames = await findRelatedGames({
      page: pageName,
      white,
      black,
      eco,
    });
  } catch {
    relatedGames = [];
  }

  const initialFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQK2R w KQkq - 0 1";
  const widgetId = `chess_pgn_${Math.random().toString(36).substring(2, 9)}`;
  const initialTheme = await getBoardTheme(blockBoardTheme);

  const relatedGamesHtml =
    relatedGames.length === 0
      ? ""
      : `
      <div class="chess-related-games">
        <div class="chess-related-title">🔗 Ván liên quan</div>
        ${relatedGames
          .map(
            (g) => `
        <div class="chess-related-item">
          <a href="/${encodeURIComponent(g.page)}" target="_top">${escapeHtml(g.white)} vs ${escapeHtml(g.black)} (${escapeHtml(g.result)})</a>
          <span class="chess-related-reason">${escapeHtml(g.reasons.join(", "))}</span>
        </div>`,
          )
          .join("")}
      </div>`;

  const html = `
<style>${CHESS_CSS}</style>
<div class="chessnote-container" id="${widgetId}" style="${await generateBoardThemeCss(initialTheme)}">
  ${generateThemeModalHtml(widgetId)}
  <div class="chess-header">
    <div class="chess-title">${escapeHtml(white)} vs ${escapeHtml(black)} (${escapeHtml(result)})</div>
    <div class="chess-subtitle">${escapeHtml(event)} ${date ? "• " + escapeHtml(date) : ""} ${eco ? "• ECO: " + escapeHtml(eco) : ""}</div>
  </div>
  <div class="chessnote-layout">
    <div class="chessnote-board-container">
      <div class="chess-eval-bar-wrapper" id="${widgetId}_eval_bar" style="display: none;">
        <div class="chess-eval-bar-fill" id="${widgetId}_eval_fill"></div>
        <span class="chess-eval-bar-text" id="${widgetId}_eval_text">0.0</span>
      </div>
      <div class="chessnote-board-wrapper">
        <div class="chess-board" id="${widgetId}_board"></div>
        <svg class="chess-arrows-layer" id="${widgetId}_arrows" viewBox="0 0 100 100" preserveAspectRatio="none"></svg>
      </div>
    </div>
    <div class="chessnote-panel">
      <div class="chess-controls">
        <button class="chess-btn btn-engine" id="${widgetId}_eval_toggle">⚡ Engine Eval</button>
        <button class="chess-btn" id="${widgetId}_review_toggle">📊 Game Review</button>
        <button class="chess-btn" id="${widgetId}_theme_btn" title="Tuỳ chỉnh bàn cờ và quân cờ">🎨 Theme</button>
        <button class="chess-btn btn-ai" id="${widgetId}_ai_explain_toggle">🧑‍🏫 AI Giải thích</button>
        <button class="chess-btn btn-ai" id="${widgetId}_ai_annotate_toggle">📝 AI Bình luận ván</button>
        <button class="chess-btn btn-ai" id="${widgetId}_ai_tag_toggle">🏷️ AI Gợi ý tag</button>
        <button class="chess-btn" id="${widgetId}_first">⏮ First</button>
        <button class="chess-btn" id="${widgetId}_prev">◀ Prev</button>
        <button class="chess-btn" id="${widgetId}_next">▶ Next</button>
        <button class="chess-btn" id="${widgetId}_last">⏭ Last</button>
        <button class="chess-btn" id="${widgetId}_flip">🔄 Flip</button>
        <button class="chess-btn" id="${widgetId}_copy_pgn">📋 Copy PGN</button>
      </div>
      
      <div class="review-report-box" id="${widgetId}_review_box" style="display: none;">
        <div class="accuracy-row" id="${widgetId}_accuracy_row" style="display: none;">
          <span class="accuracy-white">⚪ ${escapeHtml(white)}: <strong id="${widgetId}_white_acc">-</strong></span>
          <span class="accuracy-black">⚫ ${escapeHtml(black)}: <strong id="${widgetId}_black_acc">-</strong></span>
        </div>
        <div class="review-status-line" id="${widgetId}_review_status"></div>
      </div>

      <div class="ai-explain-panel" id="${widgetId}_ai_explain_panel" style="display: none;"></div>
      <div class="ai-annotate-panel" id="${widgetId}_ai_annotate_panel" style="display: none;"></div>
      <div class="ai-tag-panel" id="${widgetId}_ai_tag_panel" style="display: none;"></div>

      <div class="chess-engine-panel" id="${widgetId}_engine_panel" style="display: none;">
        <div class="engine-line">
          <span>Engine: <strong>Arasan (NNUE, WASM)</strong></span>
          <span class="engine-score" id="${widgetId}_engine_score">Eval: 0.0</span>
        </div>
      </div>

      <div class="chess-tree" id="${widgetId}_tree"></div>
      ${relatedGamesHtml}
      <div class="fen-footer">
        <span id="${widgetId}_fen_text">${initialFen}</span>
      </div>
    </div>
  </div>
</div>
`;

  const script = `
(function() {
  const PIECE_SETS = ${JSON.stringify(PIECE_SETS)};
  const BOARD_THEMES = ${JSON.stringify(BOARD_THEMES)};
  const initialFen = ${JSON.stringify(initialFen)};
  const reviewedMoves = ${JSON.stringify(moveList)};
  const rawPgn = ${JSON.stringify(bodyText.trim())};
  const gameHeaders = ${JSON.stringify({ white, black, result, eco, event })};
  const pageName = ${JSON.stringify(pageName)};
  const hasExplicitPieceSet = ${JSON.stringify(hasExplicitPieceSet)};
  const hasExplicitBoardTheme = ${JSON.stringify(hasExplicitBoardTheme)};

  let currentPieceSet = ${JSON.stringify(blockPieceSet)};
  let currentBoardTheme = ${JSON.stringify(blockBoardTheme)};
  try {
    const defaultPiece = localStorage.getItem("chessnote_default_piece_set") || localStorage.getItem("chessnote_piece_set");
    const defaultBoard = localStorage.getItem("chessnote_default_board_theme") || localStorage.getItem("chessnote_board_theme");
    if (!hasExplicitPieceSet && defaultPiece && PIECE_SETS[defaultPiece]) currentPieceSet = defaultPiece;
    if (!hasExplicitBoardTheme && defaultBoard && BOARD_THEMES[defaultBoard]) currentBoardTheme = defaultBoard;
  } catch (_e) {}

  let currentIdx = -1;
  let orientation = "white";
  let isEngineOn = false;
  let isReviewOn = false;
  let fullReview = null;
  let reviewRequestSeq = 0;
  let lastEvalFen = null;
  let evalRequestSeq = 0;
  let isAiExplainOn = false;
  let aiExplainSeq = 0;
  const aiExplainCache = {};
  let isAnnotateOn = false;
  let annotateRequestSeq = 0;
  let annotateResult = null;
  let isTagSuggestOn = false;
  let tagSuggestRequestSeq = 0;
  let tagSuggestResult = null; // { tags, summary, model } | { error }
  // AI features need a server (proxied through /.proxy/... to ai-sidecar) that
  // the offline Capacitor mobile build doesn't have — set once at init below,
  // checked before every AI call so mobile gets a clear message instead of a
  // raw network-failure error.
  let isCapacitorEnv = false;
  const AI_UNAVAILABLE_MESSAGE =
    "Tính năng AI cần bản Web hoặc Desktop, chưa hỗ trợ trên Mobile.";

  const boardEl = document.getElementById("${widgetId}_board");
  const arrowsEl = document.getElementById("${widgetId}_arrows");
  const treeEl = document.getElementById("${widgetId}_tree");
  const fenTextEl = document.getElementById("${widgetId}_fen_text");
  const firstBtn = document.getElementById("${widgetId}_first");
  const prevBtn = document.getElementById("${widgetId}_prev");
  const nextBtn = document.getElementById("${widgetId}_next");
  const lastBtn = document.getElementById("${widgetId}_last");
  const flipBtn = document.getElementById("${widgetId}_flip");
  const copyPgnBtn = document.getElementById("${widgetId}_copy_pgn");
  const evalToggleBtn = document.getElementById("${widgetId}_eval_toggle");
  const reviewToggleBtn = document.getElementById("${widgetId}_review_toggle");
  const evalBarEl = document.getElementById("${widgetId}_eval_bar");
  const evalFillEl = document.getElementById("${widgetId}_eval_fill");
  const evalTextEl = document.getElementById("${widgetId}_eval_text");
  const enginePanel = document.getElementById("${widgetId}_engine_panel");
  const engineScoreEl = document.getElementById("${widgetId}_engine_score");
  const reviewBox = document.getElementById("${widgetId}_review_box");
  const accuracyRowEl = document.getElementById("${widgetId}_accuracy_row");
  const whiteAccEl = document.getElementById("${widgetId}_white_acc");
  const blackAccEl = document.getElementById("${widgetId}_black_acc");
  const reviewStatusEl = document.getElementById("${widgetId}_review_status");
  const aiExplainToggleBtn = document.getElementById("${widgetId}_ai_explain_toggle");
  const aiExplainPanel = document.getElementById("${widgetId}_ai_explain_panel");
  const aiAnnotateToggleBtn = document.getElementById("${widgetId}_ai_annotate_toggle");
  const aiAnnotatePanel = document.getElementById("${widgetId}_ai_annotate_panel");
  const aiTagToggleBtn = document.getElementById("${widgetId}_ai_tag_toggle");
  const aiTagPanel = document.getElementById("${widgetId}_ai_tag_panel");

  const themeBtn = document.getElementById("${widgetId}_theme_btn");
  const themeModal = document.getElementById("${widgetId}_theme_modal");
  const themeCloseBtn = document.getElementById("${widgetId}_theme_close");
  const pieceSelect = document.getElementById("${widgetId}_piece_select");
  const boardSelect = document.getElementById("${widgetId}_board_select");
  const saveDefaultBtn = document.getElementById("${widgetId}_save_default_btn");
  const resetDefaultBtn = document.getElementById("${widgetId}_reset_default_btn");
  const themeStatus = document.getElementById("${widgetId}_theme_status");

  if (pieceSelect) pieceSelect.value = currentPieceSet;
  if (boardSelect) boardSelect.value = currentBoardTheme;

  function applyTheme(boardKey, pieceKey, saveAsDefault = false) {
    if (BOARD_THEMES[boardKey]) currentBoardTheme = boardKey;
    if (PIECE_SETS[pieceKey]) currentPieceSet = pieceKey;
    try {
      localStorage.setItem("chessnote_piece_set", currentPieceSet);
      localStorage.setItem("chessnote_board_theme", currentBoardTheme);
      if (saveAsDefault) {
        localStorage.setItem("chessnote_default_piece_set", currentPieceSet);
        localStorage.setItem("chessnote_default_board_theme", currentBoardTheme);
      }
    } catch (_e) {}

    const theme = BOARD_THEMES[currentBoardTheme] || BOARD_THEMES["textbook"];
    const container = document.getElementById("${widgetId}");
    if (container) {
      container.style.setProperty("--sq-light", theme.light);
      container.style.setProperty("--sq-dark", theme.dark);
      container.style.setProperty("--board-border", theme.border);
      container.style.setProperty("--sq-select", theme.select);
      container.style.setProperty("--sq-highlight", theme.highlight);
      container.style.setProperty("--sq-dest", theme.dest);
    }
    renderBoard();
  }

  // Initial theme application
  applyTheme(currentBoardTheme, currentPieceSet, false);

  if (themeBtn && themeModal) {
    themeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      themeModal.style.display = themeModal.style.display === "none" ? "flex" : "none";
    });
  }
  if (themeCloseBtn && themeModal) {
    themeCloseBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      themeModal.style.display = "none";
    });
  }
  if (pieceSelect) {
    pieceSelect.addEventListener("change", (e) => {
      applyTheme(boardSelect ? boardSelect.value : currentBoardTheme, e.target.value, false);
    });
  }
  if (boardSelect) {
    boardSelect.addEventListener("change", (e) => {
      applyTheme(e.target.value, pieceSelect ? pieceSelect.value : currentPieceSet, false);
    });
  }
  if (saveDefaultBtn) {
    saveDefaultBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const p = pieceSelect ? pieceSelect.value : currentPieceSet;
      const b = boardSelect ? boardSelect.value : currentBoardTheme;
      applyTheme(b, p, true);
      try {
        window.dispatchEvent(new CustomEvent("chessnote_theme_changed", {
          detail: { pieceSet: p, boardTheme: b }
        }));
      } catch (_e) {}
      if (themeStatus) {
        themeStatus.textContent = "✓ Đã lưu làm mặc định cho mọi tài liệu!";
        themeStatus.style.display = "block";
        setTimeout(() => { themeStatus.style.display = "none"; }, 3000);
      }
    });
  }
  if (resetDefaultBtn) {
    resetDefaultBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      try {
        localStorage.removeItem("chessnote_default_piece_set");
        localStorage.removeItem("chessnote_default_board_theme");
        localStorage.removeItem("chessnote_piece_set");
        localStorage.removeItem("chessnote_board_theme");
      } catch (_e) {}
      if (pieceSelect) pieceSelect.value = "merida";
      if (boardSelect) boardSelect.value = "textbook";
      applyTheme("textbook", "merida", false);
      try {
        window.dispatchEvent(new CustomEvent("chessnote_theme_changed", {
          detail: { pieceSet: "merida", boardTheme: "textbook" }
        }));
      } catch (_e) {}
      if (themeStatus) {
        themeStatus.textContent = "✓ Đã khôi phục chuẩn Textbook & Merida!";
        themeStatus.style.display = "block";
        setTimeout(() => { themeStatus.style.display = "none"; }, 3000);
      }
    });
  }

  window.addEventListener("chessnote_theme_changed", (e) => {
    if (!e || !e.detail) return;
    if (!hasExplicitBoardTheme && e.detail.boardTheme) {
      currentBoardTheme = e.detail.boardTheme;
      if (boardSelect) boardSelect.value = currentBoardTheme;
    }
    if (!hasExplicitPieceSet && e.detail.pieceSet) {
      currentPieceSet = e.detail.pieceSet;
      if (pieceSelect) pieceSelect.value = currentPieceSet;
    }
    applyTheme(currentBoardTheme, currentPieceSet, false);
  });

  syscall("system.isCapacitor").then((v) => {
    isCapacitorEnv = v;
    if (!v) return;
    for (const btn of [aiExplainToggleBtn, aiAnnotateToggleBtn, aiTagToggleBtn]) {
      btn.disabled = true;
      btn.title = AI_UNAVAILABLE_MESSAGE;
    }
  }).catch(() => {});

  function parseFenBoard(f) {
    const parts = f.split(" ");
    const rows = parts[0].split("/");
    const board = {};
    for (let r = 0; r < 8; r++) {
      let col = 0;
      for (const ch of rows[r]) {
        if (!isNaN(ch)) {
          col += parseInt(ch, 10);
        } else {
          const file = String.fromCharCode(97 + col);
          const rank = 8 - r;
          const isWhite = ch === ch.toUpperCase();
          board[file + rank] = (isWhite ? "w" : "b") + ch.toUpperCase();
          col++;
        }
      }
    }
    return board;
  }

  function getCurrentFen() {
    return currentIdx === -1 ? initialFen : reviewedMoves[currentIdx].fenAfter;
  }

  // Real Arasan (NNUE, WASM) analysis of whatever position is currently
  // shown, via the same chess.engineEval syscall fenWidget uses — analyzes
  // one position at a time as the user steps through the game, independent
  // of the (much slower, on-demand) full-game "Game Review" below.
  async function updateEngineEval() {
    if (!isEngineOn) return;
    const fen = getCurrentFen();
    if (fen === lastEvalFen) return;
    const mySeq = ++evalRequestSeq;
    engineScoreEl.innerText = "Đang phân tích...";
    evalTextEl.innerText = "…";
    try {
      const result = await syscall("chess.engineEval", fen, 12);
      if (mySeq !== evalRequestSeq) return; // a newer position was requested meanwhile
      lastEvalFen = fen;
      let scoreStr;
      let winChance;
      if (result.mateIn !== null && result.mateIn !== undefined) {
        scoreStr = (result.mateIn > 0 ? "M" + result.mateIn : "-M" + Math.abs(result.mateIn));
        winChance = result.mateIn > 0 ? 99 : 1;
      } else {
        const cp = result.scoreCp || 0;
        const pawns = (cp / 100).toFixed(1);
        scoreStr = cp > 0 ? "+" + pawns : String(pawns);
        winChance = 100 / (1 + Math.exp(-0.00368208 * cp));
      }
      engineScoreEl.innerText = "Arasan eval: " + scoreStr + (result.depth ? " (depth " + result.depth + ")" : "");
      evalTextEl.innerText = scoreStr;
      evalFillEl.style.height = Math.max(5, Math.min(95, winChance)) + "%";
    } catch (e) {
      if (mySeq !== evalRequestSeq) return;
      lastEvalFen = null;
      engineScoreEl.innerText = "⚠️ " + (e && e.message ? e.message : "Không thể phân tích");
      evalTextEl.innerText = "–";
    }
  }

  // AI Coach: giải thích nước đang chọn, CHỈ khả dụng sau khi "Game Review" đã
  // gán cpl/classification/bestMoveSan vào reviewedMoves[idx] (xem
  // ensureFullReview() bên dưới) — nếu chưa đủ số liệu, không gọi AI, chỉ nhắc.
  // Kết quả cache theo idx để xem lại nước cũ không tốn tiền gọi lại.
  async function ensureAiExplain(idx) {
    if (!isAiExplainOn) return;
    if (isCapacitorEnv) {
      aiExplainPanel.classList.add("error");
      aiExplainPanel.innerText = "⚠️ " + AI_UNAVAILABLE_MESSAGE;
      return;
    }
    if (idx < 0 || !reviewedMoves[idx] || reviewedMoves[idx].classification == null) {
      aiExplainPanel.classList.remove("error");
      aiExplainPanel.innerText = "Bật \\"Game Review\\" rồi chọn một nước để xem giải thích.";
      return;
    }
    if (aiExplainCache[idx]) {
      aiExplainPanel.classList.remove("error");
      aiExplainPanel.innerText = aiExplainCache[idx];
      return;
    }
    const mySeq = ++aiExplainSeq;
    aiExplainPanel.classList.remove("error");
    aiExplainPanel.innerText = "⏳ Đang hỏi AI Coach...";
    try {
      const result = await syscall("chess.ai.explainMove", reviewedMoves[idx]);
      if (mySeq !== aiExplainSeq) return; // người dùng đã chuyển sang nước khác
      if (result.ok) {
        aiExplainCache[idx] = result.text;
        aiExplainPanel.innerText = result.text;
      } else {
        aiExplainPanel.classList.add("error");
        aiExplainPanel.innerText = "⚠️ " + result.error;
      }
    } catch (e) {
      if (mySeq !== aiExplainSeq) return;
      aiExplainPanel.classList.add("error");
      aiExplainPanel.innerText = "⚠️ " + (e && e.message ? e.message : "Không gọi được AI.");
    }
  }

  function updateAiExplain() {
    if (isAiExplainOn) ensureAiExplain(currentIdx);
  }

  // Bình luận toàn ván: CHỈ 1 lần gọi AI cho cả ván (không lặp theo từng nước),
  // dùng toàn bộ fullReview (đã có sau khi bật Game Review) làm ngữ cảnh.
  async function ensureAnnotate() {
    if (isCapacitorEnv) {
      aiAnnotatePanel.classList.add("error");
      aiAnnotatePanel.innerText = "⚠️ " + AI_UNAVAILABLE_MESSAGE;
      return;
    }
    if (annotateResult) {
      aiAnnotatePanel.classList.remove("error");
      aiAnnotatePanel.innerText = annotateResult;
      return;
    }
    if (!fullReview) {
      aiAnnotatePanel.classList.remove("error");
      aiAnnotatePanel.innerText = "Bật \\"Game Review\\" trước để AI có đủ số liệu bình luận.";
      return;
    }
    const mySeq = ++annotateRequestSeq;
    aiAnnotatePanel.classList.remove("error");
    aiAnnotatePanel.innerText = "⏳ Đang nhờ AI bình luận toàn ván...";
    try {
      const result = await syscall("chess.ai.annotateGame", fullReview, gameHeaders);
      if (mySeq !== annotateRequestSeq) return;
      if (result.ok) {
        annotateResult = result.text;
        aiAnnotatePanel.innerText = result.text;
      } else {
        aiAnnotatePanel.classList.add("error");
        aiAnnotatePanel.innerText = "⚠️ " + result.error;
      }
    } catch (e) {
      if (mySeq !== annotateRequestSeq) return;
      aiAnnotatePanel.classList.add("error");
      aiAnnotatePanel.innerText = "⚠️ " + (e && e.message ? e.message : "Không gọi được AI.");
    }
  }

  // Gợi ý tag + tóm tắt: 1 lần gọi AI (cache trong phiên widget này), người dùng
  // phải bấm "Áp dụng" mới thật sự ghi vào frontmatter — không có gì tự động ghi
  // đè dữ liệu ghi chú chỉ vì mở widget lên xem.
  function renderTagSuggest() {
    if (!tagSuggestResult) return;
    aiTagPanel.innerHTML = "";
    if (tagSuggestResult.error) {
      aiTagPanel.classList.add("error");
      aiTagPanel.innerText = "⚠️ " + tagSuggestResult.error;
      return;
    }
    aiTagPanel.classList.remove("error");
    const tagsLine = document.createElement("div");
    tagsLine.innerText = "Tag gợi ý: " + tagSuggestResult.tags.map((t) => "#" + t).join(" ");
    const summaryLine = document.createElement("div");
    summaryLine.innerText = "Tóm tắt: " + tagSuggestResult.summary;
    const applyRow = document.createElement("div");
    applyRow.style.marginTop = "6px";
    const applyBtn = document.createElement("button");
    applyBtn.className = "chess-btn btn-ai";
    applyBtn.innerText = "✅ Áp dụng vào ghi chú";
    const applyStatus = document.createElement("span");
    applyStatus.style.marginLeft = "8px";
    applyBtn.addEventListener("click", async () => {
      applyBtn.disabled = true;
      applyStatus.innerText = "⏳ Đang áp dụng...";
      try {
        const result = await syscall(
          "chess.applyTagSuggestion",
          pageName,
          tagSuggestResult.tags,
          tagSuggestResult.summary,
          tagSuggestResult.model || "",
        );
        if (result && result.ok) {
          applyStatus.innerText = "✓ Đã áp dụng vào frontmatter.";
        } else {
          applyBtn.disabled = false;
          applyStatus.innerText = "⚠️ " + ((result && result.error) || "Không áp dụng được.");
        }
      } catch (e) {
        applyBtn.disabled = false;
        applyStatus.innerText = "⚠️ " + (e && e.message ? e.message : "Không áp dụng được.");
      }
    });
    applyRow.appendChild(applyBtn);
    applyRow.appendChild(applyStatus);
    aiTagPanel.appendChild(tagsLine);
    aiTagPanel.appendChild(summaryLine);
    aiTagPanel.appendChild(applyRow);
  }

  async function ensureTagSuggest() {
    if (isCapacitorEnv) {
      tagSuggestResult = { error: AI_UNAVAILABLE_MESSAGE };
      renderTagSuggest();
      return;
    }
    if (tagSuggestResult) {
      renderTagSuggest();
      return;
    }
    const mySeq = ++tagSuggestRequestSeq;
    aiTagPanel.classList.remove("error");
    aiTagPanel.innerText = "⏳ Đang hỏi AI gợi ý tag...";
    try {
      const openingMoves = reviewedMoves.slice(0, 12).map((m) => m.san).join(" ");
      const result = await syscall("chess.ai.suggestTags", { ...gameHeaders, openingMoves });
      if (mySeq !== tagSuggestRequestSeq) return;
      tagSuggestResult = result.ok
        ? { tags: result.tags, summary: result.summary, model: result.model }
        : { error: result.error };
      renderTagSuggest();
    } catch (e) {
      if (mySeq !== tagSuggestRequestSeq) return;
      tagSuggestResult = { error: (e && e.message) || "Không gọi được AI." };
      renderTagSuggest();
    }
  }

  function renderBoard() {
    boardEl.innerHTML = "";
    const currentFen = getCurrentFen();
    fenTextEl.innerText = currentFen;
    const boardState = parseFenBoard(currentFen);
    const files = orientation === "white" ? ["a","b","c","d","e","f","g","h"] : ["h","g","f","e","d","c","b","a"];
    const ranks = orientation === "white" ? [8,7,6,5,4,3,2,1] : [1,2,3,4,5,6,7,8];
    const currentPieces = PIECE_SETS[currentPieceSet] || PIECE_SETS["merida"];

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const file = files[c];
        const rank = ranks[r];
        const sq = file + rank;
        const isLight = (file.charCodeAt(0) - 97 + rank) % 2 !== 0;

        const sqDiv = document.createElement("div");
        sqDiv.className = "chess-sq " + (isLight ? "light" : "dark");
        sqDiv.dataset.sq = sq;

        if (boardState[sq]) {
          const piece = boardState[sq];
          const pieceDiv = document.createElement("div");
          pieceDiv.className = "chess-piece";
          pieceDiv.innerHTML = currentPieces[piece] || "";
          sqDiv.appendChild(pieceDiv);
        }

        if (c === 7) {
          const rankLabel = document.createElement("span");
          rankLabel.className = "chess-coord coord-rank";
          rankLabel.innerText = rank;
          sqDiv.appendChild(rankLabel);
        }
        if (r === 7) {
          const fileLabel = document.createElement("span");
          fileLabel.className = "chess-coord coord-file";
          fileLabel.innerText = file;
          sqDiv.appendChild(fileLabel);
        }

        boardEl.appendChild(sqDiv);
      }
    }
    updateTreeHighlight();
    updateEngineEval();
    updateAiExplain();
  }

  function getBadgeHtml(cls) {
    if (!isReviewOn) return "";
    switch (cls) {
      case "brilliant": return '<span class="badge-brilliant" title="Brilliant">!!</span>';
      case "great": return '<span class="badge-great" title="Great Move">!</span>';
      case "best": return '<span class="badge-best" title="Best Move">★</span>';
      case "inaccuracy": return '<span class="badge-inaccuracy" title="Inaccuracy">?!</span>';
      case "mistake": return '<span class="badge-mistake" title="Mistake">?</span>';
      case "blunder": return '<span class="badge-blunder" title="Blunder">??</span>';
      default: return "";
    }
  }

  function renderTree() {
    treeEl.innerHTML = "";
    let currentNum = 0;

    reviewedMoves.forEach((m, idx) => {
      if (m.isWhite) {
        currentNum = m.moveNum;
        const numSpan = document.createElement("span");
        numSpan.className = "move-num";
        numSpan.innerText = currentNum + ".";
        treeEl.appendChild(numSpan);
      }

      const moveSpan = document.createElement("span");
      moveSpan.className = "move-item";
      moveSpan.id = "${widgetId}_m_" + idx;
      moveSpan.innerHTML = m.san + " " + getBadgeHtml(m.classification);
      moveSpan.addEventListener("click", () => {
        currentIdx = idx;
        renderBoard();
      });
      treeEl.appendChild(moveSpan);
    });
  }

  function updateTreeHighlight() {
    const activeMoves = treeEl.querySelectorAll(".move-item.active");
    activeMoves.forEach(el => el.classList.remove("active"));

    if (currentIdx >= 0) {
      const currentEl = document.getElementById("${widgetId}_m_" + currentIdx);
      if (currentEl) {
        currentEl.classList.add("active");
        currentEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }

  function goToMove(idx) {
    if (idx < -1) idx = -1;
    if (idx >= reviewedMoves.length) idx = reviewedMoves.length - 1;
    currentIdx = idx;
    renderBoard();
  }

  firstBtn.addEventListener("click", () => goToMove(-1));
  prevBtn.addEventListener("click", () => goToMove(currentIdx - 1));
  nextBtn.addEventListener("click", () => goToMove(currentIdx + 1));
  lastBtn.addEventListener("click", () => goToMove(reviewedMoves.length - 1));

  flipBtn.addEventListener("click", () => {
    orientation = orientation === "white" ? "black" : "white";
    renderBoard();
  });

  evalToggleBtn.addEventListener("click", () => {
    isEngineOn = !isEngineOn;
    evalToggleBtn.classList.toggle("active", isEngineOn);
    evalBarEl.style.display = isEngineOn ? "flex" : "none";
    enginePanel.style.display = isEngineOn ? "flex" : "none";
    if (!isEngineOn) {
      evalRequestSeq++; // invalidate any in-flight analysis
      lastEvalFen = null;
    }
    updateEngineEval();
  });

  // Full-game review is a real (slow) engine batch job — fetched lazily on
  // first toggle-on via the chess.reviewGame syscall, then cached in
  // fullReview so re-toggling doesn't re-run it.
  async function ensureFullReview() {
    if (fullReview) return;
    const mySeq = ++reviewRequestSeq;
    reviewStatusEl.classList.remove("error");
    reviewStatusEl.style.display = "block";
    reviewStatusEl.innerText = "⏳ Đang phân tích toàn bộ ván bằng Arasan thật (" +
      reviewedMoves.length + " nước đi — có thể mất khá lâu)...";
    accuracyRowEl.style.display = "none";
    try {
      const report = await syscall("chess.reviewGame", rawPgn, 12);
      if (mySeq !== reviewRequestSeq) return;
      fullReview = report;
      report.moves.forEach((m, idx) => {
        if (reviewedMoves[idx]) Object.assign(reviewedMoves[idx], m);
      });
      whiteAccEl.innerText = report.whiteAccuracy + "%";
      blackAccEl.innerText = report.blackAccuracy + "%";
      accuracyRowEl.style.display = "flex";
      reviewStatusEl.style.display = "none";
      renderTree();
    } catch (e) {
      if (mySeq !== reviewRequestSeq) return;
      reviewStatusEl.classList.add("error");
      reviewStatusEl.style.display = "block";
      reviewStatusEl.innerText = "⚠️ " + (e && e.message ? e.message : "Không thể phân tích ván này.");
    }
  }

  reviewToggleBtn.addEventListener("click", () => {
    isReviewOn = !isReviewOn;
    reviewToggleBtn.classList.toggle("active", isReviewOn);
    reviewBox.style.display = isReviewOn ? "flex" : "none";
    if (isReviewOn) ensureFullReview();
    renderTree();
  });

  aiExplainToggleBtn.addEventListener("click", () => {
    isAiExplainOn = !isAiExplainOn;
    aiExplainToggleBtn.classList.toggle("active", isAiExplainOn);
    aiExplainPanel.style.display = isAiExplainOn ? "block" : "none";
    if (!isAiExplainOn) {
      aiExplainSeq++; // huỷ mọi lượt gọi AI đang bay dở
      return;
    }
    ensureAiExplain(currentIdx);
  });

  aiAnnotateToggleBtn.addEventListener("click", () => {
    isAnnotateOn = !isAnnotateOn;
    aiAnnotateToggleBtn.classList.toggle("active", isAnnotateOn);
    aiAnnotatePanel.style.display = isAnnotateOn ? "block" : "none";
    if (!isAnnotateOn) {
      annotateRequestSeq++;
      return;
    }
    ensureAnnotate();
  });

  aiTagToggleBtn.addEventListener("click", () => {
    isTagSuggestOn = !isTagSuggestOn;
    aiTagToggleBtn.classList.toggle("active", isTagSuggestOn);
    aiTagPanel.style.display = isTagSuggestOn ? "block" : "none";
    if (!isTagSuggestOn) {
      tagSuggestRequestSeq++;
      return;
    }
    ensureTagSuggest();
  });

  copyPgnBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(rawPgn);
    copyPgnBtn.innerText = "✓ Copied!";
    setTimeout(() => { copyPgnBtn.innerText = "📋 Copy PGN"; }, 1500);
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") goToMove(currentIdx - 1);
    else if (e.key === "ArrowRight") goToMove(currentIdx + 1);
    else if (e.key.toLowerCase() === "f") {
      orientation = orientation === "white" ? "black" : "white";
      renderBoard();
    }
  });

  renderTree();
  renderBoard();
})();
`;

  return { html, script };
}

/**
 * Puzzle Code Widget
 */
export async function puzzleWidget(bodyText: string, _pageName: string) {
  const lines = bodyText.trim().split("\n");
  let fen =
    "r1bqk2r/pp2bppp/2n1p3/2ppP3/3P4/2PB1N2/P1P2PPP/R1BQK2R w KQkq - 0 8";
  let turn = "white";
  let solutionStr = "";
  let hint = "";
  let themes = "";
  let rating = "";

  const { sets: PIECE_SETS, default: DEFAULT_PIECE_SET } =
    await getAllPieceSets();
  const { themes: BOARD_THEMES, default: DEFAULT_BOARD_THEME } =
    await getAllBoardThemes();

  const globalPieceSet = await safeGetConfig<string>(
    "chess.pieceSet",
    DEFAULT_PIECE_SET,
  );
  const globalBoardTheme = await safeGetConfig<string>(
    "chess.boardTheme",
    DEFAULT_BOARD_THEME,
  );
  let pieceSet = globalPieceSet;
  let boardTheme = globalBoardTheme;
  let hasExplicitPieceSet = false;
  let hasExplicitBoardTheme = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("fen:")) {
      fen = trimmed.replace("fen:", "").trim();
    } else if (trimmed.startsWith("turn:")) {
      turn = trimmed.replace("turn:", "").trim().toLowerCase();
    } else if (trimmed.startsWith("solution:")) {
      solutionStr = trimmed.replace("solution:", "").trim();
    } else if (trimmed.startsWith("hint:")) {
      hint = trimmed.replace("hint:", "").trim();
    } else if (trimmed.startsWith("themes:")) {
      themes = trimmed.replace("themes:", "").trim();
    } else if (trimmed.startsWith("rating:")) {
      rating = trimmed.replace("rating:", "").trim();
    } else if (
      trimmed.startsWith("pieceSet:") ||
      trimmed.startsWith("pieces:")
    ) {
      pieceSet = trimmed.replace(/(pieceSet|pieces):/, "").trim();
      hasExplicitPieceSet = true;
    } else if (
      trimmed.startsWith("boardTheme:") ||
      trimmed.startsWith("theme:") ||
      trimmed.startsWith("board:")
    ) {
      boardTheme = trimmed.replace(/(boardTheme|theme|board):/, "").trim();
      hasExplicitBoardTheme = true;
    }
  }

  try {
    new Chess(fen);
  } catch (e) {
    return {
      html: errorWidgetHtml(
        "FEN của bài tập không hợp lệ",
        `Không thể đọc chuỗi FEN: "${fen}". ${e instanceof Error ? e.message : ""}`.trim(),
      ),
    };
  }
  if (!solutionStr) {
    return {
      html: errorWidgetHtml(
        "Bài tập thiếu đáp án",
        'Cần khai báo dòng "solution: ..." (các nước đi SAN cách nhau bằng dấu cách) để có thể chấm đúng/sai.',
      ),
    };
  }

  const solutionMoves = solutionStr
    .split(" ")
    .map((s) => s.trim())
    .filter(Boolean);
  const widgetId = `chess_puzzle_${Math.random().toString(36).substring(2, 9)}`;
  const initialTheme = await getBoardTheme(boardTheme);

  const html = `
<style>${CHESS_CSS}</style>
<div class="chessnote-container" id="${widgetId}" style="${await generateBoardThemeCss(initialTheme)}">
  ${generateThemeModalHtml(widgetId)}
  <div class="chess-header">
    <div class="chess-title">Tactics Puzzle ${rating ? "• Rating: " + escapeHtml(rating) : ""}</div>
    <div class="chess-subtitle">${turn === "white" ? "⚪ White to move" : "⚫ Black to move"} ${themes ? "• " + escapeHtml(themes) : ""}</div>
  </div>
  <div class="chessnote-layout">
    <div class="chessnote-board-wrapper">
      <div class="chess-board" id="${widgetId}_board"></div>
    </div>
    <div class="chessnote-panel">
      <div class="chess-error-banner" id="${widgetId}_error" style="display: none;"></div>
      <div class="puzzle-banner pending" id="${widgetId}_status">
        <span>🤔 ${turn === "white" ? "White" : "Black"} to move and win!</span>
      </div>
      <div class="chess-controls">
        <button class="chess-btn" id="${widgetId}_reset">🔄 Reset Puzzle</button>
        <button class="chess-btn" id="${widgetId}_theme_btn" title="Tuỳ chỉnh bàn cờ và quân cờ">🎨 Theme</button>
        ${hint ? `<button class="chess-btn" id="${widgetId}_hint_btn">💡 Hint</button>` : ""}
        <button class="chess-btn" id="${widgetId}_solution_btn">👁 Show Solution</button>
      </div>
      <div class="puzzle-hint-box" id="${widgetId}_hint_box" style="display: none;">
        <strong>Hint:</strong> ${escapeHtml(hint)}
      </div>
      <div class="fen-footer">
        <span id="${widgetId}_solution_display" style="display: none; color: #22c55e;"><strong>Solution:</strong> ${escapeHtml(solutionStr)}</span>
      </div>
    </div>
  </div>
</div>
`;

  const script = `
(function() {
  const PIECE_SETS = ${JSON.stringify(PIECE_SETS)};
  const BOARD_THEMES = ${JSON.stringify(BOARD_THEMES)};
  const startFen = ${JSON.stringify(fen)};
  const solutionMoves = ${JSON.stringify(solutionMoves)};
  const orientation = ${JSON.stringify(turn)};
  const hasExplicitPieceSet = ${JSON.stringify(hasExplicitPieceSet)};
  const hasExplicitBoardTheme = ${JSON.stringify(hasExplicitBoardTheme)};

  let currentPieceSet = ${JSON.stringify(pieceSet)};
  let currentBoardTheme = ${JSON.stringify(boardTheme)};
  try {
    const defaultPiece = localStorage.getItem("chessnote_default_piece_set") || localStorage.getItem("chessnote_piece_set");
    const defaultBoard = localStorage.getItem("chessnote_default_board_theme") || localStorage.getItem("chessnote_board_theme");
    if (!hasExplicitPieceSet && defaultPiece && PIECE_SETS[defaultPiece]) currentPieceSet = defaultPiece;
    if (!hasExplicitBoardTheme && defaultBoard && BOARD_THEMES[defaultBoard]) currentBoardTheme = defaultBoard;
  } catch (_e) {}

  let currentFen = startFen;
  let currentStep = 0; // index into solutionMoves the solver must play next
  let selectedSquare = null;
  let legalMoves = [];
  let solved = false;
  let isBusy = false;

  const boardEl = document.getElementById("${widgetId}_board");
  const statusEl = document.getElementById("${widgetId}_status");
  const errorEl = document.getElementById("${widgetId}_error");
  const resetBtn = document.getElementById("${widgetId}_reset");
  const hintBtn = document.getElementById("${widgetId}_hint_btn");
  const hintBox = document.getElementById("${widgetId}_hint_box");
  const solutionBtn = document.getElementById("${widgetId}_solution_btn");
  const solutionDisplay = document.getElementById("${widgetId}_solution_display");

  const themeBtn = document.getElementById("${widgetId}_theme_btn");
  const themeModal = document.getElementById("${widgetId}_theme_modal");
  const themeCloseBtn = document.getElementById("${widgetId}_theme_close");
  const pieceSelect = document.getElementById("${widgetId}_piece_select");
  const boardSelect = document.getElementById("${widgetId}_board_select");
  const saveDefaultBtn = document.getElementById("${widgetId}_save_default_btn");
  const resetDefaultBtn = document.getElementById("${widgetId}_reset_default_btn");
  const themeStatus = document.getElementById("${widgetId}_theme_status");

  if (pieceSelect) pieceSelect.value = currentPieceSet;
  if (boardSelect) boardSelect.value = currentBoardTheme;

  function applyTheme(boardKey, pieceKey, saveAsDefault = false) {
    if (BOARD_THEMES[boardKey]) currentBoardTheme = boardKey;
    if (PIECE_SETS[pieceKey]) currentPieceSet = pieceKey;
    try {
      localStorage.setItem("chessnote_piece_set", currentPieceSet);
      localStorage.setItem("chessnote_board_theme", currentBoardTheme);
      if (saveAsDefault) {
        localStorage.setItem("chessnote_default_piece_set", currentPieceSet);
        localStorage.setItem("chessnote_default_board_theme", currentBoardTheme);
      }
    } catch (_e) {}

    const theme = BOARD_THEMES[currentBoardTheme] || BOARD_THEMES["textbook"];
    const container = document.getElementById("${widgetId}");
    if (container) {
      container.style.setProperty("--sq-light", theme.light);
      container.style.setProperty("--sq-dark", theme.dark);
      container.style.setProperty("--board-border", theme.border);
      container.style.setProperty("--sq-select", theme.select);
      container.style.setProperty("--sq-highlight", theme.highlight);
      container.style.setProperty("--sq-dest", theme.dest);
    }
    renderBoard();
  }

  // Initial theme application
  applyTheme(currentBoardTheme, currentPieceSet, false);

  if (themeBtn && themeModal) {
    themeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      themeModal.style.display = themeModal.style.display === "none" ? "flex" : "none";
    });
  }
  if (themeCloseBtn && themeModal) {
    themeCloseBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      themeModal.style.display = "none";
    });
  }
  if (pieceSelect) {
    pieceSelect.addEventListener("change", (e) => {
      applyTheme(boardSelect ? boardSelect.value : currentBoardTheme, e.target.value, false);
    });
  }
  if (boardSelect) {
    boardSelect.addEventListener("change", (e) => {
      applyTheme(e.target.value, pieceSelect ? pieceSelect.value : currentPieceSet, false);
    });
  }
  if (saveDefaultBtn) {
    saveDefaultBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const p = pieceSelect ? pieceSelect.value : currentPieceSet;
      const b = boardSelect ? boardSelect.value : currentBoardTheme;
      applyTheme(b, p, true);
      try {
        window.dispatchEvent(new CustomEvent("chessnote_theme_changed", {
          detail: { pieceSet: p, boardTheme: b }
        }));
      } catch (_e) {}
      if (themeStatus) {
        themeStatus.textContent = "✓ Đã lưu làm mặc định cho mọi tài liệu!";
        themeStatus.style.display = "block";
        setTimeout(() => { themeStatus.style.display = "none"; }, 3000);
      }
    });
  }
  if (resetDefaultBtn) {
    resetDefaultBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      try {
        localStorage.removeItem("chessnote_default_piece_set");
        localStorage.removeItem("chessnote_default_board_theme");
        localStorage.removeItem("chessnote_piece_set");
        localStorage.removeItem("chessnote_board_theme");
      } catch (_e) {}
      if (pieceSelect) pieceSelect.value = "merida";
      if (boardSelect) boardSelect.value = "textbook";
      applyTheme("textbook", "merida", false);
      try {
        window.dispatchEvent(new CustomEvent("chessnote_theme_changed", {
          detail: { pieceSet: "merida", boardTheme: "textbook" }
        }));
      } catch (_e) {}
      if (themeStatus) {
        themeStatus.textContent = "✓ Đã khôi phục chuẩn Textbook & Merida!";
        themeStatus.style.display = "block";
        setTimeout(() => { themeStatus.style.display = "none"; }, 3000);
      }
    });
  }

  window.addEventListener("chessnote_theme_changed", (e) => {
    if (!e || !e.detail) return;
    if (!hasExplicitBoardTheme && e.detail.boardTheme) {
      currentBoardTheme = e.detail.boardTheme;
      if (boardSelect) boardSelect.value = currentBoardTheme;
    }
    if (!hasExplicitPieceSet && e.detail.pieceSet) {
      currentPieceSet = e.detail.pieceSet;
      if (pieceSelect) pieceSelect.value = currentPieceSet;
    }
    applyTheme(currentBoardTheme, currentPieceSet, false);
  });

  function showError(msg) {
    if (!msg) { errorEl.style.display = "none"; return; }
    errorEl.textContent = "⚠️ " + msg;
    errorEl.style.display = "block";
  }

  function sameSan(a, b) {
    return a.replace(/[+#]+$/, "") === b.replace(/[+#]+$/, "");
  }

  function parseFenBoard(f) {
    const parts = f.split(" ");
    const rows = parts[0].split("/");
    const board = {};
    for (let r = 0; r < 8; r++) {
      let col = 0;
      for (const ch of rows[r]) {
        if (!isNaN(ch)) {
          col += parseInt(ch, 10);
        } else {
          const file = String.fromCharCode(97 + col);
          const rank = 8 - r;
          const isWhite = ch === ch.toUpperCase();
          board[file + rank] = (isWhite ? "w" : "b") + ch.toUpperCase();
          col++;
        }
      }
    }
    return board;
  }

  function askPromotion(moverColor) {
    return new Promise((resolve) => {
      const picker = document.createElement("div");
      picker.className = "promotion-picker";
      const currentPieces = PIECE_SETS[currentPieceSet] || PIECE_SETS["merida"];
      ["q", "r", "b", "n"].forEach((p) => {
        const btn = document.createElement("button");
        btn.innerHTML = currentPieces[moverColor + p.toUpperCase()] || p;
        btn.addEventListener("click", () => {
          picker.remove();
          resolve(p);
        });
        picker.appendChild(btn);
      });
      boardEl.parentElement.appendChild(picker);
    });
  }

  function renderBoard() {
    boardEl.innerHTML = "";
    const boardState = parseFenBoard(currentFen);
    const files = orientation === "white" ? ["a","b","c","d","e","f","g","h"] : ["h","g","f","e","d","c","b","a"];
    const ranks = orientation === "white" ? [8,7,6,5,4,3,2,1] : [1,2,3,4,5,6,7,8];
    const destSquares = {};
    legalMoves.forEach((m) => { destSquares[m.to] = m; });
    const currentPieces = PIECE_SETS[currentPieceSet] || PIECE_SETS["merida"];

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const file = files[c];
        const rank = ranks[r];
        const sq = file + rank;
        const isLight = (file.charCodeAt(0) - 97 + rank) % 2 !== 0;

        const sqDiv = document.createElement("div");
        sqDiv.className = "chess-sq " + (isLight ? "light" : "dark");
        sqDiv.dataset.sq = sq;

        if (selectedSquare === sq) {
          sqDiv.classList.add("selected");
        }
        if (destSquares[sq]) {
          sqDiv.classList.add("dest");
          if (boardState[sq]) sqDiv.classList.add("has-piece");
        }

        if (boardState[sq]) {
          const piece = boardState[sq];
          const pieceDiv = document.createElement("div");
          pieceDiv.className = "chess-piece";
          pieceDiv.innerHTML = currentPieces[piece] || "";
          sqDiv.appendChild(pieceDiv);
        }

        if (c === 7) {
          const rankLabel = document.createElement("span");
          rankLabel.className = "chess-coord coord-rank";
          rankLabel.innerText = rank;
          sqDiv.appendChild(rankLabel);
        }
        if (r === 7) {
          const fileLabel = document.createElement("span");
          fileLabel.className = "chess-coord coord-file";
          fileLabel.innerText = file;
          sqDiv.appendChild(fileLabel);
        }

        sqDiv.addEventListener("click", () => handleSquareClick(sq, boardState));
        boardEl.appendChild(sqDiv);
      }
    }
  }

  async function playOpponentReply() {
    if (currentStep >= solutionMoves.length) return;
    const san = solutionMoves[currentStep];
    const result = await syscall("chess.applySan", currentFen, san);
    if (result && result.error) {
      // Solution data itself is malformed — surface it instead of silently
      // getting stuck.
      showError("Dữ liệu đáp án bị lỗi ở nước \\"" + san + "\\": " + result.error);
      return;
    }
    currentFen = result.fen;
    currentStep++;
    renderBoard();
  }

  async function handleSquareClick(sq, boardState) {
    if (isBusy || solved) return;

    const attemptedMove = selectedSquare ? legalMoves.find((m) => m.to === sq) : null;
    if (selectedSquare && attemptedMove) {
      const from = selectedSquare;
      isBusy = true;
      selectedSquare = null;
      legalMoves = [];
      try {
        let promotion = undefined;
        if (attemptedMove.promotion) {
          const moverColor = currentFen.split(" ")[1] === "w" ? "w" : "b";
          promotion = await askPromotion(moverColor);
        }
        const result = await syscall("chess.applyMove", currentFen, from, sq, promotion);
        if (result && result.error) {
          renderBoard();
          return;
        }
        const expected = solutionMoves[currentStep];
        if (!expected || !sameSan(result.san, expected)) {
          statusEl.className = "puzzle-banner wrong";
          statusEl.innerHTML = "<span>❌ Chưa đúng, thử lại (nước vừa đi sẽ không được tính).</span>";
          renderBoard();
          return;
        }

        // Correct: commit the move, then auto-play any forced opponent reply.
        currentFen = result.fen;
        currentStep++;
        showError(null);

        if (currentStep >= solutionMoves.length) {
          solved = true;
          statusEl.className = "puzzle-banner correct";
          statusEl.innerHTML = "<span>🎉 Chính xác! Bạn đã giải xong bài tập.</span>";
          renderBoard();
          return;
        }

        statusEl.className = "puzzle-banner correct";
        statusEl.innerHTML = "<span>✅ Đúng! Đối phương đang đi tiếp...</span>";
        renderBoard();
        await new Promise((r) => setTimeout(r, 500));
        await playOpponentReply();
        if (currentStep >= solutionMoves.length) {
          solved = true;
          statusEl.className = "puzzle-banner correct";
          statusEl.innerHTML = "<span>🎉 Chính xác! Bạn đã giải xong bài tập.</span>";
        } else {
          statusEl.className = "puzzle-banner pending";
          statusEl.innerHTML = "<span>🤔 Tiếp tục nào!</span>";
        }
      } finally {
        isBusy = false;
      }
      return;
    }

    if (selectedSquare === sq) {
      selectedSquare = null;
      legalMoves = [];
      renderBoard();
      return;
    }

    if (!boardState[sq]) {
      selectedSquare = null;
      legalMoves = [];
      renderBoard();
      return;
    }

    const activeColor = currentFen.split(" ")[1] === "w" ? "w" : "b";
    if (boardState[sq][0] !== activeColor) {
      selectedSquare = null;
      legalMoves = [];
      renderBoard();
      return;
    }

    selectedSquare = sq;
    isBusy = true;
    try {
      legalMoves = await syscall("chess.legalMoves", currentFen, sq) || [];
    } finally {
      isBusy = false;
    }
    renderBoard();
  }

  resetBtn.addEventListener("click", () => {
    currentFen = startFen;
    currentStep = 0;
    selectedSquare = null;
    legalMoves = [];
    solved = false;
    showError(null);
    statusEl.className = "puzzle-banner pending";
    statusEl.innerHTML = "<span>🤔 Puzzle reset. Find the best move!</span>";
    renderBoard();
  });

  if (hintBtn && hintBox) {
    hintBtn.addEventListener("click", () => {
      hintBox.style.display = hintBox.style.display === "none" ? "block" : "none";
    });
  }

  solutionBtn.addEventListener("click", () => {
    solutionDisplay.style.display = "inline";
    solutionBtn.innerText = "✓ Solution Shown";
  });

  renderBoard();
})();
`;

  return { html, script };
}
