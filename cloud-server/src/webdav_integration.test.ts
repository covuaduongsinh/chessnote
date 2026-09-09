// Test tích hợp THẬT: dựng 1 instance ChessNote Cloud thật trên localhost,
// rồi gọi THẲNG các hàm client thật trong `plugs/sync/webdav_sync.ts` (repo
// gốc) qua HTTP thật — không mock gì cả phía giao thức. Đây là bài test có
// giá trị cao nhất trong toàn bộ `cloud-server/`: `webdav_xml.test.ts` và
// `webdav_sync.test.ts` (repo gốc) đều test ĐÚNG nhưng RIÊNG LẺ từng phía —
// chỉ bài test này xác nhận 2 phía thực sự nói cùng 1 "ngôn ngữ" qua network.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseUsers } from "./auth.ts";
import { createRequestHandler } from "./server.ts";

// `plugs/sync/webdav_sync.ts` gọi global `nativeFetch` (bản fetch() KHÔNG bị
// monkey-patch qua proxy /.proxy/ trong runtime plug thật — xem Phase 0).
// Ngoài runtime plug đó, `nativeFetch` không tồn tại; ở đây dùng fetch() gốc
// của Node để gọi THẬT qua network tới server vừa dựng.
(globalThis as any).nativeFetch = fetch;

const {
  deleteFile,
  downloadFile,
  listEntriesRecursive,
  uploadFile,
} = await import("../../plugs/sync/webdav_sync.ts");

let dataDir: string;
let server: Server;
let baseUrl: string;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "chessnote-cloud-integration-"));
  const users = parseUsers("alice:s3cret");
  const handler = createRequestHandler(users, dataDir);
  server = createServer((req, res) => void handler(req, res));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("unexpected server address");
  baseUrl = `http://127.0.0.1:${address.port}/`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(dataDir, { recursive: true, force: true });
});

const auth = { baseUrl: "", username: "alice", password: "s3cret" };
function authFor(): typeof auth {
  return { ...auth, baseUrl };
}

describe("plugs/sync/webdav_sync.ts client against a real ChessNote Cloud server", () => {
  test("401s on the wrong password", async () => {
    await expect(
      uploadFile({ ...authFor(), password: "wrong" }, "", "a.md", new TextEncoder().encode("x"), {
        tag: "add",
      }),
    ).rejects.toThrow();
  });

  test("upload (add) then download round-trips the exact content", async () => {
    const a = authFor();
    await uploadFile(a, "", "a.md", new TextEncoder().encode("xin chào"), { tag: "add" });
    const result = await downloadFile(a, "", "a.md");
    expect(new TextDecoder().decode(result.data)).toBe("xin chào");
  });

  test("PROPFIND lists an uploaded file with a usable ETag as its rev", async () => {
    const a = authFor();
    await uploadFile(a, "", "a.md", new TextEncoder().encode("hi"), { tag: "add" });
    const entries = await listEntriesRecursive(a, "");
    expect(entries).toEqual([
      expect.objectContaining({ path: "a.md", deleted: false }),
    ]);
    expect(entries[0].rev).toMatch(/^[0-9a-f]{40}$/);
  });

  test("PROPFIND lists files nested in subfolders with the correct relative path", async () => {
    const a = authFor();
    // Client tự MKCOL khi PUT gặp 409 thư mục cha thiếu (xem webdav_sync.ts).
    await uploadFile(a, "", "notes/2026/game.md", new TextEncoder().encode("pgn here"), { tag: "add" });
    const entries = await listEntriesRecursive(a, "");
    expect(entries.map((e) => e.path)).toEqual(["notes/2026/game.md"]);
  });

  test("update mode succeeds with the correct rev, then re-download sees the new content", async () => {
    const a = authFor();
    await uploadFile(a, "", "a.md", new TextEncoder().encode("v1"), { tag: "add" });
    const [entry] = await listEntriesRecursive(a, "");
    await uploadFile(a, "", "a.md", new TextEncoder().encode("v2"), { tag: "update", rev: entry.rev });
    const result = await downloadFile(a, "", "a.md");
    expect(new TextDecoder().decode(result.data)).toBe("v2");
  });

  test("update mode with a stale rev raises WebDavConflictError (real 412 over the wire)", async () => {
    const a = authFor();
    await uploadFile(a, "", "a.md", new TextEncoder().encode("v1"), { tag: "add" });
    await uploadFile(a, "", "a.md", new TextEncoder().encode("v2-by-another-device"), {
      tag: "update",
      rev: (await listEntriesRecursive(a, "")).find((e) => e.path === "a.md")!.rev,
    });

    await expect(
      uploadFile(a, "", "a.md", new TextEncoder().encode("v3-stale"), {
        tag: "update",
        rev: "0000000000000000000000000000000000000000", // rev cũ, đã lệch thật
      }),
    ).rejects.toThrow(/Xung đột/);
  });

  test("delete removes the file, and a repeat delete is a no-op success (idempotent 404)", async () => {
    const a = authFor();
    await uploadFile(a, "", "a.md", new TextEncoder().encode("x"), { tag: "add" });
    await deleteFile(a, "", "a.md");
    await expect(deleteFile(a, "", "a.md")).resolves.toBeUndefined();
    const entries = await listEntriesRecursive(a, "");
    expect(entries).toEqual([]);
  });

  test("two different users (Basic Auth) are isolated -- alice cannot see bob's files", async () => {
    const users = parseUsers("alice:s3cret,bob:t0p");
    const handler2 = createRequestHandler(users, dataDir);
    const server2 = createServer((req, res) => void handler2(req, res));
    await new Promise<void>((resolve) => server2.listen(0, "127.0.0.1", resolve));
    const address2 = server2.address();
    if (!address2 || typeof address2 === "string") throw new Error("unexpected address");
    const url2 = `http://127.0.0.1:${address2.port}/`;

    try {
      await uploadFile({ baseUrl: url2, username: "alice", password: "s3cret" }, "", "alice-only.md", new TextEncoder().encode("secret"), { tag: "add" });
      const bobEntries = await listEntriesRecursive({ baseUrl: url2, username: "bob", password: "t0p" }, "");
      expect(bobEntries).toEqual([]);
    } finally {
      await new Promise<void>((resolve) => server2.close(() => resolve()));
    }
  });
});
