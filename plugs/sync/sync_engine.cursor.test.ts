// Test riêng cho cơ chế cursor/delta (Giai đoạn 2.1, 2026-09-13) --
// `resolveRemoteEntries` (private trong sync_engine.ts) merge delta vào bản
// cache remote đã lưu để tái tạo ĐÚNG trạng thái remote đầy đủ, KHÔNG được để
// 1 file không đổi (không xuất hiện trong delta) bị hiểu nhầm là "đã bị xoá
// trên remote" -- đây là lớp test kiểm chứng đúng rủi ro mất dữ liệu nghiêm
// trọng nhất của thay đổi này, tách khỏi `sync_engine.test.ts` (test thuật
// toán 4-case chung, không quan tâm hiệu năng liệt kê remote) để dễ đọc.
import { describe, expect, test } from "vitest";
import type { FileMeta } from "@silverbulletmd/silverbullet/type/index";
import { performSync, type SpaceOps } from "./sync_engine.ts";
import type { ListEntriesResult, RemoteFileEntry, SyncProvider, WriteMode } from "./sync_provider.ts";

const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);

class FakeSpace implements SpaceOps {
  files = new Map<string, { data: Uint8Array; lastModified: number }>();
  private clock = 1_000;

  put(path: string, content: string, mtime?: number) {
    this.files.set(path, { data: enc(content), lastModified: mtime ?? this.tick() });
  }
  tick() {
    return (this.clock += 1);
  }
  async listFiles(): Promise<FileMeta[]> {
    return [...this.files.entries()].map(([name, f]) => ({
      name,
      created: f.lastModified,
      lastModified: f.lastModified,
      contentType: "text/markdown",
      size: f.data.byteLength,
      perm: "rw" as const,
    }));
  }
  async readFile(path: string): Promise<Uint8Array> {
    const f = this.files.get(path);
    if (!f) throw new Error(`not found: ${path}`);
    return f.data;
  }
  async writeFile(path: string, data: Uint8Array): Promise<FileMeta> {
    const lastModified = this.tick();
    this.files.set(path, { data, lastModified });
    return { name: path, created: lastModified, lastModified, contentType: "text/markdown", size: data.byteLength, perm: "rw" };
  }
  async deleteFile(path: string): Promise<void> {
    this.files.delete(path);
  }
}

/** Provider giả CÓ hỗ trợ cursor/delta -- mỗi lần gọi `listEntries` lấy đúng
 * kịch bản (full hoặc delta) đã sắp sẵn trong `responses`, theo thứ tự gọi. */
class CursorSyncProvider implements SyncProvider {
  readonly name = "Fake";
  remoteFiles = new Map<string, { data: Uint8Array; rev: string; serverModified: string }>();
  responses: ListEntriesResult[] = [];
  listEntriesCalls: (string | undefined)[] = [];
  uploadCalls: { path: string; data: Uint8Array }[] = [];
  deleteCalls: string[] = [];

  seedRemote(path: string, content: string, rev: string) {
    this.remoteFiles.set(path, { data: enc(content), rev, serverModified: "s" });
  }

  async listEntries(_folder: string, priorCursor?: string): Promise<ListEntriesResult> {
    this.listEntriesCalls.push(priorCursor);
    const next = this.responses.shift();
    if (!next) throw new Error("no more scripted listEntries responses");
    return next;
  }

  async download(_folder: string, path: string) {
    const f = this.remoteFiles.get(path);
    if (!f) throw new Error(`remote not found: ${path}`);
    return { data: f.data, rev: f.rev, serverModified: f.serverModified };
  }

  async upload(_folder: string, path: string, data: Uint8Array, _mode: WriteMode) {
    this.uploadCalls.push({ path, data });
    const rev = `rev-${this.uploadCalls.length}`;
    this.remoteFiles.set(path, { data, rev, serverModified: "s" });
    return { rev, serverModified: "s" };
  }

  async delete(_folder: string, path: string) {
    this.deleteCalls.push(path);
    this.remoteFiles.delete(path);
  }
}

function entry(path: string, rev: string, deleted = false): RemoteFileEntry {
  return { path, rev, serverModified: "s", deleted };
}

