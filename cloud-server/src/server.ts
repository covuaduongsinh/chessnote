// ChessNote Cloud — server tự host cho Phase B (đồng bộ đa nền tảng): về bản
// chất là 1 server WebDAV tối giản (đủ cho `plugs/sync/webdav_sync.ts` phía
// client — không cần sửa gì phía client cho phần lưu file, chỉ cần trỏ
// `chess.webdav.url` vào server này) + 1 kênh WebSocket đẩy tín hiệu "có gì
// mới" (`/_push`) để đồng bộ gần-realtime thay cho việc chờ interval.
//
// Thiết kế CÁ NHÂN/nhóm nhỏ (giống quyết định đã chốt cho AI Gateway) — vài
// tài khoản cấu hình tay qua biến môi trường, KHÔNG multi-tenant SaaS.
//
// Dependency `ws` là NGOẠI LỆ có chủ đích với quy ước "chỉ dùng Node core"
// của `ai-sidecar/` — tự viết WebSocket handshake/framing đúng chuẩn (RFC
// 6455) là việc dễ sai tinh vi (masking, ping/pong, close handshake), rủi ro
// không đáng để tránh 1 dependency nhỏ, rất phổ biến, ít bảo trì.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import { checkBasicAuthHeader, checkQueryToken, parseUsers, type UserStore } from "./auth.ts";
import { broadcastChanged, registerConnection } from "./push.ts";
import {
  AlreadyExistsCollectionError,
  ConflictError,
  NotFoundError,
  PreconditionFailedError,
  deleteFileEntry,
  ensureUserRoot,
  listRecursive,
  makeCollection,
  normalizeRelPath,
  readFileEntry,
  writeFileEntry,
  type WriteMode,
} from "./storage.ts";
import { buildMultistatusXml } from "./webdav_xml.ts";

const MAX_BODY_BYTES = 100 * 1024 * 1024; // 100MB — dư sức cho Markdown/PGN, đủ chặn body vô hạn

function readRequestBody(req: IncomingMessage, limit = MAX_BODY_BYTES): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("body quá lớn"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function stripEtagQuotes(v: string): string {
  return v.replace(/^W\//, "").replace(/^"|"$/g, "");
}

/** Path tương đối (đã decode) + `hrefBase` (path gốc CHƯA decode lại, dùng để
 * sinh XML — xem `webdav_xml.ts`) suy ra từ `req.url`. Rỗng cho gốc "/". */
function pathInfoFromUrl(url: URL): { relPath: string; hrefBase: string } {
  const pathname = url.pathname; // vẫn percent-encoded, đúng thứ webdav_xml.ts cần để build href
  const trimmed = pathname.replace(/\/+$/, ""); // bỏ "/" cuối, giữ "/" đầu (hrefBase rỗng cho gốc)
  const decodedSegments = trimmed
    .split("/")
    .filter((s) => s.length > 0)
    .map((s) => decodeURIComponent(s));
  return { relPath: normalizeRelPath(decodedSegments.join("/")), hrefBase: trimmed };
}

function userRootFor(dataDir: string, username: string): string {
  // username đã được xác thực khớp `CHESSNOTE_CLOUD_USERS` (không phải input
  // thô từ URL) nên an toàn dùng trực tiếp làm tên thư mục.
  return join(dataDir, username);
}

export function createRequestHandler(users: UserStore, dataDir: string) {
  return async function handleRequest(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url || "/", "http://localhost");

    if (url.pathname === "/healthz") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    const username = checkBasicAuthHeader(req.headers.authorization, users);
    if (!username) {
      res.writeHead(401, {
        "www-authenticate": 'Basic realm="ChessNote Cloud"',
        "content-type": "application/json",
      });
      res.end(JSON.stringify({ ok: false, error: "unauthorized" }));
      return;
    }

    const userRoot = userRootFor(dataDir, username);
    await ensureUserRoot(userRoot);
    const { relPath, hrefBase } = pathInfoFromUrl(url);

    try {
      switch (req.method) {
        case "OPTIONS": {
          res.writeHead(200, {
            allow: "OPTIONS, GET, HEAD, PUT, DELETE, PROPFIND, MKCOL",
            dav: "1",
          });
          res.end();
          return;
        }

        case "PROPFIND": {
          const entries = await listRecursive(userRoot, relPath);
          const xml = buildMultistatusXml(hrefBase, entries);
          res.writeHead(207, { "content-type": "application/xml; charset=utf-8" });
          res.end(xml);
          return;
        }

        case "GET":
        case "HEAD": {
          let entry;
          try {
            entry = await readFileEntry(userRoot, relPath);
          } catch (e) {
            if (e instanceof NotFoundError) {
              res.writeHead(404, { "content-type": "application/json" });
              res.end(JSON.stringify({ ok: false, error: "not found" }));
              return;
            }
            throw e;
          }
          res.writeHead(200, {
            etag: `"${entry.etag}"`,
            "last-modified": entry.mtimeHttp,
            "content-type": "application/octet-stream",
            "content-length": entry.data.byteLength,
          });
          res.end(req.method === "HEAD" ? undefined : entry.data);
          return;
        }

        case "PUT": {
          const body = await readRequestBody(req);
          const ifNoneMatch = req.headers["if-none-match"];
          const ifMatch = req.headers["if-match"];
          let mode: WriteMode;
          if (ifNoneMatch === "*") {
            mode = { tag: "add" };
          } else if (typeof ifMatch === "string" && ifMatch) {
            mode = { tag: "update", ifMatch: stripEtagQuotes(ifMatch) };
          } else {
            mode = { tag: "overwrite" };
          }

          let result;
          try {
            result = await writeFileEntry(userRoot, relPath, body, mode);
          } catch (e) {
            if (e instanceof PreconditionFailedError) {
              res.writeHead(412, { "content-type": "application/json" });
              res.end(JSON.stringify({ ok: false, error: "precondition failed" }));
              return;
            }
            if (e instanceof ConflictError) {
              res.writeHead(409, { "content-type": "application/json" });
              res.end(JSON.stringify({ ok: false, error: "parent collection missing" }));
              return;
            }
            throw e;
          }
          broadcastChanged(username);
          res.writeHead(mode.tag === "add" ? 201 : 204, {
            etag: `"${result.etag}"`,
            "last-modified": result.mtimeHttp,
          });
          res.end();
          return;
        }

        case "DELETE": {
          try {
            await deleteFileEntry(userRoot, relPath);
          } catch (e) {
            if (e instanceof NotFoundError) {
              // Idempotent — giống hành vi 409 "path_lookup/not_found" của
              // Dropbox: đã bị xoá từ trước, coi như thành công.
              res.writeHead(404, { "content-type": "application/json" });
              res.end(JSON.stringify({ ok: false, error: "not found" }));
              return;
            }
            throw e;
          }
          broadcastChanged(username);
          res.writeHead(204);
          res.end();
          return;
        }

        case "MKCOL": {
          try {
            await makeCollection(userRoot, relPath);
          } catch (e) {
            if (e instanceof AlreadyExistsCollectionError) {
              res.writeHead(405, { "content-type": "application/json" });
              res.end(JSON.stringify({ ok: false, error: "already exists" }));
              return;
            }
            throw e;
          }
          res.writeHead(201);
          res.end();
          return;
        }

        default: {
          res.writeHead(405, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "method not allowed" }));
          return;
        }
      }
    } catch (e) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: String((e as Error)?.message ?? e) }));
    }
  };
}

