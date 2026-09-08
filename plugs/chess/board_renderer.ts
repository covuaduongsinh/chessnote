// SVG Chess Pieces (Staunton vector style - CC0 / Public Domain / MIT compliant)
export const PIECE_SVGS: Record<string, string> = {
  wK: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45" width="100%" height="100%"><g fill="none" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22.5 11.63V6M20 8h5" stroke-linejoin="miter"/><path d="M22.5 25s4.5-7.5 3-10.5c0-1.7-1.3-3-3-3s-3 1.3-3 3c-1.5 3 3 10.5 3 10.5" fill="#fff"/><path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V23v-2c-2.5-7.5-12-10.5-16-4-3 6 6 10.5 6 10.5v7z" fill="#fff"/><path d="M11.5 30c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0"/></g></svg>`,
  wQ: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45" width="100%" height="100%"><g fill="none" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm16.5-4.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM41 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM16 8.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm17 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0z"/><path d="M9 26c8.5-1.5 21-1.5 27 0l2-12-7 11V11l-5.5 13.5-3-15-3 15L14 11v14l-7-11 2 12z" fill="#fff"/><path d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 2-1 .5-2.5 0 0 0-1.5-1.5-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z" fill="#fff"/><path d="M11 38.5a35 35 1 0 0 23 0" fill="none"/><path d="M11 29a35 35 1 0 1 23 0m-21.5 2.5h20m-21 3a35 35 1 0 0 22 0m-23 3a35 35 1 0 0 24 0"/></g></svg>`,
  wR: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45" width="100%" height="100%"><g fill="none" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 39h27v-3H9v3zm3-3v-4.5h21V36H12zm2-4.5V14l-2-2v-3h5v3h3V9h4v3h3V9h5v3l-2 2v17.5H14z" fill="#fff"/><path d="M14 29.5v-13h17v13H14z" fill="#fff"/><path d="M14 16.5h17m-17 13h17M11 14h23M9 36h27"/></g></svg>`,
  wB: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45" width="100%" height="100%"><g fill="none" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><g fill="#fff"><path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.35.49-2.32.47-3-.5 1.35-1.46 3-2 3-2z"/><path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z"/><path d="M25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0z"/></g><path d="M17.5 26h10M15 30h15m-7.5-14.5v5M20 18h5" stroke-linejoin="miter"/><path d="M24.7 13.3c3.5 1 5.8 4.7 4.8 8.7-.5 2-1.8 3.6-3.5 4.5"/></g></svg>`,
  wN: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45" width="100%" height="100%"><g fill="none" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" fill="#fff"/><path d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0-.693 1.94-1.5 1.5-.807-.44-.457-1.74-.5-3 .1-1.5 1-2 2.5-3 2.5-1.5 6-1.5 9-5 2-2.5 2-3 3.5-3.5z" fill="#fff"/><path d="M9.5 25.5a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0zm5.5-11a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0z" fill="#000"/><path d="M24.55 10.4s-1.8 2.4-3.55 2.4c-1.75 0-3.5-2.4-3.5-2.4"/></g></svg>`,
  wP: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45" width="100%" height="100%"><path d="M22.5 9c-2.76 0-5 2.24-5 5 0 1.65.8 3.11 2.04 4-3.04 1.25-5.04 4.25-5.04 8 0 1.13.27 2.2.75 3.16-1.43.49-2.45 1.82-2.45 3.34 0 1.06.51 2 1.31 2.59-.68.56-1.11 1.43-1.11 2.41 0 1.93 1.57 3.5 3.5 3.5h12c1.93 0 3.5-1.57 3.5-3.5 0-.98-.43-1.85-1.11-2.41.8-.59 1.31-1.53 1.31-2.59 0-1.52-1.02-2.85-2.45-3.34.48-.96.75-2.03.75-3.16 0-3.75-2-6.75-5.04-8 1.24-.89 2.04-2.35 2.04-4 0-2.76-2.24-5-5-5z" fill="#fff" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  bK: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45" width="100%" height="100%"><g fill="none" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22.5 11.63V6M20 8h5" stroke-linejoin="miter"/><path d="M22.5 25s4.5-7.5 3-10.5c0-1.7-1.3-3-3-3s-3 1.3-3 3c-1.5 3 3 10.5 3 10.5" fill="#262626"/><path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V23v-2c-2.5-7.5-12-10.5-16-4-3 6 6 10.5 6 10.5v7z" fill="#262626"/><path d="M11.5 30c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0" stroke="#fff"/></g></svg>`,
  bQ: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45" width="100%" height="100%"><g fill="none" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm16.5-4.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM41 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM16 8.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm17 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" fill="#262626"/><path d="M9 26c8.5-1.5 21-1.5 27 0l2-12-7 11V11l-5.5 13.5-3-15-3 15L14 11v14l-7-11 2 12z" fill="#262626"/><path d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 2-1 .5-2.5 0 0 0-1.5-1.5-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z" fill="#262626"/><path d="M11 38.5a35 35 1 0 0 23 0" stroke="#fff" fill="none"/><path d="M11 29a35 35 1 0 1 23 0m-21.5 2.5h20m-21 3a35 35 1 0 0 22 0m-23 3a35 35 1 0 0 24 0" stroke="#fff"/></g></svg>`,
  bR: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45" width="100%" height="100%"><g fill="none" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 39h27v-3H9v3zm3-3v-4.5h21V36H12zm2-4.5V14l-2-2v-3h5v3h3V9h4v3h3V9h5v3l-2 2v17.5H14z" fill="#262626"/><path d="M14 29.5v-13h17v13H14z" fill="#262626"/><path d="M14 16.5h17m-17 13h17M11 14h23M9 36h27" stroke="#fff"/></g></svg>`,
  bB: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45" width="100%" height="100%"><g fill="none" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><g fill="#262626"><path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.35.49-2.32.47-3-.5 1.35-1.46 3-2 3-2z"/><path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z"/><path d="M25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0z"/></g><path d="M17.5 26h10M15 30h15m-7.5-14.5v5M20 18h5" stroke="#fff" stroke-linejoin="miter"/><path d="M24.7 13.3c3.5 1 5.8 4.7 4.8 8.7-.5 2-1.8 3.6-3.5 4.5" stroke="#fff"/></g></svg>`,
  bN: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45" width="100%" height="100%"><g fill="none" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" fill="#262626"/><path d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0-.693 1.94-1.5 1.5-.807-.44-.457-1.74-.5-3 .1-1.5 1-2 2.5-3 2.5-1.5 6-1.5 9-5 2-2.5 2-3 3.5-3.5z" fill="#262626"/><path d="M9.5 25.5a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0zm5.5-11a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0z" fill="#fff"/><path d="M24.55 10.4s-1.8 2.4-3.55 2.4c-1.75 0-3.5-2.4-3.5-2.4" stroke="#fff"/></g></svg>`,
  bP: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45" width="100%" height="100%"><path d="M22.5 9c-2.76 0-5 2.24-5 5 0 1.65.8 3.11 2.04 4-3.04 1.25-5.04 4.25-5.04 8 0 1.13.27 2.2.75 3.16-1.43.49-2.45 1.82-2.45 3.34 0 1.06.51 2 1.31 2.59-.68.56-1.11 1.43-1.11 2.41 0 1.93 1.57 3.5 3.5 3.5h12c1.93 0 3.5-1.57 3.5-3.5 0-.98-.43-1.85-1.11-2.41.8-.59 1.31-1.53 1.31-2.59 0-1.52-1.02-2.85-2.45-3.34.48-.96.75-2.03.75-3.16 0-3.75-2-6.75-5.04-8 1.24-.89 2.04-2.35 2.04-4 0-2.76-2.24-5-5-5z" fill="#262626" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
};

export const CHESS_CSS = `
:root {
  --sq-light: #f0d9b5;
  --sq-dark: #b58863;
  --sq-select: rgba(20, 85, 30, 0.5);
  --sq-highlight: rgba(255, 255, 0, 0.45);
  --sq-dest: rgba(20, 85, 30, 0.3);
  --board-border: #78350f;
  --bg-panel: var(--sidebar-background, #1e293b);
  --text-main: var(--text-color, #f1f5f9);
  --text-muted: #94a3b8;
  --btn-bg: #334155;
  --btn-hover: #475569;
  --btn-active: #2563eb;
  --accent: #38bdf8;
}

[data-theme="light"] {
  --sq-light: #f0d9b5;
  --sq-dark: #b58863;
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
`;
