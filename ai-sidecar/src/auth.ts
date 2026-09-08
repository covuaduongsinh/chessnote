// Luồng đăng nhập cho Claude Code CLI — khuôn "pipe + regex" (không có OAuth
// công khai để tự implement, và Anthropic đã chặn việc tự đọc/giải mã token
// rồi gọi thẳng API từ 4/4/2026). Ta chỉ spawn CLI, đọc output, không bao giờ
// đọc NỘI DUNG file credentials — chỉ kiểm sự TỒN TẠI khi cần fallback.
//
// Đã xác nhận trên máy dev thật (2026-09-08):
//   - `claude auth login --claudeai` / `claude auth logout` / `claude auth status --json` tồn tại
//   - `claude auth status --json` trả { loggedIn, email, subscriptionType, ... } — field "loggedIn"
//     đúng như giả định trong khuôn pipe+regex gốc.
//   - Credentials nằm ở `%USERPROFILE%\.claude\.credentials.json`.
// CHƯA thử thật trên máy này: một lượt login/logout đầy đủ qua sidecar — vì
// CLI `claude` trên máy dev CHÍNH LÀ phiên đang chạy Claude Code này, logout
// thật sẽ ngắt phiên đang dùng để code. Cần người dùng tự thử tay, hoặc thử
// trên một máy/tài khoản phụ trước khi coi là đã verify.
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { killTree } from "./kill-tree.js";
import { collectUtf8 } from "./utf8-stream.js";

const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";
const CREDENTIALS_PATH = join(
  process.env.CLAUDE_HOME || homedir(),
  ".claude",
  ".credentials.json",
);
const URL_RE = /https?:\/\/\S+/;

export type AuthStatus = {
  connected: boolean;
  unknown: boolean;
  stale: boolean;
  account: string;
  source: string;
  pending: boolean;
  pendingUrl: string;
};

type LoginSession = {
  proc: ChildProcess | null;
  url: string;
  done: boolean;
  error: string;
  lines: string[];
  startedAt: number;
};

const login: LoginSession = {
  proc: null,
  url: "",
  done: false,
  error: "",
  lines: [],
  startedAt: 0,
};

// Bản nhớ trạng thái đăng nhập lần cuối hỏi được thật (không phải timeout) —
// dùng cho nhánh "stale" khi lần hỏi hiện tại bị timeout/lỗi.
let lastKnown: { logged_in: boolean; account: string } | null = null;
let cache: { at: number; status: AuthStatus } | null = null;
const CACHE_TTL_MS = 60_000;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function resetLogin() {
  if (login.proc && login.proc.exitCode === null) {
    await killTree(login.proc);
  }
  login.proc = null;
  login.url = "";
  login.done = false;
  login.error = "";
  login.lines = [];
  login.startedAt = 0;
}

function runCLI(
  args: string[],
  timeoutMs = 15_000,
): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (code: number, out: string) => {
      if (done) return;
      done = true;
      resolve({ code, out });
    };
    let p: ChildProcess;
    try {
      // KHÔNG shell:true — chấp nhận đây là điểm không dùng được nếu binary
      // CLI chỉ tồn tại dưới dạng .cmd shim; đã xác nhận trên máy dev thật
      // `claude` là .exe gốc (không phải shim), nên nhánh này an toàn ở đây.
      p = spawn(CLAUDE_BIN, args, { stdio: ["ignore", "pipe", "pipe"] });
    } catch {
      finish(-1, "");
      return;
    }
    const stdout = p.stdout ? collectUtf8(p.stdout) : null;
    const stderr = p.stderr ? collectUtf8(p.stderr) : null;
    p.on("error", () => finish(-1, (stdout?.text() ?? "") + (stderr?.text() ?? "")));
    p.on("close", (code) => finish(code ?? -1, (stdout?.text() ?? "") + (stderr?.text() ?? "")));
    const t = setTimeout(async () => {
      await killTree(p, 500);
      finish(-2, (stdout?.text() ?? "") + (stderr?.text() ?? ""));
    }, timeoutMs);
    t.unref?.();
  });
}

// 3 tầng, đúng khuôn skill: JSON → text → tồn tại file (không đọc nội dung).
async function queryAuthStatus(): Promise<{
  ok: boolean;
  logged_in: boolean;
  account: string;
  source: string;
}> {
  const r = await runCLI(["auth", "status", "--json"], 15_000);
  if (r.code === 0 && r.out.trim()) {
    try {
      const j = JSON.parse(r.out.trim());
      const account = String(j.email || j.account || j.user || "");
      const loggedIn = Boolean(j.loggedIn ?? j.authenticated ?? j.isAuthenticated ?? account);
      return { ok: true, logged_in: loggedIn, account, source: "cli-json" };
    } catch {
      // CLI đổi định dạng JSON — rơi xuống nhánh text.
    }
  }
  if (r.code === 0) {
    const low = r.out.toLowerCase();
    if (low.includes("not logged in") || low.includes("logged out")) {
      return { ok: true, logged_in: false, account: "", source: "cli-text" };
    }
    return { ok: true, logged_in: true, account: "", source: "cli-text" };
  }
  if (r.code === -1) {
    return { ok: false, logged_in: false, account: "", source: "no-cli" };
  }
  // r.code === -2 (timeout) hoặc mã lỗi khác — không kết luận được từ CLI.
  return { ok: false, logged_in: false, account: "", source: "cli-error" };
}

