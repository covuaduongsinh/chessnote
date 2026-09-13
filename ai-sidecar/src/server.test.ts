// Test tích hợp cho việc giới hạn concurrency ở `/ai/generate` (Giai đoạn
// 2.2, 2026-09-13) -- dựng server thật (như cloud-server/src/push_integration.test.ts),
// mock `generateText` (không spawn CLI thật) để kiểm soát chính xác thời điểm
// mỗi "tiến trình" hoàn tất, rồi xác nhận số lời gọi ĐANG CHẠY ĐỒNG THỜI không
// bao giờ vượt `AI_SIDECAR_MAX_CONCURRENCY`.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createServer, type Server } from "node:http";

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const generateTextMock = vi.fn();
vi.mock("./model.ts", () => ({ generateText: (...args: unknown[]) => generateTextMock(...args) }));

let server: Server;
let baseUrl: string;

async function freshServer() {
  vi.resetModules();
  const { createRequestHandler } = await import("./server.ts");
  const handler = createRequestHandler();
  server = createServer((req, res) => void handler(req, res));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("unexpected address");
  baseUrl = `http://127.0.0.1:${address.port}`;
}

beforeEach(() => {
  generateTextMock.mockClear();
  delete process.env.AI_SIDECAR_MAX_CONCURRENCY;
  delete process.env.AI_SIDECAR_MAX_QUEUE;
  delete process.env.AUTH_SIDECAR_TOKEN;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function postGenerate(prompt: string) {
  return fetch(`${baseUrl}/ai/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
}

describe("POST /ai/generate concurrency limit", () => {
  test("never runs more than AI_SIDECAR_MAX_CONCURRENCY generateText calls at once", async () => {
    process.env.AI_SIDECAR_MAX_CONCURRENCY = "2";
    process.env.AI_SIDECAR_MAX_QUEUE = "10";
    await freshServer();

    let active = 0;
    let maxObserved = 0;
    const gates: ReturnType<typeof deferred<void>>[] = [];
    generateTextMock.mockImplementation(async () => {
      active++;
      maxObserved = Math.max(maxObserved, active);
      const gate = deferred<void>();
      gates.push(gate);
      await gate.promise;
      active--;
      return { ok: true, text: "done" };
    });

    const requests = Array.from({ length: 5 }, (_, i) => postGenerate(`prompt-${i}`));

    // Chờ tới khi 2 lời gọi đầu tiên thực sự bắt đầu (mock ghi nhận active=2).
    await vi.waitFor(() => expect(gates.length).toBe(2));
    expect(active).toBe(2); // đúng giới hạn -- không phải 5

    // Mở khoá dần từng cái -- mỗi lần giải phóng 1 slot phải làm đúng 1 request
    // đang xếp hàng bắt đầu chạy tiếp (không bao giờ vượt quá 2 đồng thời).
    while (generateTextMock.mock.calls.length < 5) {
      const before = generateTextMock.mock.calls.length;
      gates.shift()!.resolve();
      await vi.waitFor(() => expect(generateTextMock.mock.calls.length).toBeGreaterThan(before));
    }
    gates.splice(0).forEach((g) => g.resolve()); // giải phóng 2 request cuối còn treo

    const responses = await Promise.all(requests);
    for (const r of responses) expect(r.status).toBe(200);
    expect(maxObserved).toBeLessThanOrEqual(2);
    expect(generateTextMock).toHaveBeenCalledTimes(5);
  });

  test("rejects with 429 once the queue is full instead of hanging forever", async () => {
    process.env.AI_SIDECAR_MAX_CONCURRENCY = "1";
    process.env.AI_SIDECAR_MAX_QUEUE = "1";
    await freshServer();

    const gate = deferred<void>();
    generateTextMock.mockImplementation(async () => {
      await gate.promise;
      return { ok: true, text: "done" };
    });

    // 1 đang chạy + 1 xếp hàng (tối đa cho phép) + 1 request thứ 3 phải bị từ chối ngay.
    const running = postGenerate("a");
    const queued = postGenerate("b");
    await vi.waitFor(() => expect(generateTextMock).toHaveBeenCalledTimes(1));
    const rejected = await postGenerate("c");

    expect(rejected.status).toBe(429);
    const body = await rejected.json();
    expect(body.ok).toBe(false);

    gate.resolve();
    const [runningRes, queuedRes] = await Promise.all([running, queued]);
    expect(runningRes.status).toBe(200);
    expect(queuedRes.status).toBe(200);
  });

  test("healthz and validation errors do not consume a concurrency slot", async () => {
    process.env.AI_SIDECAR_MAX_CONCURRENCY = "1";
    await freshServer();

    const health = await fetch(`${baseUrl}/healthz`);
    expect(health.status).toBe(200);

    const missingPrompt = await fetch(`${baseUrl}/ai/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(missingPrompt.status).toBe(400);
    expect(generateTextMock).not.toHaveBeenCalled();
  });
});
