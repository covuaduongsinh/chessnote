// `webdav_bridge.ts` -> `push_trigger.ts` -> `auto_trigger.ts` ->
// `webdav_bridge.ts` là 1 import cycle THẬT (webdav_bridge gọi
// notifyCredentialsChanged sau login/logout; push_trigger gọi
// runAllConfiguredSyncs khi nhận tín hiệu push; auto_trigger gọi
// runWebDavSync/webdavStatus của webdav_bridge). ESM xử lý cycle kiểu này
// đúng miễn mọi chỗ dùng đều nằm TRONG thân hàm (gọi muộn), không phải ở top
// level lúc module evaluate — đúng thiết kế ở đây, nhưng đáng có 1 test thật
// import CẢ CHUỖI KHÔNG MOCK (chỉ mock syscalls) để xác nhận không có
// "Cannot access 'X' before initialization" hay export `undefined` nào, thay
// vì chỉ tin vào lý thuyết.
import { beforeEach, describe, expect, test, vi } from "vitest";

const configStore: Record<string, unknown> = {};
const clientStoreData: Record<string, unknown> = {};

vi.mock("@silverbulletmd/silverbullet/syscalls", () => ({
  editor: {
    flashNotification: vi.fn(),
    prompt: vi.fn(),
    confirm: vi.fn().mockResolvedValue(true),
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
  space: {
    listFiles: vi.fn().mockResolvedValue([]),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    deleteFile: vi.fn(),
  },
}));

beforeEach(() => {
  for (const k of Object.keys(configStore)) delete configStore[k];
  for (const k of Object.keys(clientStoreData)) delete clientStoreData[k];
});

describe("webdav_bridge <-> push_trigger <-> auto_trigger import cycle", () => {
  test("all three modules load together without a 'before initialization' error, and every export is defined", async () => {
    const webdavBridge = await import("./webdav_bridge.ts");
    const pushTrigger = await import("./push_trigger.ts");
    const autoTrigger = await import("./auto_trigger.ts");

    for (const [name, mod] of Object.entries({
      webdavBridge,
      pushTrigger,
      autoTrigger,
    })) {
      for (const [exportName, value] of Object.entries(mod)) {
        expect(value, `${name}.${exportName} phải không undefined sau khi load cycle`).toBeDefined();
      }
    }
  });

  test("commandWebDavLogin (which calls notifyCredentialsChanged into the cycle) runs end-to-end without throwing", async () => {
    const { commandWebDavLogin } = await import("./webdav_bridge.ts");
    const { editor } = await import("@silverbulletmd/silverbullet/syscalls");
    configStore["chess.webdav.url"] = "https://mycloud.example.com/";
    vi.mocked(editor.prompt).mockResolvedValueOnce("alice").mockResolvedValueOnce("s3cret");

    await expect(commandWebDavLogin()).resolves.toBeUndefined();
    expect(clientStoreData["webdavCredentials"]).toEqual({
      baseUrl: "https://mycloud.example.com", // getWebDavConfig() bỏ "/" cuối
      username: "alice",
      password: "s3cret",
    });
  });
});
