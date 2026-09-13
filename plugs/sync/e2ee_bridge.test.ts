import { beforeEach, describe, expect, test, vi } from "vitest";
import type { RemoteFileEntry, SyncProvider, WriteMode } from "./sync_provider.ts";

const flashNotification = vi.fn();
const prompt = vi.fn();
const configStore: Record<string, unknown> = {};
const clientStoreData: Record<string, unknown> = {};

vi.mock("@silverbulletmd/silverbullet/syscalls", () => ({
  editor: {
    flashNotification: (...args: unknown[]) => flashNotification(...args),
    prompt: (...args: unknown[]) => prompt(...args),
  },
  config: {
    get: async (key: string, def: unknown) => (key in configStore ? configStore[key] : def),
    define: vi.fn(),
  },
  clientStore: {
    get: async (key: string) => clientStoreData[key],
    set: async (key: string, v: unknown) => {
      clientStoreData[key] = v;
    },
    del: async (key: string) => {
      delete clientStoreData[key];
    },
  },
}));

const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);

/** Provider giả có `stored` — cho phép nhìn thẳng vào "nội dung thật trên
 * remote" để phân biệt "đã bị bọc mã hoá" (nội dung khác plaintext) hay
 * chưa (nội dung == plaintext), KHÔNG dựa vào `instanceof` — xem lý do ở
 * `wrapsProviderWithEncryption()` dưới. */
class FakeProvider implements SyncProvider {
  readonly name = "Fake";
  stored = new Map<string, Uint8Array>();
  async listEntries() {
    return { entries: [] as RemoteFileEntry[], cursor: undefined, full: true as const };
  }
  async download(_folder: string, path: string) {
    return { data: this.stored.get(path)!, rev: "r", serverModified: "s" };
  }
  async upload(_folder: string, path: string, data: Uint8Array, _mode: WriteMode) {
    this.stored.set(path, data);
    return { rev: "r", serverModified: "s" };
  }
  async delete(_folder: string, path: string) {
    this.stored.delete(path);
  }
}

/**
 * Xác minh `wrapped` (kết quả `wrapProviderWithE2eeIfEnabled(fake)`) có thật
 * sự mã hoá hay không, bằng HÀNH VI thay vì `instanceof`: `freshModule()` ở
 * dưới dùng `vi.resetModules()` để mỗi test có 1 bản `e2ee_bridge.ts` "sạch"
 * (state `unlockedKey` ở module scope không rò rỉ giữa test) — nhưng điều đó
 * cũng khiến `EncryptingSyncProvider` mà `e2ee_bridge.ts` import nội bộ trở
 * thành 1 THỰC THỂ MODULE khác với bất kỳ import tĩnh nào ở file test, nên
 * `instanceof` sẽ luôn false dù logic đúng — đây là cạm bẫy đã biết của
 * `vi.resetModules()`, không phải bug thật.
 */
async function wrapsProviderWithEncryption(
  fake: FakeProvider,
  wrapped: SyncProvider,
): Promise<boolean> {
  await wrapped.upload("folder", "probe.md", enc("plaintext-probe"), { tag: "add" });
  const rawOnRemote = fake.stored.get("probe.md")!;
  const roundTrip = dec((await wrapped.download("folder", "probe.md")).data);
  const rawLooksEncrypted = dec(rawOnRemote) !== "plaintext-probe";
  return rawLooksEncrypted && roundTrip === "plaintext-probe";
}

// Module có state ở scope module (unlockedKey) — cần re-import "sạch" mỗi
// test để không rò rỉ trạng thái "đã mở khoá" giữa các test case.
async function freshModule() {
  vi.resetModules();
  return await import("./e2ee_bridge.ts");
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(configStore)) delete configStore[k];
  for (const k of Object.keys(clientStoreData)) delete clientStoreData[k];
});

