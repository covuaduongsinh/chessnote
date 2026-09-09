import { beforeEach, describe, expect, test, vi } from "vitest";
import { DropboxConflictError } from "./dropbox_sync.ts";
import { RemoteConflictError } from "./sync_provider.ts";

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
const { DropboxSyncProvider } = await import("./dropbox_provider.ts");

const enc = (s: string) => new TextEncoder().encode(s);
const deps = { appKey: "key", getTokens: vi.fn(), saveTokens: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DropboxSyncProvider", () => {
  test("listEntries forwards the folder as-is to listFolderRecursive", async () => {
    vi.mocked(dropboxSyncMock.listFolderRecursive).mockResolvedValue([]);
    const provider = new DropboxSyncProvider(deps);

    await provider.listEntries("ChessNote");

    expect(dropboxSyncMock.listFolderRecursive).toHaveBeenCalledWith(deps, "ChessNote");
  });

  test("upload prefixes the path with the sync folder before calling the Dropbox API", async () => {
    vi.mocked(dropboxSyncMock.uploadFile).mockResolvedValue({ rev: "r", serverModified: "s" });
    const provider = new DropboxSyncProvider(deps);

    await provider.upload("ChessNote", "x.md", enc("hi"), { tag: "add" });

    expect(dropboxSyncMock.uploadFile).toHaveBeenCalledWith(deps, "/ChessNote/x.md", enc("hi"), {
      tag: "add",
    });
  });

  test("upload with an empty folder prefixes with just a leading slash", async () => {
    vi.mocked(dropboxSyncMock.uploadFile).mockResolvedValue({ rev: "r", serverModified: "s" });
    const provider = new DropboxSyncProvider(deps);

    await provider.upload("", "new.md", enc("hello"), { tag: "add" });

    expect(dropboxSyncMock.uploadFile).toHaveBeenCalledWith(deps, "/new.md", enc("hello"), {
      tag: "add",
    });
  });

  test("download prefixes the path with the sync folder", async () => {
    vi.mocked(dropboxSyncMock.downloadFile).mockResolvedValue({
      data: enc("hi"),
      rev: "r",
      serverModified: "s",
    });
    const provider = new DropboxSyncProvider(deps);

    await provider.download("ChessNote", "x.md");

    expect(dropboxSyncMock.downloadFile).toHaveBeenCalledWith(deps, "/ChessNote/x.md");
  });

  test("delete prefixes the path with the sync folder", async () => {
    const provider = new DropboxSyncProvider(deps);

    await provider.delete("ChessNote", "gone.md");

    expect(dropboxSyncMock.deleteFile).toHaveBeenCalledWith(deps, "/ChessNote/gone.md");
  });

  test("maps a Dropbox 409 (DropboxConflictError) to the generic RemoteConflictError", async () => {
    vi.mocked(dropboxSyncMock.uploadFile).mockRejectedValue(new DropboxConflictError("/racy.md"));
    const provider = new DropboxSyncProvider(deps);

    await expect(
      provider.upload("", "racy.md", enc("edit"), { tag: "add" }),
    ).rejects.toBeInstanceOf(RemoteConflictError);
  });

  test("lets an unrelated upload error pass through unchanged", async () => {
    vi.mocked(dropboxSyncMock.uploadFile).mockRejectedValue(new Error("network boom"));
    const provider = new DropboxSyncProvider(deps);

    await expect(
      provider.upload("", "bad.md", enc("x"), { tag: "add" }),
    ).rejects.toThrow("network boom");
  });
});
