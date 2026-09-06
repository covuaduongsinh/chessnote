import { Chess } from "chess.js";
import { CHESS_CSS, PIECE_SVGS } from "./board_renderer.ts";
import { reviewGame } from "./engine/game_reviewer.ts";
import { centipawnsToWinChance, formatScore } from "./engine/uci_protocol.ts";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * FEN Code Widget with Arasan/Engine Live Evaluation
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
  } catch (_e) {
    if (!fen || fen.split(" ").length < 4) {
      fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    }
  }

  const widgetId = `chess_fen_${Math.random().toString(36).substring(2, 9)}`;

  const html = `
<style>${CHESS_CSS}</style>
<div class="chessnote-container" id="${widgetId}">
  <div class="chess-header">
    <div class="chess-title">${escapeHtml(title)}</div>
    <div class="chess-subtitle">FEN Interactive Board • Arasan Engine Ready</div>
  </div>
  <div class="chessnote-layout">
    <div class="chessnote-board-container">
      <div class="chess-eval-bar-wrapper" id="${widgetId}_eval_bar" style="display: none;">
        <div class="chess-eval-bar-fill" id="${widgetId}_eval_fill"></div>
        <span class="chess-eval-bar-text" id="${widgetId}_eval_text">0.0</span>
      </div>
      <div class="chessnote-board-wrapper">
        <div class="chess-board" id="${widgetId}_board"></div>
        <svg class="chess-arrows-layer" id="${widgetId}_arrows"></svg>
      </div>
    </div>
    <div class="chessnote-panel">
      <div class="chess-controls">
        <button class="chess-btn btn-engine" id="${widgetId}_eval_toggle">⚡ Engine Eval</button>
        <button class="chess-btn" id="${widgetId}_flip">🔄 Flip</button>
        <button class="chess-btn" id="${widgetId}_reset">⏮ Reset</button>
        <button class="chess-btn" id="${widgetId}_copy_fen">📋 Copy FEN</button>
        <button class="chess-btn" id="${widgetId}_lichess">🔍 Lichess Analysis</button>
      </div>
      <div class="chess-engine-panel" id="${widgetId}_engine_panel" style="display: none;">
        <div class="engine-line">
          <span>Engine: <strong>Arasan Engine</strong></span>
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
  let legalMoves = [];
  let isEngineOn = false;
  let currentBestMove = null;

  const boardEl = document.getElementById("${widgetId}_board");
  const arrowsEl = document.getElementById("${widgetId}_arrows");
  const fenTextEl = document.getElementById("${widgetId}_fen_text");
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

  function evaluateFast(f) {
    const board = parseFenBoard(f);
    const pieceVals = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000 };
    let score = 0;
    for (const [sq, p] of Object.entries(board)) {
      const isW = p[0] === "w";
      const type = p[1];
      const val = pieceVals[type] || 0;
      score += isW ? val : -val;
    }
    return score;
  }

  function updateEngineEval() {
    if (!isEngineOn) return;
    const score = evaluateFast(currentFen);
    const pawns = (score / 100).toFixed(1);
    const scoreStr = score > 0 ? "+" + pawns : pawns;
    
    engineScoreEl.innerText = "Eval: " + scoreStr;
    evalTextEl.innerText = scoreStr;
    
    // Win chance to height %
    const winChance = 100 / (1 + Math.exp(-0.00368208 * score));
    evalFillEl.style.height = Math.max(5, Math.min(95, winChance)) + "%";
  }

  function renderBoard() {
    boardEl.innerHTML = "";
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

        if (selectedSquare === sq) {
          sqDiv.classList.add("selected");
        }
        if (highlights[sq]) {
          sqDiv.classList.add("highlight");
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

      const sqSize = 360 / 8;
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
      marker.setAttribute("markerWidth", "6");
      marker.setAttribute("markerHeight", "6");
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
      line.setAttribute("stroke-width", "4");
      line.setAttribute("stroke-opacity", "0.85");
      line.setAttribute("marker-end", "url(#" + markerId + ")");
      arrowsEl.appendChild(line);
    });
  }

  function handleSquareClick(sq, boardState) {
    if (selectedSquare === sq) {
      selectedSquare = null;
      renderBoard();
      return;
    }
    if (boardState[sq]) {
      selectedSquare = sq;
    } else {
      selectedSquare = null;
    }
    renderBoard();
  }

  evalToggleBtn.addEventListener("click", () => {
    isEngineOn = !isEngineOn;
    evalToggleBtn.classList.toggle("active", isEngineOn);
    evalBarEl.style.display = isEngineOn ? "flex" : "none";
    enginePanel.style.display = isEngineOn ? "flex" : "none";
    updateEngineEval();
  });

  flipBtn.addEventListener("click", () => {
    orientation = orientation === "white" ? "black" : "white";
    renderBoard();
  });

  resetBtn.addEventListener("click", () => {
    currentFen = initialFen;
    selectedSquare = null;
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
 * PGN Code Widget with Automated Game Review & Live Arasan Engine Eval
 */
export async function pgnWidget(bodyText: string, _pageName: string) {
  let chess: Chess;
  try {
    chess = new Chess();
    chess.loadPgn(bodyText.trim());
  } catch (_e) {
    chess = new Chess();
  }

  const header = chess.header();
  const white = header["White"] || "White";
  const black = header["Black"] || "Black";
  const event = header["Event"] || "Game Analysis";
  const result = header["Result"] || "*";
  const date = header["Date"] || "";
  const eco = header["ECO"] || "";

  // Perform full game review
  const reviewReport = reviewGame(bodyText.trim());

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
        <svg class="chess-arrows-layer" id="${widgetId}_arrows"></svg>
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
        <div class="accuracy-row">
          <span class="accuracy-white">⚪ ${escapeHtml(white)}: <strong>${reviewReport.whiteAccuracy}%</strong></span>
          <span class="accuracy-black">⚫ ${escapeHtml(black)}: <strong>${reviewReport.blackAccuracy}%</strong></span>
        </div>
      </div>

      <div class="chess-engine-panel" id="${widgetId}_engine_panel" style="display: none;">
        <div class="engine-line">
          <span>Engine: <strong>Arasan Engine</strong></span>
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
  const reviewedMoves = ${JSON.stringify(reviewReport.moves)};
  const rawPgn = ${JSON.stringify(bodyText.trim())};
  
  let currentIdx = -1;
  let orientation = "white";
  let isEngineOn = false;
  let isReviewOn = false;

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

  function updateEvalDisplay() {
    if (!isEngineOn) return;
    let score = 0;
    if (currentIdx >= 0) {
      score = reviewedMoves[currentIdx].scoreAfter;
    }
    const pawns = (score / 100).toFixed(1);
    const scoreStr = score > 0 ? "+" + pawns : pawns;
    
    engineScoreEl.innerText = "Eval: " + scoreStr;
    evalTextEl.innerText = scoreStr;
    
    const winChance = 100 / (1 + Math.exp(-0.00368208 * score));
    evalFillEl.style.height = Math.max(5, Math.min(95, winChance)) + "%";
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
    updateEvalDisplay();
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
    updateEvalDisplay();
  });

  reviewToggleBtn.addEventListener("click", () => {
    isReviewOn = !isReviewOn;
    reviewToggleBtn.classList.toggle("active", isReviewOn);
    reviewBox.style.display = isReviewOn ? "flex" : "none";
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
  let currentStep = 0;
  let selectedSquare = null;

  const boardEl = document.getElementById("${widgetId}_board");
  const statusEl = document.getElementById("${widgetId}_status");
  const resetBtn = document.getElementById("${widgetId}_reset");
  const hintBtn = document.getElementById("${widgetId}_hint_btn");
  const hintBox = document.getElementById("${widgetId}_hint_box");
  const solutionBtn = document.getElementById("${widgetId}_solution_btn");
  const solutionDisplay = document.getElementById("${widgetId}_solution_display");

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

  function renderBoard() {
    boardEl.innerHTML = "";
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

        if (selectedSquare === sq) {
          sqDiv.classList.add("selected");
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

  function handleSquareClick(sq, boardState) {
    if (selectedSquare === sq) {
      selectedSquare = null;
      renderBoard();
      return;
    }

    if (!selectedSquare) {
      if (boardState[sq]) {
        selectedSquare = sq;
        renderBoard();
      }
      return;
    }

    selectedSquare = null;
    renderBoard();
  }

  resetBtn.addEventListener("click", () => {
    currentFen = startFen;
    currentStep = 0;
    selectedSquare = null;
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