describe("wrapProviderWithE2eeIfEnabled", () => {
  test("returns the provider unchanged when E2EE is disabled", async () => {
    const { wrapProviderWithE2eeIfEnabled } = await freshModule();
    configStore["chess.sync.e2ee.enabled"] = false;
    const fake = new FakeProvider();

    const result = await wrapProviderWithE2eeIfEnabled(fake);

    expect(result).toBe(fake);
    expect(await wrapsProviderWithEncryption(fake, result)).toBe(false);
  });

  test("throws a clear error when E2EE is enabled but not yet unlocked this session", async () => {
    const { wrapProviderWithE2eeIfEnabled } = await freshModule();
    configStore["chess.sync.e2ee.enabled"] = true;

    await expect(wrapProviderWithE2eeIfEnabled(new FakeProvider())).rejects.toThrow(
      /chưa mở khoá/,
    );
  });

  test("returns a wrapper that actually encrypts content after a successful unlock", async () => {
    const { wrapProviderWithE2eeIfEnabled, commandE2eeUnlock } = await freshModule();
    configStore["chess.sync.e2ee.enabled"] = true;
    prompt.mockResolvedValueOnce("my-password");
    await commandE2eeUnlock();

    const fake = new FakeProvider();
    const result = await wrapProviderWithE2eeIfEnabled(fake);

    expect(await wrapsProviderWithEncryption(fake, result)).toBe(true);
  });

  test("the wrapper keeps the inner provider's name (per-provider state file path stays stable)", async () => {
    const { wrapProviderWithE2eeIfEnabled, commandE2eeUnlock } = await freshModule();
    configStore["chess.sync.e2ee.enabled"] = true;
    prompt.mockResolvedValueOnce("my-password");
    await commandE2eeUnlock();

    const result = await wrapProviderWithE2eeIfEnabled(new FakeProvider());

    expect(result.name).toBe("Fake");
  });
});

describe("commandE2eeUnlock", () => {
  test("refuses to prompt for a password when E2EE is not enabled in config", async () => {
    const { commandE2eeUnlock } = await freshModule();
    configStore["chess.sync.e2ee.enabled"] = false;

    await commandE2eeUnlock();

    expect(prompt).not.toHaveBeenCalled();
    expect(flashNotification.mock.calls[0][0]).toMatch(/Chưa bật/);
  });

  test("first unlock on a device creates and stores a local check value", async () => {
    const { commandE2eeUnlock } = await freshModule();
    configStore["chess.sync.e2ee.enabled"] = true;
    prompt.mockResolvedValueOnce("my-password");

    await commandE2eeUnlock();

    expect(clientStoreData["e2eeLocalCheckValue"]).toBeDefined();
    expect(flashNotification.mock.calls[0][0]).toMatch(/mở khoá/);
  });

  test("a later unlock with the SAME password (against an existing check value) succeeds", async () => {
    configStore["chess.sync.e2ee.enabled"] = true;
    // Lượt 1: tạo check value.
    const mod1 = await freshModule();
    prompt.mockResolvedValueOnce("my-password");
    await mod1.commandE2eeUnlock();

    // Lượt 2 (giả lập mở app lại -> module mới, nhưng clientStoreData vẫn còn).
    const mod2 = await freshModule();
    prompt.mockResolvedValueOnce("my-password");
    await mod2.commandE2eeUnlock();

    const fake = new FakeProvider();
    const result = await mod2.wrapProviderWithE2eeIfEnabled(fake);
    expect(await wrapsProviderWithEncryption(fake, result)).toBe(true);
    expect(flashNotification.mock.calls.at(-1)?.[0]).toMatch(/mở khoá/);
  });

  test("a later unlock with the WRONG password fails clearly and leaves the session locked", async () => {
    configStore["chess.sync.e2ee.enabled"] = true;
    const mod1 = await freshModule();
    prompt.mockResolvedValueOnce("my-password");
    await mod1.commandE2eeUnlock();

    const mod2 = await freshModule();
    prompt.mockResolvedValueOnce("wrong-password");
    await mod2.commandE2eeUnlock();

    expect(flashNotification.mock.calls.at(-1)?.[0]).toMatch(/Mở khoá thất bại/);
    await expect(mod2.wrapProviderWithE2eeIfEnabled(new FakeProvider())).rejects.toThrow(
      /chưa mở khoá/,
    );
  });

  test("cancelling the password prompt (empty) does nothing", async () => {
    const { commandE2eeUnlock } = await freshModule();
    configStore["chess.sync.e2ee.enabled"] = true;
    prompt.mockResolvedValueOnce("");

    await commandE2eeUnlock();

    expect(clientStoreData["e2eeLocalCheckValue"]).toBeUndefined();
    expect(flashNotification).not.toHaveBeenCalled();
  });
});

describe("commandE2eeLock", () => {
  test("locks the session again, so a subsequent sync requires unlocking first", async () => {
    const mod = await freshModule();
    configStore["chess.sync.e2ee.enabled"] = true;
    prompt.mockResolvedValueOnce("my-password");
    await mod.commandE2eeUnlock();
    await expect(mod.wrapProviderWithE2eeIfEnabled(new FakeProvider())).resolves.toBeDefined();

    await mod.commandE2eeLock();

    await expect(mod.wrapProviderWithE2eeIfEnabled(new FakeProvider())).rejects.toThrow(
      /chưa mở khoá/,
    );
  });
});
