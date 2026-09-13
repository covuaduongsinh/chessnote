import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const configStore: Record<string, unknown> = {};
const clientStoreData: Record<string, unknown> = {};
const configDefine = vi.fn();

vi.mock("@silverbulletmd/silverbullet/syscalls", () => ({
  config: {
    get: async (key: string, def: unknown) => (key in configStore ? configStore[key] : def),
    define: (...args: unknown[]) => configDefine(...args),
  },
  clientStore: {
    get: async (key: string) => clientStoreData[key],
  },
}));

const runAllConfiguredSyncs = vi.fn();
vi.mock("./auto_trigger.ts", () => ({
  runAllConfiguredSyncs: (...args: unknown[]) => runAllConfiguredSyncs(...args),
}));

/** WebSocket giả — theo dõi mọi instance được tạo ra để test điều khiển
 * onopen/onmessage/onclose/onerror thủ công, không cần 1 server thật. */
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.onclose?.();
  }
}

function latestSocket(): FakeWebSocket {
  const s = FakeWebSocket.instances.at(-1);
  if (!s) throw new Error("no WebSocket constructed");
  return s;
}

async function freshModule() {
  vi.resetModules();
  return await import("./push_trigger.ts");
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(configStore)) delete configStore[k];
  for (const k of Object.keys(clientStoreData)) delete clientStoreData[k];
  FakeWebSocket.instances = [];
  vi.stubGlobal("WebSocket", FakeWebSocket);
  vi.stubGlobal("btoa", (s: string) => Buffer.from(s, "binary").toString("base64"));
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("buildPushUrl", () => {
  test("converts http -> ws and appends the base64 auth token", async () => {
    const { buildPushUrl } = await freshModule();
    const url = buildPushUrl("http://mycloud.example.com/", { baseUrl: "", username: "alice", password: "s3cret" });
    expect(url).toBe(
      `ws://mycloud.example.com/_push?auth=${encodeURIComponent(Buffer.from("alice:s3cret").toString("base64"))}`,
    );
  });

  test("converts https -> wss", async () => {
    const { buildPushUrl } = await freshModule();
    const url = buildPushUrl("https://mycloud.example.com", { baseUrl: "", username: "a", password: "b" });
    expect(url.startsWith("wss://mycloud.example.com/_push")).toBe(true);
  });
});