export async function authStatus(): Promise<AuthStatus> {
  const pending = Boolean(login.proc && login.proc.exitCode === null);
  const pendingUrl = login.url;

  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return { ...cache.status, pending, pendingUrl };
  }

  const r = await queryAuthStatus();
  let status: AuthStatus;
  if (r.ok) {
    lastKnown = { logged_in: r.logged_in, account: r.account };
    status = {
      connected: r.logged_in,
      unknown: false,
      stale: false,
      account: r.account,
      source: r.source,
      pending,
      pendingUrl,
    };
  } else if (r.source === "no-cli") {
    // Không tìm thấy CLI — đây là kết luận thật (không phải timeout), không
    // phải "unknown", nhưng cũng chỉ kiểm được sự tồn tại của file token.
    let hasCreds = false;
    try {
      hasCreds = existsSync(CREDENTIALS_PATH);
    } catch {
      hasCreds = false;
    }
    status = {
      connected: hasCreds,
      unknown: false,
      stale: false,
      account: "",
      source: "credentials-file",
      pending,
      pendingUrl,
    };
  } else if (lastKnown) {
    // Timeout/lỗi nhưng có bản nhớ cũ — trả bản nhớ, đừng khẳng định "chưa đăng nhập".
    status = {
      connected: lastKnown.logged_in,
      unknown: false,
      stale: true,
      account: lastKnown.account,
      source: "stale-cache",
      pending,
      pendingUrl,
    };
  } else {
    status = {
      connected: false,
      unknown: true,
      stale: false,
      account: "",
      source: "unknown",
      pending,
      pendingUrl,
    };
  }

  cache = { at: Date.now(), status };
  return status;
}

export async function authStart(): Promise<{ ok: boolean; url: string; done: boolean; error: string }> {
  await resetLogin();
  cache = null; // trạng thái sắp đổi — không dùng bản nhớ cũ nữa

  let proc: ChildProcess;
  try {
    proc = spawn(CLAUDE_BIN, ["auth", "login", "--claudeai"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (e) {
    return { ok: false, url: "", done: false, error: `không chạy được CLI claude: ${(e as Error).message}` };
  }
  login.proc = proc;
  login.startedAt = Date.now();

  const onLine = (raw: string) => {
    const line = raw.trim();
    if (!line) return;
    login.lines.push(line);
    if (login.lines.length > 200) login.lines.shift();
    if (!login.url) {
      const m = URL_RE.exec(line);
      if (m) login.url = m[0];
    }
    const low = line.toLowerCase();
    if (low.includes("success") || low.includes("logged in")) {
      login.done = true;
    } else if (low.includes("error") || low.includes("failed") || low.includes("invalid")) {
      login.error = line;
    }
  };
  const attach = (stream: NodeJS.ReadableStream) => {
    let buf = "";
    const decoded = collectUtf8(stream);
    decoded.onData((piece) => {
      buf += piece;
      const parts = buf.split(/\r?\n/);
      buf = parts.pop() ?? "";
      for (const p of parts) onLine(p);
    });
    stream.on("end", () => {
      if (buf) onLine(buf);
    });
  };
  if (proc.stdout) attach(proc.stdout);
  if (proc.stderr) attach(proc.stderr);
  proc.on("close", (code) => {
    if (code === 0) login.done = true;
    else if (!login.error) login.error = `CLI thoát với mã ${code}`;
  });
  proc.on("error", (e) => {
    login.error = e.message;
  });

  for (let i = 0; i < 75; i++) {
    if (login.url || login.done || login.error) break;
    await sleep(200);
  }
  if (!login.url && !login.done && !login.error) {
    return { ok: false, url: "", done: false, error: "CLI không in ra link đăng nhập (thử lại)" };
  }
  return { ok: !login.error, url: login.url, done: login.done, error: login.error };
}

export async function authSubmitCode(code: string): Promise<{ ok: boolean; error: string }> {
  const proc = login.proc;
  if (!proc || proc.exitCode !== null) {
    return { ok: false, error: 'Chưa bắt đầu đăng nhập, hoặc phiên đã hết. Gọi lại "start".' };
  }
  try {
    proc.stdin?.write(String(code || "").trim() + "\n");
  } catch (e) {
    return { ok: false, error: `không gửi được mã: ${(e as Error).message}` };
  }
  for (let i = 0; i < 150; i++) {
    if (login.done) {
      cache = null;
      return { ok: true, error: "" };
    }
    if (login.error) return { ok: false, error: login.error };
    if (proc.exitCode !== null) {
      cache = null;
      return proc.exitCode === 0
        ? { ok: true, error: "" }
        : { ok: false, error: "Đăng nhập thất bại — kiểm tra lại mã rồi thử lại." };
    }
    await sleep(200);
  }
  return { ok: login.done, error: login.error || "hết thời gian chờ xác nhận" };
}

export async function authLogout(): Promise<{ ok: boolean; detail: string }> {
  await resetLogin();
  cache = null;
  lastKnown = null;
  const r = await runCLI(["auth", "logout"], 20_000);
  return { ok: r.code === 0, detail: r.out.trim().slice(0, 500) };
}

export async function authCancel(): Promise<{ ok: true }> {
  await resetLogin();
  return { ok: true };
}