/** Xác thực + đăng ký 1 kết nối WS `/_push?auth=<base64 user:pass>` — cùng
 * token base64(user:pass) với Basic Auth (xem `auth.ts`). */
export function createPushUpgradeHandler(users: UserStore) {
  const wss = new WebSocketServer({ noServer: true });
  return {
    wss,
    // `http.Server`'s "upgrade" event types its socket as `Duplex` (@types/node)
    // even though for a plain (non-TLS/HTTP2) server it is always actually a
    // `net.Socket` at runtime — cast where `ws` needs the narrower type.
    handleUpgrade(req: IncomingMessage, socket: import("node:stream").Duplex, head: Buffer) {
      const url = new URL(req.url || "/", "http://localhost");
      const netSocket = socket as import("node:net").Socket;
      if (url.pathname !== "/_push") {
        netSocket.destroy();
        return;
      }
      const username = checkQueryToken(url.searchParams.get("auth"), users);
      if (!username) {
        netSocket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        netSocket.destroy();
        return;
      }
      wss.handleUpgrade(req, netSocket, head, (ws: WebSocket) => {
        registerConnection(username, ws);
      });
    },
  };
}

function main() {
  const port = Number(process.env.CHESSNOTE_CLOUD_PORT || 8080);
  const dataDir = process.env.CHESSNOTE_CLOUD_DATA_DIR || "./data";
  const users = parseUsers(process.env.CHESSNOTE_CLOUD_USERS);

  const handler = createRequestHandler(users, dataDir);
  const push = createPushUpgradeHandler(users);

  const server = createServer((req, res) => {
    void handler(req, res);
  });
  server.on("upgrade", (req, socket, head) => {
    push.handleUpgrade(req, socket, head);
  });

  server.listen(port, () => {
    console.log(`[chessnote-cloud-server] nghe cổng ${port}, dữ liệu tại ${dataDir}`);
    console.log(`[chessnote-cloud-server] ${users.size} tài khoản đã cấu hình`);
  });
}

// Chỉ chạy `main()` khi được thực thi trực tiếp (`tsx src/server.ts`) — để
// test có thể import `createRequestHandler`/`createPushUpgradeHandler` mà
// không tự động mở cổng lắng nghe thật.
if (process.argv[1]?.endsWith("server.ts") || process.argv[1]?.endsWith("server.js")) {
  main();
}