describe("initPushTrigger", () => {
  test("registers the config field, default disabled", async () => {
    const { initPushTrigger } = await freshModule();
    await initPushTrigger();
    expect(configDefine).toHaveBeenCalledWith(
      "chess.webdav.enableRealtimePush",
      expect.objectContaining({ default: false }),
    );
  });

  test("does not open a WebSocket when the feature is disabled", async () => {
    const { initPushTrigger } = await freshModule();
    configStore["chess.webdav.enableRealtimePush"] = false;
    await initPushTrigger();
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  test("opens a WebSocket immediately when enabled and already logged in to WebDAV", async () => {
    configStore["chess.webdav.enableRealtimePush"] = true;
    configStore["chess.webdav.url"] = "https://mycloud.example.com/";
    clientStoreData["webdavCredentials"] = { baseUrl: "", username: "alice", password: "s3cret" };
    const { initPushTrigger } = await freshModule();

    await initPushTrigger();

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(latestSocket().url).toContain("wss://mycloud.example.com/_push?auth=");
  });

  test("when enabled but not yet logged in, schedules a retry instead of failing", async () => {
    configStore["chess.webdav.enableRealtimePush"] = true;
    // Chưa có chess.webdav.url / credentials.
    const { initPushTrigger } = await freshModule();

    await initPushTrigger();
    expect(FakeWebSocket.instances).toHaveLength(0);

    // Đăng nhập WebDAV "muộn" (giả lập người dùng vừa chạy Command đăng nhập).
    configStore["chess.webdav.url"] = "https://mycloud.example.com/";
    clientStoreData["webdavCredentials"] = { baseUrl: "", username: "alice", password: "s3cret" };

    await vi.advanceTimersByTimeAsync(5_000); // INITIAL_RECONNECT_DELAY_MS
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  test("gracefully no-ops (no throw) when WebSocket is unavailable in this sandbox", async () => {
    vi.unstubAllGlobals();
    vi.stubGlobal("btoa", (s: string) => Buffer.from(s, "binary").toString("base64"));
    // Không stub WebSocket -> typeof WebSocket === "undefined" trong Node.
    configStore["chess.webdav.enableRealtimePush"] = true;
    configStore["chess.webdav.url"] = "https://mycloud.example.com/";
    clientStoreData["webdavCredentials"] = { baseUrl: "", username: "alice", password: "s3cret" };
    const { initPushTrigger } = await freshModule();

    await expect(initPushTrigger()).resolves.toBeUndefined();
  });
});

describe("message handling and reconnect backoff", () => {
  async function connectedModule() {
    configStore["chess.webdav.enableRealtimePush"] = true;
    configStore["chess.webdav.url"] = "https://mycloud.example.com/";
    clientStoreData["webdavCredentials"] = { baseUrl: "", username: "alice", password: "s3cret" };
    const mod = await freshModule();
    await mod.initPushTrigger();
    return mod;
  }

  test("an incoming message triggers runAllConfiguredSyncs after the debounce delay", async () => {
    await connectedModule();
    latestSocket().onmessage?.({ data: "changed" });
    expect(runAllConfiguredSyncs).not.toHaveBeenCalled(); // chưa gọi ngay -- đang debounce
    await vi.advanceTimersByTimeAsync(3_000); // PUSH_DEBOUNCE_MS
    expect(runAllConfiguredSyncs).toHaveBeenCalledTimes(1);
  });

  test("a burst of messages within the debounce window coalesces into a single sync (Giai đoạn 1.2a)", async () => {
    await connectedModule();
    const socket = latestSocket();
    // Mô phỏng N file thay đổi ở thiết bị khác -> N tín hiệu "changed" gần
    // như liên tiếp (xem cloud-server/src/push.ts broadcastChanged).
    for (let i = 0; i < 10; i++) {
      socket.onmessage?.({ data: "changed" });
      await vi.advanceTimersByTimeAsync(200); // < PUSH_DEBOUNCE_MS giữa các tín hiệu
    }
    expect(runAllConfiguredSyncs).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(3_000); // burst lắng xuống -> debounce bắn
    expect(runAllConfiguredSyncs).toHaveBeenCalledTimes(1);
  });

  test("on close, reconnects after the backoff delay and grows the delay each time", async () => {
    await connectedModule();
    expect(FakeWebSocket.instances).toHaveLength(1);

    latestSocket().close(); // mất kết nối lần 1
    await vi.advanceTimersByTimeAsync(4_999);
    expect(FakeWebSocket.instances).toHaveLength(1); // chưa đủ 5s
    await vi.advanceTimersByTimeAsync(1);
    expect(FakeWebSocket.instances).toHaveLength(2); // đủ 5s -> reconnect lần 1

    latestSocket().close(); // mất kết nối lần 2 -- backoff phải TĂNG (10s, không phải lại 5s)
    await vi.advanceTimersByTimeAsync(9_999);
    expect(FakeWebSocket.instances).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(FakeWebSocket.instances).toHaveLength(3);
  });

  test("a successful open resets the backoff delay back to the initial value", async () => {
    await connectedModule();
    latestSocket().onopen?.(); // kết nối thành công
    latestSocket().close(); // rồi mất ngay -- phải lùi về delay ban đầu (5s), không tiếp tục tăng

    await vi.advanceTimersByTimeAsync(4_999);
    expect(FakeWebSocket.instances).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  test("an error closes the socket, which then schedules exactly one reconnect (no double-schedule)", async () => {
    await connectedModule();
    latestSocket().onerror?.();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });
});

describe("notifyCredentialsChanged", () => {
  test("disconnects the current socket and immediately reconnects with fresh credentials", async () => {
    configStore["chess.webdav.enableRealtimePush"] = true;
    configStore["chess.webdav.url"] = "https://mycloud.example.com/";
    const { initPushTrigger, notifyCredentialsChanged } = await freshModule();

    await initPushTrigger(); // chưa có credentials -> chỉ lên lịch retry
    expect(FakeWebSocket.instances).toHaveLength(0);

    clientStoreData["webdavCredentials"] = { baseUrl: "", username: "alice", password: "s3cret" };
    await notifyCredentialsChanged();

    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  test("disabling the feature then calling notifyCredentialsChanged closes any open socket", async () => {
    configStore["chess.webdav.enableRealtimePush"] = true;
    configStore["chess.webdav.url"] = "https://mycloud.example.com/";
    clientStoreData["webdavCredentials"] = { baseUrl: "", username: "alice", password: "s3cret" };
    const { initPushTrigger, notifyCredentialsChanged } = await freshModule();
    await initPushTrigger();
    const openSocket = latestSocket();
    expect(openSocket.closed).toBe(false);

    configStore["chess.webdav.enableRealtimePush"] = false;
    await notifyCredentialsChanged();

    expect(openSocket.closed).toBe(true);
  });
});
