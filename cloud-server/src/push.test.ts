// Unit test cho việc gộp (coalesce) tín hiệu "changed" (Giai đoạn 1.2b) --
// tách khỏi push_integration.test.ts (dùng server/WebSocket thật, chậm hơn và
// khó kiểm soát thời gian chính xác) để kiểm tra đúng số lần GỬI THẬT SỰ khi
// `broadcastChanged` được gọi nhiều lần liên tiếp trong 1 burst.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

/** WebSocket giả tối giản -- chỉ đủ để đếm số lần `send()` thật sự xảy ra. */
class FakeWs {
  readyState = 1; // OPEN
  readonly OPEN = 1; // ws.OPEN được đọc trực tiếp trên instance trong push.ts
  sentMessages: string[] = [];
  send(data: string) {
    this.sentMessages.push(data);
  }
  // registerConnection() gọi ws.once("close", ...) để tự dọn khi kết nối
  // đóng -- không cần mô phỏng thật, chỉ cần không throw ở các test không
  // chủ động test đường "đóng kết nối".
  once(_event: string, _cb: () => void) {}
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("broadcastChanged coalescing", () => {
  test("N calls in quick succession for the same user result in exactly 1 send", async () => {
    const { registerConnection, broadcastChanged } = await import("./push.ts");
    const ws = new FakeWs();
    registerConnection("alice", ws as unknown as import("ws").WebSocket);

    for (let i = 0; i < 10; i++) broadcastChanged("alice");
    expect(ws.sentMessages).toEqual([]); // chưa gửi gì trong lúc còn gộp

    await vi.advanceTimersByTimeAsync(800); // BROADCAST_COALESCE_MS
    expect(ws.sentMessages).toEqual(["changed"]);
  });

  test("calls after the coalesce window flush schedules a fresh send", async () => {
    const { registerConnection, broadcastChanged } = await import("./push.ts");
    const ws = new FakeWs();
    registerConnection("bob", ws as unknown as import("ws").WebSocket);

    broadcastChanged("bob");
    await vi.advanceTimersByTimeAsync(800);
    expect(ws.sentMessages).toEqual(["changed"]);

    broadcastChanged("bob");
    await vi.advanceTimersByTimeAsync(800);
    expect(ws.sentMessages).toEqual(["changed", "changed"]);
  });

  test("does not send to a connection that closed while a broadcast was pending", async () => {
    const { registerConnection, broadcastChanged, connectionCountForTests } = await import("./push.ts");
    const ws = new FakeWs();
    let closeHandler: (() => void) | undefined;
    const wsLike = {
      ...ws,
      send: ws.send.bind(ws),
      once: (event: string, cb: () => void) => {
        if (event === "close") closeHandler = cb;
      },
    };
    registerConnection("carol", wsLike as unknown as import("ws").WebSocket);

    broadcastChanged("carol");
    // Kết nối đóng NGAY trong lúc còn đang chờ coalesce window.
    ws.readyState = 3; // CLOSED
    closeHandler?.();
    expect(connectionCountForTests("carol")).toBe(0);

    await vi.advanceTimersByTimeAsync(800);
    expect(ws.sentMessages).toEqual([]); // không gửi nhầm vào kết nối đã đóng
  });

  test("two different users are coalesced independently", async () => {
    const { registerConnection, broadcastChanged } = await import("./push.ts");
    const wsAlice = new FakeWs();
    const wsBob = new FakeWs();
    registerConnection("alice2", wsAlice as unknown as import("ws").WebSocket);
    registerConnection("bob2", wsBob as unknown as import("ws").WebSocket);

    broadcastChanged("alice2");
    broadcastChanged("alice2");
    broadcastChanged("bob2");

    await vi.advanceTimersByTimeAsync(800);
    expect(wsAlice.sentMessages).toEqual(["changed"]);
    expect(wsBob.sentMessages).toEqual(["changed"]);
  });
});
