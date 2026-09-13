import { beforeEach, describe, expect, test } from "vitest";
import type { FileMeta } from "@silverbulletmd/silverbullet/type/index";
import {
  diagnoseSync,
  performSync,
  conflictPath,
  isUtf8Decodable,
  summarizeSyncErrorDetails,
  type SpaceOps,
  type SyncReport,
} from "./sync_engine.ts";
import { RemoteConflictError, type RemoteFileEntry, type SyncProvider, type WriteMode } from "./sync_provider.ts";

const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);

/** SpaceOps giả trong bộ nhớ — đủ để lái toàn bộ nhánh của performSync mà
 * không cần chạm tới syscall thật (không có runtime plug trong vitest). */
class FakeSpace implements SpaceOps {
  files = new Map<string, { data: Uint8Array; lastModified: number }>();
  readOnlyPaths = new Set<string>();
  private clock = 1_000;

  put(path: string, content: string, mtime?: number) {
    this.files.set(path, { data: enc(content), lastModified: mtime ?? this.tick() });
  }
  /** Simulates a Fallthrough-served baked-in file (server-common/src/space/embed.rs) — perm: "ro" in space.listFiles(). */
  putReadOnly(path: string, content: string, mtime?: number) {
    this.put(path, content, mtime);
    this.readOnlyPaths.add(path);
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
      perm: this.readOnlyPaths.has(name) ? ("ro" as const) : ("rw" as const),
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

interface UploadCall {
  folder: string;
  path: string;
  data: Uint8Array;
  mode: WriteMode;
}

/** Provider giả tối giản — đủ để test thuật toán chung của `performSync`
 * (KHÔNG gắn với Dropbox/WebDAV cụ thể nào — xem `dropbox_provider.test.ts`
 * cho hành vi riêng của adapter Dropbox: path-prefix theo `folder`, mapping
 * DropboxConflictError -> RemoteConflictError). */
class FakeSyncProvider implements SyncProvider {
  readonly name: string;
  remoteFiles = new Map<string, { data: Uint8Array; rev: string; serverModified: string }>();

  constructor(name = "Fake") {
    this.name = name;
  }
  uploadCalls: UploadCall[] = [];
  deleteCalls: { folder: string; path: string }[] = [];
  listEntriesCalls: string[] = [];
  uploadErrorFor?: string;
  uploadConflictFor?: string;
  private revCounter = 0;

  seedRemote(path: string, content: string, rev: string, serverModified = "s") {
    this.remoteFiles.set(path, { data: enc(content), rev, serverModified });
  }

  async listEntries(folder: string): Promise<RemoteFileEntry[]> {
    this.listEntriesCalls.push(folder);
    return [...this.remoteFiles.entries()].map(([path, f]) => ({
      path,
      rev: f.rev,
      serverModified: f.serverModified,
      deleted: false,
    }));
  }

  async download(_folder: string, path: string) {
    const f = this.remoteFiles.get(path);
    if (!f) throw new Error(`remote not found: ${path}`);
    return { data: f.data, rev: f.rev, serverModified: f.serverModified };
  }

  async upload(folder: string, path: string, data: Uint8Array, mode: WriteMode) {
    this.uploadCalls.push({ folder, path, data, mode });
    if (this.uploadConflictFor === path) throw new RemoteConflictError(path);
    if (this.uploadErrorFor === path) throw new Error("network boom");
    const rev = `rev${++this.revCounter}`;
    const serverModified = `s${rev}`;
    this.remoteFiles.set(path, { data, rev, serverModified });
    return { rev, serverModified };
  }

  async delete(folder: string, path: string) {
    this.deleteCalls.push({ folder, path });
    this.remoteFiles.delete(path);
  }
}

describe("conflictPath", () => {
  test("inserts .conflict-<timestamp> before the last extension and always ends in .md", () => {
    const now = new Date("2026-09-08T05:30:15.123Z");
    expect(conflictPath("notes/game1.md", now)).toBe(
      "notes/game1.conflict-2026-09-08T05-30-15-123Z.md",
    );
    expect(conflictPath("notes/game1.pgn", now)).toBe(
      "notes/game1.conflict-2026-09-08T05-30-15-123Z.md",
    );
  });

  test("handles a path with no extension without swallowing a directory dot", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    expect(conflictPath("a.b/readme", now)).toBe("a.b/readme.conflict-2026-01-01T00-00-00-000Z.md");
  });
});

describe("isUtf8Decodable", () => {
  test("decodes valid UTF-8 text", () => {
    expect(isUtf8Decodable(enc("xin chào"))).toBe("xin chào");
  });
  test("returns null for invalid UTF-8 byte sequences", () => {
    expect(isUtf8Decodable(new Uint8Array([0xff, 0xfe, 0x00, 0xff]))).toBeNull();
  });
});

function emptyReport(overrides: Partial<SyncReport> = {}): SyncReport {
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

describe("summarizeSyncErrorDetails", () => {
  // Trước đây các thông báo chỉ hiện "1 lỗi" (đếm số lượng, xem
  // `summarizeSyncReport`) mà KHÔNG hiện lý do thật -- người dùng không tự
  // chẩn đoán được gì. Đây là hàm sửa đúng lỗ hổng đó.
  test("returns an empty string when there are no errors", () => {
    expect(summarizeSyncErrorDetails(emptyReport())).toBe("");
  });

  test("includes the path and the real error message for a single failure", () => {
    const report = emptyReport({ errors: [{ path: "notes/game2.md", error: "HTTP 404 — not found" }] });
    expect(summarizeSyncErrorDetails(report)).toBe("notes/game2.md: HTTP 404 — not found");
  });

  test("joins multiple failures with a separator", () => {
    const report = emptyReport({
      errors: [
        { path: "a.md", error: "boom-a" },
        { path: "b.md", error: "boom-b" },
      ],
    });
    expect(summarizeSyncErrorDetails(report)).toBe("a.md: boom-a | b.md: boom-b");
  });

  test("caps the number shown and notes how many more were omitted", () => {
    const report = emptyReport({
      errors: [
        { path: "a.md", error: "1" },
        { path: "b.md", error: "2" },
        { path: "c.md", error: "3" },
        { path: "d.md", error: "4" },
        { path: "e.md", error: "5" },
      ],
    });
    const result = summarizeSyncErrorDetails(report, 3);
    expect(result).toBe("a.md: 1 | b.md: 2 | c.md: 3 (và 2 lỗi khác)");
  });
});

describe("performSync (generic, over any SyncProvider)", () => {
  let provider: FakeSyncProvider;

  beforeEach(() => {
    provider = new FakeSyncProvider();
  });

  test("uploads a brand-new local file (no prior state, no remote copy)", async () => {
    const space = new FakeSpace();
    space.put("new.md", "hello");

    const report = await performSync(provider, "", space);

    expect(report.uploaded).toEqual(["new.md"]);
    expect(provider.uploadCalls).toEqual([
      { folder: "", path: "new.md", data: enc("hello"), mode: { tag: "add" } },
    ]);
  });

  test("ignores read-only (baked-in Library/Std) files entirely, even if a stray remote copy exists from a past bug", async () => {
    const space = new FakeSpace();
    space.putReadOnly("Library/Std/Config.md", "baked-in content");
    // Bản sao lỡ đồng bộ từ trước (đúng bug đã sửa) — vẫn còn trên remote.
    provider.seedRemote("Library/Std/Config.md", "stray old copy", "rev1");
    space.put(
      "_sync/fake-state.json",
      JSON.stringify({ "Library/Std/Config.md": { localMtime: 100, remoteRev: "rev0" } }),
    );

    const report = await performSync(provider, "", space);

    expect(report.uploaded).toEqual([]);
    expect(report.downloaded).toEqual([]);
    expect(report.conflicts).toEqual([]);
    expect(report.errors).toEqual([]);
    // Không bị ghi đè bằng bản remote cũ.
    expect(dec(await space.readFile("Library/Std/Config.md"))).toBe("baked-in content");
    // Không còn xuất hiện trong state đã lưu lại — tự dọn dần qua các lần chạy.
    const savedState = JSON.parse(dec(await space.readFile("_sync/fake-state.json")));
    expect(savedState["Library/Std/Config.md"]).toBeUndefined();
  });

  test("ignores anything under Library/ or Repositories/ by path prefix alone, even when perm isn't reported as \"ro\"", async () => {
    // Sự cố 2026-09-13: vài trang cụ thể dưới Library/ (không phải .plug.js)
    // vẫn bị coi là "xung đột" lặp lại dù không có file thật nào trên đĩa --
    // `perm` không nhất quán báo "ro" cho đúng những path này vì lý do chưa
    // xác định được dứt điểm. `space.put()` (không phải `putReadOnly()`) mô
    // phỏng đúng tình huống đó: file có mặt trong listFiles() với perm mặc
    // định "rw", CHỈ đường dẫn là dấu hiệu duy nhất cho biết nó là nội dung
    // nhúng cứng.
    const space = new FakeSpace();
    space.put("Library/Std/APIs/Action Button.md", "baked-in content");
    space.put("Repositories/some-repo/README.md", "baked-in content");
    provider.seedRemote("Library/Std/APIs/Action Button.md", "stray old copy", "rev1");
    provider.seedRemote("Repositories/some-repo/README.md", "stray old copy", "rev1");
    space.put(
      "_sync/fake-state.json",
      JSON.stringify({
        "Library/Std/APIs/Action Button.md": { localMtime: 100, remoteRev: "rev0" },
        "Repositories/some-repo/README.md": { localMtime: 100, remoteRev: "rev0" },
      }),
    );

    const report = await performSync(provider, "", space);

    expect(report).toMatchObject({
      uploaded: [],
      downloaded: [],
      conflicts: [],
      errors: [],
    });
    const savedState = JSON.parse(dec(await space.readFile("_sync/fake-state.json")));
    expect(savedState["Library/Std/APIs/Action Button.md"]).toBeUndefined();
    expect(savedState["Repositories/some-repo/README.md"]).toBeUndefined();
  });

  test("downloads a brand-new remote file into an empty space", async () => {
    const space = new FakeSpace();
    provider.seedRemote("new.md", "from remote", "rev1");

    const report = await performSync(provider, "", space);

    expect(report.downloaded).toEqual(["new.md"]);
    expect(dec(await space.readFile("new.md"))).toBe("from remote");
  });

  test("both sides changed since last sync -> writes a .conflict.md file and keeps local as the winner", async () => {
    const space = new FakeSpace();
    space.put("game.md", "local edit", 500);
    // Đồng bộ trước đã thấy path này ở mtime=100/rev=rev0 — cả hai đổi từ đó.
    space.put("_sync/fake-state.json", JSON.stringify({ "game.md": { localMtime: 100, remoteRev: "rev0" } }));
    provider.seedRemote("game.md", "remote edit", "rev1");

    const report = await performSync(provider, "", space);

    expect(report.conflicts).toEqual(["game.md"]);
    // Local giữ nguyên nội dung của chính nó...
    expect(dec(await space.readFile("game.md"))).toBe("local edit");
    // ...và local đã được đẩy đè lên remote bằng update có kèm rev cũ (chống race).
    expect(provider.uploadCalls).toEqual([
      { folder: "", path: "game.md", data: enc("local edit"), mode: { tag: "update", rev: "rev1" } },
    ]);
    // Nội dung remote bị thay thế phải được lưu lại đâu đó, không mất.
    const conflictFileName = [...space.files.keys()].find((k) => k.includes(".conflict-"));
    expect(conflictFileName).toBeDefined();
    expect(dec(await space.readFile(conflictFileName!))).toContain("remote edit");
  });

  test("an upload failure partway through the loop does not lose the state already checkpointed for earlier paths", async () => {
    const space = new FakeSpace();
    space.put("a.md", "a"); // xử lý trước, phải thành công
    space.put("bad.md", "b"); // ném lỗi
    space.put("c.md", "c"); // xử lý sau, phải thành công
    provider.uploadErrorFor = "bad.md";

    const stateWrites: string[] = [];
    const originalWriteFile = space.writeFile.bind(space);
    space.writeFile = async (path, data) => {
      const result = await originalWriteFile(path, data);
      if (path === "_sync/fake-state.json") stateWrites.push(dec(data));
      return result;
    };

    const report = await performSync(provider, "", space);

    expect(report.errors).toEqual([{ path: "bad.md", error: "network boom" }]);
    expect(report.uploaded.sort()).toEqual(["a.md", "c.md"]);

    // Phải có NHIỀU lần lưu, không chỉ 1 lần ở cuối -- đúng điểm bị mất trong
    // bug gốc (2026-09-12/13: nếu quá trình bị giết ngay sau khi "a.md" xong,
    // trước đây "a.md" cũng biến mất khỏi state vì saveState() chưa từng chạy).
    expect(stateWrites.length).toBeGreaterThan(1);
    const earliest = JSON.parse(stateWrites[0]);
    expect(earliest["a.md"]).toBeDefined();
    expect(earliest["bad.md"]).toBeUndefined();
    expect(earliest["c.md"]).toBeUndefined();

    const finalState = JSON.parse(stateWrites[stateWrites.length - 1]);
    expect(finalState["a.md"]).toBeDefined();
    expect(finalState["c.md"]).toBeDefined();
    expect(finalState["bad.md"]).toBeUndefined();
  });

  test("a path with prior good state that hits a write conflict race keeps its old prior state instead of being dropped", async () => {
    const space = new FakeSpace();
    space.put("racy.md", "local edit", 500);
    space.put(
      "_sync/fake-state.json",
      JSON.stringify({ "racy.md": { localMtime: 100, remoteRev: "rev0" } }),
    );
    provider.seedRemote("racy.md", "remote edit", "rev1");
    provider.uploadConflictFor = "racy.md";

    const report = await performSync(provider, "", space);

    expect(report.conflicts).toContain("racy.md");
    const savedState = JSON.parse(dec(await space.readFile("_sync/fake-state.json")));
    // racy.md bị lỗi race lúc ghi -- không có state mới, nhưng KHÔNG bị xoá
    // hẳn (trước đây nextState bắt đầu rỗng nên mọi lỗi đều làm mất state cũ).
    expect(savedState["racy.md"]).toEqual({ localMtime: 100, remoteRev: "rev0" });
  });

  test("both sides deleted since last sync -> drops the path from saved state", async () => {
    const space = new FakeSpace();
    space.put(
      "_sync/fake-state.json",
      JSON.stringify({ "gone-both.md": { localMtime: 100, remoteRev: "rev0" } }),
    );
    // Không put("gone-both.md", ...) và không seedRemote -- đã biến mất cả 2 bên.

    const report = await performSync(provider, "", space);

    expect(report).toMatchObject({
      uploaded: [],
      downloaded: [],
      deletedLocal: [],
      deletedRemote: [],
      conflicts: [],
      errors: [],
    });
    const savedState = JSON.parse(dec(await space.readFile("_sync/fake-state.json")));
    expect(savedState["gone-both.md"]).toBeUndefined();
  });

  test("a resolved conflict converges: the very next sync sees no further changes", async () => {
    const space = new FakeSpace();
    space.put("game.md", "local edit", 500);
    space.put("_sync/fake-state.json", JSON.stringify({ "game.md": { localMtime: 100, remoteRev: "rev0" } }));
    provider.seedRemote("game.md", "remote edit", "rev1");

    const first = await performSync(provider, "", space);
    expect(first.conflicts).toEqual(["game.md"]);
    const conflictFileName = [...space.files.keys()].find((k) => k.includes(".conflict-"))!;
    provider.uploadCalls = []; // reset call log to isolate the second run's behavior

    const second = await performSync(provider, "", space);

    expect(second.conflicts).toEqual([]);
    // The conflict-backup file itself is a legitimate brand-new local file as
    // of this second run (never synced before) -- it SHOULD get uploaded once,
    // same as any other new page. What must NOT happen is "game.md" itself
    // showing up again as changed/uploaded/conflicting.
    expect(second.uploaded).toEqual([conflictFileName]);
    expect(second.downloaded).toEqual([]);
    expect(second.errors).toEqual([]);
    expect(provider.uploadCalls.map((c) => c.path)).toEqual([conflictFileName]);
  });

  test("remote deleted + local unchanged since last sync -> propagates the deletion locally", async () => {
    const space = new FakeSpace();
    space.put("gone.md", "old content", 100);
    space.put("_sync/fake-state.json", JSON.stringify({ "gone.md": { localMtime: 100, remoteRev: "rev0" } }));
    // Không seed remote -> đã bị xoá trên remote.

    const report = await performSync(provider, "", space);

    expect(report.deletedLocal).toEqual(["gone.md"]);
    expect(space.files.has("gone.md")).toBe(false);
  });

  test("local deleted + remote unchanged since last sync -> propagates the deletion to remote", async () => {
    const space = new FakeSpace();
    // Không put "gone.md" -> coi như người dùng đã xoá cục bộ.
    space.put("_sync/fake-state.json", JSON.stringify({ "gone.md": { localMtime: 100, remoteRev: "rev0" } }));
    provider.seedRemote("gone.md", "still there", "rev0");

    const report = await performSync(provider, "", space);

    expect(report.deletedRemote).toEqual(["gone.md"]);
    expect(provider.deleteCalls).toEqual([{ folder: "", path: "gone.md" }]);
  });

  test("nothing changed on either side -> no network writes, state carried over unchanged", async () => {
    const space = new FakeSpace();
    space.put("stable.md", "same", 100);
    space.put(
      "_sync/fake-state.json",
      JSON.stringify({ "stable.md": { localMtime: 100, remoteRev: "rev0" } }),
    );
    provider.seedRemote("stable.md", "same", "rev0");

    const report = await performSync(provider, "", space);

    expect(report.uploaded).toEqual([]);
    expect(report.downloaded).toEqual([]);
    expect(provider.uploadCalls).toEqual([]);
    const newState = JSON.parse(dec(await space.readFile("_sync/fake-state.json")));
    expect(newState["stable.md"]).toEqual({ localMtime: 100, remoteRev: "rev0" });
  });

  test("a race reported by the provider (RemoteConflictError) is recorded as a conflict, not a fatal error", async () => {
    const space = new FakeSpace();
    space.put("racy.md", "edit", 999);
    provider.uploadConflictFor = "racy.md";

    const report = await performSync(provider, "", space);

    expect(report.conflicts).toEqual(["racy.md"]);
    expect(report.errors).toEqual([]);
  });

  test("an unrelated error for one file is recorded but does not abort the whole sync", async () => {
    const space = new FakeSpace();
    space.put("ok.md", "fine");
    space.put("bad.md", "broken");
    provider.uploadErrorFor = "bad.md";

    const report = await performSync(provider, "", space);

    expect(report.uploaded).toEqual(["ok.md"]);
    expect(report.errors).toEqual([{ path: "bad.md", error: "network boom" }]);
  });

  test("passes the configured sync folder through to every provider call unchanged", async () => {
    const space = new FakeSpace();
    space.put("x.md", "hi");

    await performSync(provider, "ChessNote", space);

    expect(provider.listEntriesCalls).toEqual(["ChessNote"]);
    expect(provider.uploadCalls).toEqual([
      { folder: "ChessNote", path: "x.md", data: enc("hi"), mode: { tag: "add" } },
    ]);
  });

  test("never treats its own sync-state file as a syncable path", async () => {
    const space = new FakeSpace();

    await performSync(provider, "", space);

    expect(provider.uploadCalls).toEqual([]);
    expect(space.files.has("_sync/fake-state.json")).toBe(true);
  });
});

describe("performSync state file path (multi-provider isolation)", () => {
  // Quan trọng khi Dropbox + WebDAV cùng cấu hình trên 1 Space: mỗi provider
  // phải ghi state vào file riêng, không thì provider này sẽ ghi đè tracking
  // của provider kia và tính sai localChanged/remoteChanged.
  test("a provider named 'Dropbox' keeps the legacy _dropbox/sync-state.json path", async () => {
    const space = new FakeSpace();
    const dropbox = new FakeSyncProvider("Dropbox");

    await performSync(dropbox, "", space);

    expect(space.files.has("_dropbox/sync-state.json")).toBe(true);
    expect(space.files.has("_sync/dropbox-state.json")).toBe(false);
  });

  test("a differently-named provider gets its own _sync/<name>-state.json path", async () => {
    const space = new FakeSpace();
    const webdav = new FakeSyncProvider("WebDAV");

    await performSync(webdav, "", space);

    expect(space.files.has("_sync/webdav-state.json")).toBe(true);
    expect(space.files.has("_dropbox/sync-state.json")).toBe(false);
  });

  test("Dropbox and WebDAV sync-state files never collide, so tracking two providers on the same Space is safe", async () => {
    const space = new FakeSpace();
    space.put("shared.md", "content");
    const dropbox = new FakeSyncProvider("Dropbox");
    const webdav = new FakeSyncProvider("WebDAV");

    await performSync(dropbox, "", space);
    await performSync(webdav, "", space);

    expect(space.files.has("_dropbox/sync-state.json")).toBe(true);
    expect(space.files.has("_sync/webdav-state.json")).toBe(true);
    const dropboxState = JSON.parse(dec(await space.readFile("_dropbox/sync-state.json")));
    const webdavState = JSON.parse(dec(await space.readFile("_sync/webdav-state.json")));
    expect(dropboxState["shared.md"]).toBeDefined();
    expect(webdavState["shared.md"]).toBeDefined();
  });
});

describe("diagnoseSync (read-only dry run)", () => {
  let provider: FakeSyncProvider;

  beforeEach(() => {
    provider = new FakeSyncProvider();
  });

  test("reports a genuine two-sided conflict without writing anything", async () => {
    const space = new FakeSpace();
    space.put("game.md", "local edit", 500);
    space.put("_sync/fake-state.json", JSON.stringify({ "game.md": { localMtime: 100, remoteRev: "rev0" } }));
    provider.seedRemote("game.md", "remote edit", "rev1");

    const diffs = await diagnoseSync(provider, "", space);

    expect(diffs).toEqual([
      { path: "game.md", localMtime: 500, priorLocalMtime: 100, remoteRev: "rev1", priorRemoteRev: "rev0" },
    ]);
    // Không ghi gì cả: không có file .conflict-*, không có lời gọi upload/download.
    expect([...space.files.keys()]).toEqual(["game.md", "_sync/fake-state.json"]);
    expect(provider.uploadCalls).toEqual([]);
  });

  test("reports nothing when nothing has changed on either side", async () => {
    const space = new FakeSpace();
    space.put("game.md", "same", 100);
    space.put("_sync/fake-state.json", JSON.stringify({ "game.md": { localMtime: 100, remoteRev: "rev0" } }));
    provider.seedRemote("game.md", "same", "rev0");

    expect(await diagnoseSync(provider, "", space)).toEqual([]);
  });

  test("ignores read-only baked-in files, same as performSync", async () => {
    const space = new FakeSpace();
    space.putReadOnly("Library/Std/Config.md", "baked-in", 500);
    provider.seedRemote("Library/Std/Config.md", "stray old copy", "rev1");
    space.put(
      "_sync/fake-state.json",
      JSON.stringify({ "Library/Std/Config.md": { localMtime: 100, remoteRev: "rev0" } }),
    );

    expect(await diagnoseSync(provider, "", space)).toEqual([]);
  });
});
