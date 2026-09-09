// Test tích hợp cho kênh push: dựng server thật, mở 1 kết nối WebSocket thật
// tới `/_push?auth=...`, rồi xác nhận nó nhận được tín hiệu "changed" khi có
// 1 PUT/DELETE thật xảy ra qua HTTP -- không mock `ws` hay HTTP.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";
import { parseUsers } from "./auth.ts";
import { createPushUpgradeHandler, createRequestHandler } from "./server.ts";

let dataDir: string;
let server: Server;
let baseUrl: string;
let wsUrl: string;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "chessnote-cloud-push-test-"));
  const users = parseUsers("alice:s3cret");
  const handler = createRequestHandler(users, dataDir);
  const push = createPushUpgradeHandler(users);
  server = createServer((req, res) => void handler(req, res));
  server.on("upgrade", (req, socket, head) => push.handleUpgrade(req, socket, head));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("unexpected address");
  baseUrl = `http://127.0.0.1:${address.port}/`;
  wsUrl = `ws://127.0.0.1:${address.port}/_push`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(dataDir, { recursive: true, force: true });
});

function token(user: string, pass: string): string {
  return Buffer.from(`${user}:${pass}`).toString("base64");
}

function waitForMessage(ws: WebSocket, timeoutMs = 2000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout waiting for push message")), timeoutMs);
    ws.once("message", (data) => {
      clearTimeout(timer);
      resolve(data.toString());
    });
  });
}

function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
}

describe("ChessNote Cloud push channel", () => {
  test("receives a 'changed' message when another request PUTs a file", async () => {
    const ws = new WebSocket(`${wsUrl}?auth=${token("alice", "s3cret")}`);
    await waitForOpen(ws);

    const messagePromise = waitForMessage(ws);
    await fetch(`${baseUrl}a.md`, {
      method: "PUT",
      headers: { authorization: `Basic ${token("alice", "s3cret")}`, "if-none-match": "*" },
      body: "hello",
    });

    expect(await messagePromise).toBe("changed");
    ws.close();
  });

  test("receives a 'changed' message on DELETE too", async () => {
    await fetch(`${baseUrl}a.md`, {
      method: "PUT",
      headers: { authorization: `Basic ${token("alice", "s3cret")}`, "if-none-match": "*" },
      body: "hello",
    });

    const ws = new WebSocket(`${wsUrl}?auth=${token("alice", "s3cret")}`);
    await waitForOpen(ws);
    const messagePromise = waitForMessage(ws);

    await fetch(`${baseUrl}a.md`, {
      method: "DELETE",
      headers: { authorization: `Basic ${token("alice", "s3cret")}` },
    });

    expect(await messagePromise).toBe("changed");
    ws.close();
  });

  test("rejects a connection with the wrong auth token", async () => {
    const ws = new WebSocket(`${wsUrl}?auth=${token("alice", "wrong-password")}`);
    await new Promise<void>((resolve) => {
      ws.once("error", () => resolve());
      ws.once("close", () => resolve());
    });
    expect(ws.readyState).not.toBe(WebSocket.OPEN);
  });

  test("two different users' connections are isolated -- bob's PUT does not notify alice", async () => {
    const users = parseUsers("alice:s3cret,bob:t0p");
    const handler2 = createRequestHandler(users, dataDir);
    const push2 = createPushUpgradeHandler(users);
    const server2 = createServer((req, res) => void handler2(req, res));
    server2.on("upgrade", (req, socket, head) => push2.handleUpgrade(req, socket, head));
    await new Promise<void>((resolve) => server2.listen(0, "127.0.0.1", resolve));
    const address2 = server2.address();
    if (!address2 || typeof address2 === "string") throw new Error("unexpected address");
    const port2 = address2.port;

    try {
      const aliceWs = new WebSocket(`ws://127.0.0.1:${port2}/_push?auth=${token("alice", "s3cret")}`);
      await waitForOpen(aliceWs);

      let aliceGotMessage = false;
      aliceWs.once("message", () => {
        aliceGotMessage = true;
      });

      await fetch(`http://127.0.0.1:${port2}/bob-file.md`, {
        method: "PUT",
        headers: { authorization: `Basic ${token("bob", "t0p")}`, "if-none-match": "*" },
        body: "bob's content",
      });

      // Chờ 1 nhịp ngắn để chắc chắn KHÔNG có message nào tới -- không có gì
      // để "await" thành công ở đây (đây là test phủ định).
      await new Promise((r) => setTimeout(r, 300));
      expect(aliceGotMessage).toBe(false);
      aliceWs.close();
    } finally {
      await new Promise<void>((resolve) => server2.close(() => resolve()));
    }
  });
});
