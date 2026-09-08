import { beforeEach, describe, expect, test, vi } from "vitest";
import type { FileMeta } from "@silverbulletmd/silverbullet/type/index";
import { DropboxConflictError, type DropboxEntry } from "./dropbox_sync.ts";
import type { SpaceOps } from "./dropbox_bridge.ts";

vi.mock("./dropbox_sync.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./dropbox_sync.ts")>();
  return {
    ...actual,
    listFolderRecursive: vi.fn(),
    uploadFile: vi.fn(),
    downloadFile: vi.fn(),
    deleteFile: vi.fn(),
  };
});

const dropboxSyncMock = await import("./dropbox_sync.ts");
const { performSync, conflictPath, isUtf8Decodable } = await import("./dropbox_bridge.ts");

const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);

/** SpaceOps giả trong bộ nhớ — đủ để lái toàn bộ nhánh của performSync mà
 * không cần chạm tới syscall thật (không có runtime plug trong vitest). */
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

const deps = { appKey: "key", getTokens: vi.fn(), saveTokens: vi.fn() };

function remoteEntry(path: string, rev: string, deleted = false): DropboxEntry {
  return { path, rev, serverModified: "2026-01-01", deleted };
}

beforeEach(() => {
  vi.clearAllMocks();
});

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

describe("performSync", () => {
  test("uploads a brand-new local file (no prior state, no remote copy)", async () => {
    const space = new FakeSpace();
    space.put("new.md", "hello");
    vi.mocked(dropboxSyncMock.listFolderRecursive).mockResolvedValue([]);
    vi.mocked(dropboxSyncMock.uploadFile).mockResolvedValue({ rev: "rev1", serverModified: "s" });

    const report = await performSync(deps, "", space);

    expect(report.uploaded).toEqual(["new.md"]);
    expect(dropboxSyncMock.uploadFile).toHaveBeenCalledWith(
      deps,
      "/new.md",
      expect.anything(),
      { tag: "add" },
    );
  });

  test("downloads a brand-new remote file into an empty space", async () => {
    const space = new FakeSpace();
    vi.mocked(dropboxSyncMock.listFolderRecursive).mockResolvedValue([remoteEntry("new.md", "rev1")]);
    vi.mocked(dropboxSyncMock.downloadFile).mockResolvedValue({
      data: enc("from dropbox"),
      rev: "rev1",
      serverModified: "s",
    });

    const report = await performSync(deps, "", space);

    expect(report.downloaded).toEqual(["new.md"]);
    expect(dec(await space.readFile("new.md"))).toBe("from dropbox");
  });

  test("both sides changed since last sync -> writes a .conflict.md file and keeps local as the winner", async () => {
    const space = new FakeSpace();
    space.put("game.md", "local edit", 500);
    // Đồng bộ trước đã thấy path này ở mtime=100/rev=rev0 — cả hai đổi từ đó.
    space.put("_dropbox/sync-state.json", JSON.stringify({ "game.md": { localMtime: 100, remoteRev: "rev0" } }));

    vi.mocked(dropboxSyncMock.listFolderRecursive).mockResolvedValue([remoteEntry("game.md", "rev1")]);
    vi.mocked(dropboxSyncMock.downloadFile).mockResolvedValue({
      data: enc("remote edit"),
      rev: "rev1",
      serverModified: "s",
    });
    vi.mocked(dropboxSyncMock.uploadFile).mockResolvedValue({ rev: "rev2", serverModified: "s2" });

    const report = await performSync(deps, "", space);

    expect(report.conflicts).toEqual(["game.md"]);
    // Local giữ nguyên nội dung của chính nó...
    expect(dec(await space.readFile("game.md"))).toBe("local edit");
    // ...và local đã được đẩy đè lên Dropbox bằng update có kèm rev cũ (chống race).
    expect(dropboxSyncMock.uploadFile).toHaveBeenCalledWith(deps, "/game.md", enc("local edit"), {
      tag: "update",
      rev: "rev1",
    });
    // Nội dung remote bị thay thế phải được lưu lại đâu đó, không mất.
    const conflictFileName = [...space.files.keys()].find((k) => k.includes(".conflict-"));
    expect(conflictFileName).toBeDefined();
    expect(dec(await space.readFile(conflictFileName!))).toContain("remote edit");
  });

  test("remote deleted + local unchanged since last sync -> propagates the deletion locally", async () => {
    const space = new FakeSpace();
    space.put("gone.md", "old content", 100);
    space.put("_dropbox/sync-state.json", JSON.stringify({ "gone.md": { localMtime: 100, remoteRev: "rev0" } }));
    vi.mocked(dropboxSyncMock.listFolderRecursive).mockResolvedValue([]); // đã bị xoá trên Dropbox

    const report = await performSync(deps, "", space);

    expect(report.deletedLocal).toEqual(["gone.md"]);
    expect(space.files.has("gone.md")).toBe(false);
  });

  test("local deleted + remote unchanged since last sync -> propagates the deletion to Dropbox", async () => {
    const space = new FakeSpace();
    // Không put "gone.md" -> coi như người dùng đã xoá cục bộ.
    space.put("_dropbox/sync-state.json", JSON.stringify({ "gone.md": { localMtime: 100, remoteRev: "rev0" } }));
    vi.mocked(dropboxSyncMock.listFolderRecursive).mockResolvedValue([remoteEntry("gone.md", "rev0")]);

    const report = await performSync(deps, "", space);

    expect(report.deletedRemote).toEqual(["gone.md"]);
    expect(dropboxSyncMock.deleteFile).toHaveBeenCalledWith(deps, "/gone.md");
  });

  test("nothing changed on either side -> no network writes, state carried over unchanged", async () => {
    const space = new FakeSpace();
    space.put("stable.md", "same", 100);
    space.put(
      "_dropbox/sync-state.json",
      JSON.stringify({ "stable.md": { localMtime: 100, remoteRev: "rev0" } }),
    );
    vi.mocked(dropboxSyncMock.listFolderRecursive).mockResolvedValue([remoteEntry("stable.md", "rev0")]);

    const report = await performSync(deps, "", space);

    expect(report.uploaded).toEqual([]);
    expect(report.downloaded).toEqual([]);
    expect(dropboxSyncMock.uploadFile).not.toHaveBeenCalled();
    expect(dropboxSyncMock.downloadFile).not.toHaveBeenCalled();
    const newState = JSON.parse(dec(await space.readFile("_dropbox/sync-state.json")));
    expect(newState["stable.md"]).toEqual({ localMtime: 100, remoteRev: "rev0" });
  });

  test("a race reported by Dropbox as 409 is recorded as a conflict, not a fatal error", async () => {
    const space = new FakeSpace();
    space.put("racy.md", "edit", 999);
    vi.mocked(dropboxSyncMock.listFolderRecursive).mockResolvedValue([]);
    vi.mocked(dropboxSyncMock.uploadFile).mockRejectedValue(new DropboxConflictError("/racy.md"));

    const report = await performSync(deps, "", space);

    expect(report.conflicts).toEqual(["racy.md"]);
    expect(report.errors).toEqual([]);
  });

  test("an unrelated error for one file is recorded but does not abort the whole sync", async () => {
    const space = new FakeSpace();
    space.put("ok.md", "fine");
    space.put("bad.md", "broken");
    vi.mocked(dropboxSyncMock.listFolderRecursive).mockResolvedValue([]);
    vi.mocked(dropboxSyncMock.uploadFile).mockImplementation(async (_deps, path) => {
      if (path === "/bad.md") throw new Error("network boom");
      return { rev: "rev1", serverModified: "s" };
    });

    const report = await performSync(deps, "", space);

    expect(report.uploaded).toEqual(["ok.md"]);
    expect(report.errors).toEqual([{ path: "bad.md", error: "network boom" }]);
  });

  test("uses the configured sync folder as a path prefix for every Dropbox call", async () => {
    const space = new FakeSpace();
    space.put("x.md", "hi");
    vi.mocked(dropboxSyncMock.listFolderRecursive).mockResolvedValue([]);
    vi.mocked(dropboxSyncMock.uploadFile).mockResolvedValue({ rev: "r", serverModified: "s" });

    await performSync(deps, "ChessNote", space);

    expect(dropboxSyncMock.listFolderRecursive).toHaveBeenCalledWith(deps, "ChessNote");
    expect(dropboxSyncMock.uploadFile).toHaveBeenCalledWith(
      deps,
      "/ChessNote/x.md",
      expect.anything(),
      { tag: "add" },
    );
  });

  test("never treats its own sync-state file as a syncable path", async () => {
    const space = new FakeSpace();
    vi.mocked(dropboxSyncMock.listFolderRecursive).mockResolvedValue([]);

    await performSync(deps, "", space);

    expect(dropboxSyncMock.uploadFile).not.toHaveBeenCalled();
    expect(space.files.has("_dropbox/sync-state.json")).toBe(true);
  });
});
