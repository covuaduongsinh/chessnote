import { Chess } from "chess.js";
import { CHESS_CSS, PIECE_SVGS } from "./board_renderer.ts";
import { buildMoveList } from "./engine/game_reviewer.ts";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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
    const chess = new Chess(fen);
    const moves = chess.moves({ square: square as any, verbose: true });
    return moves.map((m) => ({ to: m.to, san: m.san, promotion: !!m.promotion }));
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

function describeResult(chess: Chess, san: string, captured?: string): ChessMoveResult {
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
    const chess = new Chess(fen);
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
    const chess = new Chess(fen);
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
  let fen = lines[0].trim();
  let orientation: "white" | "black" = "white";
  let title = "Chess Position";
  const arrows: string[] = [];
  const highlights: Record<string, string> = {};

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
    }
  }

  try {
    new Chess(fen);
  } catch (e) {
    return {
      html: errorWidgetHtml(
        "FEN không hợp lệ",
        `Không thể đọc chuỗi FEN: "${fen}". ${e instanceof Error ? e.message : ""}`.trim(),
      ),
    };
  }

  const widgetId = `chess_fen_${Math.random().toString(36).substring(2, 9)}`;

  const html = `
<style>${CHESS_CSS}</style>
<div class="chessnote-container" id="${widgetId}">
  <div class="chess-header">
    <div class="chess-title">${escapeHtml(title)}</div>
    <div class="chess-subtitle">FEN Interactive Board • Arasan Engine (NNUE, WASM)</div>
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
        <button class="chess-btn btn-engine" id="${widgetId}_eval_toggle">⚡ Engine Eval</button>
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
  const PIECE_SVGS = ${JSON.stringify(PIECE_SVGS)};
  const initialFen = ${JSON.stringify(fen)};
  let currentFen = initialFen;
  let orientation = ${JSON.stringify(orientation)};
  const baseArrows = ${JSON.stringify(arrows)};
  const highlights = ${JSON.stringify(highlights)};
  
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

  // Small Q/R/B/N picker shown over the board when a pawn move needs a
  // promotion piece chosen before we know which move to send to chess.js.
  // \`moverColor\` is "w"/"b" for the side actually making the move (the
  // active color in the FEN *before* the move) — not the board orientation,
  // which is just which way the board is visually flipped.
  function askPromotion(moverColor) {
    return new Promise((resolve) => {
      const picker = document.createElement("div");
      picker.className = "promotion-picker";
      ["q", "r", "b", "n"].forEach((p) => {
        const btn = document.createElement("button");
        btn.innerHTML = PIECE_SVGS[moverColor + p.toUpperCase()] || p;
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

  // Real Arasan (NNUE, WASM) analysis via the chess.engineEval syscall — see
  // plugs/chess/engine/arasan_engine.ts. Requires the optional "Chess
  // Engine" Library to be installed (~26MB: engine + neural network); if
  // it isn't, the syscall rejects and we show that plainly instead of
  // silently falling back to a fake number.
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
      if (mySeq !== evalRequestSeq) return; // a newer position was requested meanwhile
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
          pieceDiv.innerHTML = PIECE_SVGS[piece] || "";
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
export async function pgnWidget(bodyText: string, _pageName: string) {
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

  // Cheap, chess.js-only move list for navigation — the real (engine-backed)
  // full review is fetched lazily via the chess.reviewGame syscall, only
  // when the user clicks "Game Review" (see the widget script below).
  const moveList = buildMoveList(bodyText.trim());

  const initialFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQK2R w KQkq - 0 1";
  const widgetId = `chess_pgn_${Math.random().toString(36).substring(2, 9)}`;

  const html = `
<style>${CHESS_CSS}</style>
<div class="chessnote-container" id="${widgetId}">
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
        <div class="review-status" id="${widgetId}_review_status"></div>
      </div>

      <div class="chess-engine-panel" id="${widgetId}_engine_panel" style="display: none;">
        <div class="engine-line">
          <span>Engine: <strong>Arasan (NNUE, WASM)</strong></span>
          <span class="engine-score" id="${widgetId}_engine_score">Eval: 0.0</span>
        </div>
      </div>

      <div class="chess-pgn-tree" id="${widgetId}_tree"></div>
      <div class="fen-footer">
        <span id="${widgetId}_fen_text">${escapeHtml(initialFen)}</span>
      </div>
    </div>
  </div>
</div>
`;

  const script = `
(function() {
  const PIECE_SVGS = ${JSON.stringify(PIECE_SVGS)};
  const initialFen = ${JSON.stringify(initialFen)};
  const reviewedMoves = ${JSON.stringify(moveList)};
  const rawPgn = ${JSON.stringify(bodyText.trim())};

  let currentIdx = -1;
  let orientation = "white";
  let isEngineOn = false;
  let isReviewOn = false;
  let fullReview = null;
  let reviewRequestSeq = 0;
  let lastEvalFen = null;
  let evalRequestSeq = 0;

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

  function renderBoard() {
    boardEl.innerHTML = "";
    const currentFen = getCurrentFen();
    fenTextEl.innerText = currentFen;
    const boardState = parseFenBoard(currentFen);
    const files = orientation === "white" ? ["a","b","c","d","e","f","g","h"] : ["h","g","f","e","d","c","b","a"];
    const ranks = orientation === "white" ? [8,7,6,5,4,3,2,1] : [1,2,3,4,5,6,7,8];

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
          pieceDiv.innerHTML = PIECE_SVGS[piece] || "";
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
  let fen = "r1bqk2r/pp2bppp/2n1p3/2ppP3/3P4/2PB1N2/P1P2PPP/R1BQK2R w KQkq - 0 8";
  let turn = "white";
  let solutionStr = "";
  let hint = "";
  let themes = "";
  let rating = "";

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

  const solutionMoves = solutionStr.split(" ").map((s) => s.trim()).filter(Boolean);
  const widgetId = `chess_puzzle_${Math.random().toString(36).substring(2, 9)}`;

  const html = `
<style>${CHESS_CSS}</style>
<div class="chessnote-container" id="${widgetId}">
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
  const PIECE_SVGS = ${JSON.stringify(PIECE_SVGS)};
  const startFen = ${JSON.stringify(fen)};
  const solutionMoves = ${JSON.stringify(solutionMoves)};
  const orientation = ${JSON.stringify(turn)};

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

  function showError(msg) {
    if (!msg) { errorEl.style.display = "none"; return; }
    errorEl.textContent = "⚠️ " + msg;
    errorEl.style.display = "block";
  }

  // Compare generated SAN (always from chess.js, e.g. "Qh5#") against the
  // author-written solution token (which may omit the trailing +/# by
  // oversight, e.g. "Qh5") — only the check/mate suffix is allowed to differ.
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
      ["q", "r", "b", "n"].forEach((p) => {
        const btn = document.createElement("button");
        btn.innerHTML = PIECE_SVGS[moverColor + p.toUpperCase()] || p;
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
          pieceDiv.innerHTML = PIECE_SVGS[piece] || "";
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
