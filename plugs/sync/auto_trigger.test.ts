import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { SyncReport } from "./sync_engine.ts";

const flashNotification = vi.fn();
const configStore: Record<string, unknown> = {};
const configGet = vi.fn(async (key: string, def: unknown) =>
  key in configStore ? configStore[key] : def,
);
const configDefine = vi.fn();

vi.mock("@silverbulletmd/silverbullet/syscalls", () => ({
  editor: { flashNotification: (...args: unknown[]) => flashNotification(...args) },
  config: {
    get: (...args: [string, unknown]) => configGet(...args),
    define: (...args: unknown[]) => configDefine(...args),
  },
}));

const runDropboxSync = vi.fn();
const dropboxStatus = vi.fn();
vi.mock("./dropbox_bridge.ts", () => ({
  runDropboxSync: (...args: unknown[]) => runDropboxSync(...args),
  dropboxStatus: (...args: unknown[]) => dropboxStatus(...args),
}));

const runWebDavSync = vi.fn();
const webdavStatus = vi.fn();
vi.mock("./webdav_bridge.ts", () => ({
  runWebDavSync: (...args: unknown[]) => runWebDavSync(...args),
  webdavStatus: (...args: unknown[]) => webdavStatus(...args),
}));

const { runAllConfiguredSyncs, initAutoTrigger, commandSyncStatus, onPageSaved } = await import(
  "./auto_trigger.ts"
);

function report(overrides: Partial<SyncReport> = {}): SyncReport {
  return {
    uploaded: [],
    downloaded: [],
    deletedLocal: [],
    deletedRemote: [],
    conflicts: [],
    errors: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(configStore)) delete configStore[k];
});

describe("runAllConfiguredSyncs", () => {
  test("runs both providers and stays quiet when nothing changed", async () => {
    runDropboxSync.mockResolvedValue(report());
    runWebDavSync.mockResolvedValue(report());

    await runAllConfiguredSyncs();

    expect(runDropboxSync).toHaveBeenCalledTimes(1);
    expect(runWebDavSync).toHaveBeenCalledTimes(1);
    expect(flashNotification).not.toHaveBeenCalled();
  });

  test("stays quiet (no notification, no error) when a provider is not configured (null)", async () => {
    runDropboxSync.mockResolvedValue(null);
    runWebDavSync.mockResolvedValue(null);

    await runAllConfiguredSyncs();

    expect(flashNotification).not.toHaveBeenCalled();
  });

  test("notifies when a provider's report has something notable", async () => {
    runDropboxSync.mockResolvedValue(report({ uploaded: ["a.md"] }));
    runWebDavSync.mockResolvedValue(null);

    await runAllConfiguredSyncs();

    expect(flashNotification).toHaveBeenCalledTimes(1);
    expect(flashNotification.mock.calls[0][0]).toContain("Dropbox");
    expect(flashNotification.mock.calls[0][0]).toContain("↑1");
  });

  test("notifies with 'warning' severity when the report has errors", async () => {
    runDropboxSync.mockResolvedValue(report({ errors: [{ path: "x.md", error: "boom" }] }));
    runWebDavSync.mockResolvedValue(null);

    await runAllConfiguredSyncs();

    expect(flashNotification.mock.calls[0][1]).toBe("warning");
  });

  test("a thrown error from one provider is reported but does not affect the other", async () => {
    runDropboxSync.mockRejectedValue(new Error("network down"));
    runWebDavSync.mockResolvedValue(report({ downloaded: ["b.md"] }));

    await runAllConfiguredSyncs();

    expect(flashNotification).toHaveBeenCalledTimes(2);
    const messages = flashNotification.mock.calls.map((c) => c[0] as string);
    expect(messages.some((m) => m.includes("Dropbox") && m.includes("network down"))).toBe(true);
    expect(messages.some((m) => m.includes("WebDAV") && m.includes("↓1"))).toBe(true);
  });

  test("a provider lock prevents an overlapping run of the SAME provider", async () => {
    let resolveFirst!: (v: SyncReport | null) => void;
    runDropboxSync.mockImplementationOnce(
      () => new Promise<SyncReport | null>((resolve) => (resolveFirst = resolve)),
    );
    runWebDavSync.mockResolvedValue(null);

    const firstRun = runAllConfiguredSyncs();
    // Nhả vài microtask để lượt WebDAV của firstRun (đã resolve ngay) thật sự
    // chạy xong và giải phóng lock của nó trước khi gọi lượt thứ hai — nếu
    // gọi secondRun ngay lập tức (không nhường control), JS sẽ chưa xử lý
    // xong bất kỳ promise nào, khiến CẢ HAI provider của secondRun đều thấy
    // lock đang bị giữ (không phân biệt được Dropbox vs WebDAV).
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    // Dropbox's first call is still pending (chưa resolveFirst) -> lượt thứ
    // hai phải bỏ qua Dropbox (lock held) nhưng vẫn chạy lại WebDAV bình thường.
    const secondRun = runAllConfiguredSyncs();

    resolveFirst(report());
    await Promise.all([firstRun, secondRun]);

    expect(runDropboxSync).toHaveBeenCalledTimes(1);
    expect(runWebDavSync).toHaveBeenCalledTimes(2);
  });
});