describe("performSync cursor/delta merge (Giai đoạn 2.1)", () => {
  test("first sync (no cursor cache yet) does a full listing and persists the cursor cache", async () => {
    const space = new FakeSpace();
    space.put("a.md", "hello");
    const provider = new CursorSyncProvider();
    provider.responses = [{ entries: [], cursor: "cursor-1", full: true }];

    await performSync(provider, "", space);

    expect(provider.listEntriesCalls).toEqual([undefined]); // chưa có cursor cache -> gọi không kèm cursor
    expect(space.files.has("_dropbox/sync-cursor.json")).toBe(false); // provider tên "Fake" -> _sync/fake-cursor.json
    expect(space.files.has("_sync/fake-cursor.json")).toBe(true);
    const cache = JSON.parse(dec(await space.readFile("_sync/fake-cursor.json")));
    expect(cache.cursor).toBe("cursor-1");
  });

  test("second sync reuses the stored cursor and merges a delta instead of re-fetching everything", async () => {
    const space = new FakeSpace();
    space.put("unchanged.md", "same forever", 100);
    const provider = new CursorSyncProvider();
    provider.seedRemote("unchanged.md", "same forever", "rev0");
    // Lần 1: full listing, thấy unchanged.md đã tồn tại từ trước ở cả 2 bên
    // nhưng CHƯA có `prior` state -> thuật toán coi "chưa từng đồng bộ" và
    // đẩy local lên (đúng hành vi hiện có, không liên quan tới cursor/delta) --
    // quan trọng là nó ghi lại `prior` cho lần sau.
    provider.responses = [
      { entries: [entry("unchanged.md", "rev0")], cursor: "cursor-1", full: true },
    ];
    const first = await performSync(provider, "", space);
    expect(first.uploaded).toEqual(["unchanged.md"]);
    expect(first.downloaded).toEqual([]);

    // Lần 2: chỉ trả delta RỖNG (không gì đổi) -- unchanged.md KHÔNG xuất hiện
    // trong entries lần này. Đây chính là điểm rủi ro: nếu code coi thẳng
    // entries của lần gọi này là "toàn bộ remote", unchanged.md sẽ biến mất
    // khỏi remoteMap và bị coi là "đã xoá trên remote" -> xoá nhầm ở local.
    provider.responses = [{ entries: [], cursor: "cursor-2", full: false }];
    const second = await performSync(provider, "", space);

    expect(provider.listEntriesCalls).toEqual([undefined, "cursor-1"]); // lần 2 dùng đúng cursor đã lưu
    expect(second.deletedLocal).toEqual([]); // KHÔNG bị xoá nhầm
    expect(space.files.has("unchanged.md")).toBe(true); // vẫn còn nguyên
    expect(second.errors).toEqual([]);
  });

  test("a real deletion reported in the delta still propagates correctly (merge doesn't hide real deletions)", async () => {
    const space = new FakeSpace();
    space.put("keep.md", "keep me", 100);
    space.put("gone.md", "will be deleted remotely", 100);
    const provider = new CursorSyncProvider();
    provider.seedRemote("keep.md", "keep me", "rev0");
    provider.seedRemote("gone.md", "will be deleted remotely", "rev0");
    provider.responses = [
      {
        entries: [entry("keep.md", "rev0"), entry("gone.md", "rev0")],
        cursor: "cursor-1",
        full: true,
      },
    ];
    await performSync(provider, "", space);

    // Lần 2: delta báo "gone.md" đã bị xoá trên remote -- "keep.md" không xuất
    // hiện (không đổi) và KHÔNG được coi là xoá.
    provider.responses = [{ entries: [entry("gone.md", "", true)], cursor: "cursor-2", full: false }];
    const second = await performSync(provider, "", space);

    expect(second.deletedLocal).toEqual(["gone.md"]);
    expect(space.files.has("gone.md")).toBe(false);
    expect(space.files.has("keep.md")).toBe(true); // không bị ảnh hưởng
  });

  test("a delta update (existing file's rev changed) is downloaded even though it wasn't in a fresh full listing", async () => {
    const space = new FakeSpace();
    space.put("doc.md", "v1", 100);
    const provider = new CursorSyncProvider();
    provider.seedRemote("doc.md", "v1", "rev0");
    provider.responses = [{ entries: [entry("doc.md", "rev0")], cursor: "cursor-1", full: true }];
    await performSync(provider, "", space);

    provider.seedRemote("doc.md", "v2 from another device", "rev1");
    provider.responses = [{ entries: [entry("doc.md", "rev1")], cursor: "cursor-2", full: false }];
    const second = await performSync(provider, "", space);

    expect(second.downloaded).toEqual(["doc.md"]);
    expect(dec(await space.readFile("doc.md"))).toBe("v2 from another device");
  });

  test("the cursor cache file itself is never treated as a syncable path", async () => {
    const space = new FakeSpace();
    const provider = new CursorSyncProvider();
    provider.responses = [{ entries: [], cursor: "cursor-1", full: true }];
    await performSync(provider, "", space);

    provider.responses = [{ entries: [], cursor: "cursor-2", full: false }];
    const second = await performSync(provider, "", space);

    expect(provider.uploadCalls.map((c) => c.path)).not.toContain("_sync/fake-cursor.json");
    expect(second.uploaded).toEqual([]);
    expect(second.errors).toEqual([]);
  });

  test("when the provider reports full:true again mid-stream (e.g. its own reset fallback), the merge simply replaces the cache instead of accumulating stale entries", async () => {
    const space = new FakeSpace();
    space.put("old.md", "will vanish from remote before reset", 100);
    const provider = new CursorSyncProvider();
    provider.seedRemote("old.md", "will vanish from remote before reset", "rev0");
    provider.responses = [{ entries: [entry("old.md", "rev0")], cursor: "cursor-1", full: true }];
    await performSync(provider, "", space);

    // Cursor "hết hạn" phía provider -- nó tự fallback nội bộ và trả full:true
    // với 1 bức tranh remote HOÀN TOÀN MỚI, không còn "old.md" (đã bị xoá thật
    // sự trên remote trong lúc cursor không còn hợp lệ để biết qua delta).
    provider.responses = [{ entries: [], cursor: "cursor-fresh", full: true }];
    const second = await performSync(provider, "", space);

    expect(second.deletedLocal).toEqual(["old.md"]); // full mới thay thế hoàn toàn cache cũ
    expect(space.files.has("old.md")).toBe(false);
  });
});
