// chessnote-ai-sidecar — tiến trình Node độc lập, chạy cạnh server Rust của
// ChessNote, lo việc đăng nhập + gọi CLI `claude` (Claude Code) bằng gói Claude
// Pro/Max cá nhân của người dùng. Xem docs/plans/2026-09-07-... cho bối cảnh
// đầy đủ. Chỉ dùng Node core (`http`) — không dependency runtime nào.
import { createServer } from "node:http";
import {
  authStatus,
  authStart,
  authSubmitCode,
  authLogout,
  authCancel,
} from "./auth.js";
import { generateText } from "./model.js";
import { QueueFullError, Semaphore } from "./concurrency.js";

const AUTH_TOKEN = process.env.AUTH_SIDECAR_TOKEN || "";

// Giai đoạn 2.2 (2026-09-13): giới hạn số tiến trình `claude` CLI chạy đồng
// thời -- xem concurrency.ts. Mặc định 2 (đủ cho 1 người dùng thao tác bình
// thường, không chặn hẳn việc gọi song song 2 tính năng AI khác nhau), chỉnh
// được qua env không cần build lại. Hàng đợi giới hạn 10 request đang chờ --
// vượt quá trả lỗi ngay thay vì xếp hàng vô hạn nếu UI gọi dồn dập bất thường.
const MAX_CONCURRENCY = Number(process.env.AI_SIDECAR_MAX_CONCURRENCY || 2);
const MAX_QUEUE_LENGTH = Number(process.env.AI_SIDECAR_MAX_QUEUE || 10);
const generateSemaphore = new Semaphore(MAX_CONCURRENCY, MAX_QUEUE_LENGTH);

function send(res: import("node:http").ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
  });
  res.end(payload);
}

function readBody(req: import("node:http").IncomingMessage, limit = 64 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("body quá lớn"));
        req.destroy();
        return;
      }
      data += c.toString("utf8");
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

/** Tách khỏi `main()` (dưới) để test import được mà không tự mở cổng lắng
 * nghe thật -- cùng quy ước với `cloud-server/src/server.ts:createRequestHandler`. */
export function createRequestHandler() {
  return async (
    req: import("node:http").IncomingMessage,
    res: import("node:http").ServerResponse,
  ) => {
    const url = new URL(req.url || "/", "http://localhost");
    const path = url.pathname;

    if (path === "/healthz") return send(res, 200, { ok: true });

    if (AUTH_TOKEN) {
      const got = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
      if (got !== AUTH_TOKEN) return send(res, 401, { ok: false, error: "unauthorized" });
    }

    try {
      if (path === "/auth/status" && req.method === "GET") {
        const st = await authStatus();
        return send(res, 200, { ok: true, ...st });
      }
      if (path === "/auth/start" && req.method === "POST") {
        const r = await authStart();
        return send(res, r.ok ? 200 : 500, r);
      }
      if (path === "/auth/code" && req.method === "POST") {
        const raw = await readBody(req);
        let code = "";
        try {
          code = String(JSON.parse(raw || "{}").code || "").trim();
        } catch {
          code = "";
        }
        if (!code) return send(res, 400, { ok: false, error: "thiếu mã" });
        const r = await authSubmitCode(code);
        return send(res, r.ok ? 200 : 400, r);
      }
      if (path === "/auth/logout" && req.method === "POST") {
        const r = await authLogout();
        return send(res, 200, r);
      }
      if (path === "/auth/cancel" && req.method === "POST") {
        const r = await authCancel();
        return send(res, 200, r);
      }
      if (path === "/ai/generate" && req.method === "POST") {
        const raw = await readBody(req);
        let prompt = "";
        let mode: unknown;
        let model: string | undefined;
        try {
          const j = JSON.parse(raw || "{}");
          prompt = String(j.prompt || "").trim();
          mode = j.mode;
          model = typeof j.model === "string" ? j.model : undefined;
        } catch {
          return send(res, 400, { ok: false, error: "JSON không hợp lệ" });
        }
        if (!prompt) return send(res, 400, { ok: false, error: "thiếu prompt" });
        try {
          const r = await generateSemaphore.run(() => generateText(prompt, { mode, model }));
          return send(res, r.ok ? 200 : 500, r);
        } catch (e) {
          if (e instanceof QueueFullError) {
            return send(res, 429, { ok: false, error: e.message });
          }
          throw e;
        }
      }
    } catch (e) {
      return send(res, 500, { ok: false, error: String((e as Error)?.message ?? e) });
    }
    return send(res, 404, { ok: false, error: "not found" });
  };
}

function main() {
  const port = Number(process.env.PORT || 3457);
  const server = createServer(createRequestHandler());
  server.listen(port, "127.0.0.1", () => {
    console.log(`[chessnote-ai-sidecar] nghe cổng 127.0.0.1:${port}`);
    if (!AUTH_TOKEN) {
      console.warn(
        "[chessnote-ai-sidecar] CẢNH BÁO: chưa đặt AUTH_SIDECAR_TOKEN — mọi tiến trình trên máy gọi được endpoint này",
      );
    }
  });
}

// Chỉ chạy `main()` khi được thực thi trực tiếp (`tsx src/server.ts`) — để
// test có thể import `createRequestHandler` mà không tự động mở cổng lắng
// nghe thật (cùng quy ước với cloud-server/src/server.ts).
if (process.argv[1]?.endsWith("server.ts") || process.argv[1]?.endsWith("server.js")) {
  main();
}