describe("initAutoTrigger", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("registers the config field with a default of 5 minutes", async () => {
    await initAutoTrigger();
    expect(configDefine).toHaveBeenCalledWith(
      "chess.sync.autoIntervalMinutes",
      expect.objectContaining({ default: 5 }),
    );
  });

  test("fires runAllConfiguredSyncs on the configured interval", async () => {
    runDropboxSync.mockResolvedValue(null);
    runWebDavSync.mockResolvedValue(null);
    configStore["chess.sync.autoIntervalMinutes"] = 5;

    await initAutoTrigger();
    expect(runDropboxSync).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(runDropboxSync).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(runDropboxSync).toHaveBeenCalledTimes(2);
  });

  test("autoIntervalMinutes = 0 disables the timer entirely", async () => {
    configStore["chess.sync.autoIntervalMinutes"] = 0;

    await initAutoTrigger();
    await vi.advanceTimersByTimeAsync(60 * 60_000);

    expect(runDropboxSync).not.toHaveBeenCalled();
  });

  test("re-initializing clears the previous timer instead of stacking a second one", async () => {
    configStore["chess.sync.autoIntervalMinutes"] = 5;
    runDropboxSync.mockResolvedValue(null);
    runWebDavSync.mockResolvedValue(null);

    await initAutoTrigger();
    await initAutoTrigger(); // giả lập editor:init chạy lại lần 2

    await vi.advanceTimersByTimeAsync(5 * 60_000);
    // Nếu timer cũ không bị clear, đây sẽ là 2 (2 timer cùng bắn).
    expect(runDropboxSync).toHaveBeenCalledTimes(1);
  });
});

describe("onPageSaved (debounce)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    runDropboxSync.mockResolvedValue(null);
    runWebDavSync.mockResolvedValue(null);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("does not sync immediately on save", () => {
    onPageSaved();
    expect(runDropboxSync).not.toHaveBeenCalled();
  });

  test("syncs once after the debounce window elapses", async () => {
    onPageSaved();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(runDropboxSync).toHaveBeenCalledTimes(1);
  });

  test("repeated saves within the window collapse into a single sync (debounced, not accumulated)", async () => {
    onPageSaved();
    await vi.advanceTimersByTimeAsync(20_000);
    onPageSaved(); // gõ tiếp trước khi hết 30s -> phải reset lại đồng hồ đếm
    await vi.advanceTimersByTimeAsync(20_000);
    expect(runDropboxSync).not.toHaveBeenCalled(); // mới 20s kể từ lần save thứ 2

    await vi.advanceTimersByTimeAsync(10_000); // đủ 30s kể từ lần save thứ 2
    expect(runDropboxSync).toHaveBeenCalledTimes(1);
  });
});

describe("commandSyncStatus", () => {
  test("combines both providers' status into a single notification", async () => {
    dropboxStatus.mockResolvedValue({ ok: true, connected: true, lastSyncAt: 1_000 });
    webdavStatus.mockResolvedValue({ ok: false, connected: false });

    await commandSyncStatus();

    expect(flashNotification).toHaveBeenCalledTimes(1);
    const [message] = flashNotification.mock.calls[0];
    expect(message).toContain("Dropbox");
    expect(message).toContain("WebDAV: chưa cấu hình");
  });

  test("shows the last error when a provider's last sync failed", async () => {
    dropboxStatus.mockResolvedValue({
      ok: true,
      connected: true,
      lastSyncAt: 1_000,
      lastError: "boom",
    });
    webdavStatus.mockResolvedValue({ ok: false, connected: false });

    await commandSyncStatus();

    const [message] = flashNotification.mock.calls[0];
    expect(message).toContain("lỗi gần nhất: boom");
  });
});
