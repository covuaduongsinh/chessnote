import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AlreadyExistsCollectionError,
  ConflictError,
  NotFoundError,
  PreconditionFailedError,
  deleteFileEntry,
  listRecursive,
  makeCollection,
  readFileEntry,
  writeFileEntry,
} from "./storage.ts";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "chessnote-cloud-test-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("writeFileEntry / readFileEntry", () => {
  test("writes a new file with mode add, then reads back the same content", async () => {
    await writeFileEntry(root, "a.md", Buffer.from("hello"), { tag: "add" });
    const result = await readFileEntry(root, "a.md");
    expect(result.data.toString("utf8")).toBe("hello");
  });

  test("mode add fails with PreconditionFailedError if the file already exists", async () => {
    await writeFileEntry(root, "a.md", Buffer.from("v1"), { tag: "add" });
    await expect(writeFileEntry(root, "a.md", Buffer.from("v2"), { tag: "add" })).rejects.toBeInstanceOf(
      PreconditionFailedError,
    );
  });

  test("mode update succeeds when ifMatch matches the current ETag", async () => {
    const first = await writeFileEntry(root, "a.md", Buffer.from("v1"), { tag: "add" });
    await writeFileEntry(root, "a.md", Buffer.from("v2"), { tag: "update", ifMatch: first.etag });
    const result = await readFileEntry(root, "a.md");
    expect(result.data.toString("utf8")).toBe("v2");
  });

  test("mode update fails with PreconditionFailedError when ifMatch is stale (concurrent write)", async () => {
    const first = await writeFileEntry(root, "a.md", Buffer.from("v1"), { tag: "add" });
    await writeFileEntry(root, "a.md", Buffer.from("v2-by-someone-else"), {
      tag: "update",
      ifMatch: first.etag,
    });
    await expect(
      writeFileEntry(root, "a.md", Buffer.from("v3"), { tag: "update", ifMatch: first.etag }),
    ).rejects.toBeInstanceOf(PreconditionFailedError);
  });

  test("mode overwrite always succeeds regardless of current state", async () => {
    await writeFileEntry(root, "a.md", Buffer.from("v1"), { tag: "add" });
    await writeFileEntry(root, "a.md", Buffer.from("v2"), { tag: "overwrite" });
    const result = await readFileEntry(root, "a.md");
    expect(result.data.toString("utf8")).toBe("v2");
  });

  test("writing into a missing parent directory throws ConflictError (RFC 4918 semantics, no implicit mkdir)", async () => {
    await expect(
      writeFileEntry(root, "notes/deep/a.md", Buffer.from("x"), { tag: "add" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  test("reading a non-existent file throws NotFoundError", async () => {
    await expect(readFileEntry(root, "missing.md")).rejects.toBeInstanceOf(NotFoundError);
  });

  test("ETag reflects content, not just presence -- changing content changes the ETag", async () => {
    const a = await writeFileEntry(root, "a.md", Buffer.from("v1"), { tag: "add" });
    const b = await writeFileEntry(root, "a.md", Buffer.from("v2"), { tag: "overwrite" });
    expect(a.etag).not.toBe(b.etag);
  });

  test("rejects a path that attempts to escape the user root via '..'", async () => {
    await expect(
      writeFileEntry(root, "../outside.md", Buffer.from("x"), { tag: "overwrite" }),
    ).rejects.toThrow(/path traversal|không hợp lệ/i);
  });
});

describe("deleteFileEntry", () => {
  test("deletes an existing file", async () => {
    await writeFileEntry(root, "a.md", Buffer.from("x"), { tag: "add" });
    await deleteFileEntry(root, "a.md");
    await expect(readFileEntry(root, "a.md")).rejects.toBeInstanceOf(NotFoundError);
  });

  test("deleting a missing file throws NotFoundError (caller maps this to an idempotent 404)", async () => {
    await expect(deleteFileEntry(root, "missing.md")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("makeCollection", () => {
  test("creates a new directory", async () => {
    await makeCollection(root, "notes");
    await writeFileEntry(root, "notes/a.md", Buffer.from("x"), { tag: "add" });
    const result = await readFileEntry(root, "notes/a.md");
    expect(result.data.toString("utf8")).toBe("x");
  });

  test("throws AlreadyExistsCollectionError if the directory already exists", async () => {
    await makeCollection(root, "notes");
    await expect(makeCollection(root, "notes")).rejects.toBeInstanceOf(AlreadyExistsCollectionError);
  });
});

describe("listRecursive", () => {
  test("lists files at the root and in nested subdirectories", async () => {
    await writeFileEntry(root, "top.md", Buffer.from("a"), { tag: "add" });
    await makeCollection(root, "notes");
    await writeFileEntry(root, "notes/deep.md", Buffer.from("b"), { tag: "add" });

    const entries = await listRecursive(root, "");
    const filePaths = entries.filter((e) => !e.isDirectory).map((e) => e.path).sort();
    expect(filePaths).toEqual(["notes/deep.md", "top.md"]);
    expect(entries.some((e) => e.isDirectory && e.path === "notes")).toBe(true);
  });

  test("returns an empty list for a folder that does not exist yet (first-ever sync)", async () => {
    const entries = await listRecursive(root, "never-created");
    expect(entries).toEqual([]);
  });

  test("each file entry carries a non-empty ETag and HTTP-formatted last-modified", async () => {
    await writeFileEntry(root, "a.md", Buffer.from("x"), { tag: "add" });
    const [entry] = await listRecursive(root, "");
    expect(entry.etag).toMatch(/^[0-9a-f]{40}$/); // sha1 hex
    expect(Number.isNaN(Date.parse(entry.mtimeHttp))).toBe(false);
  });
});
