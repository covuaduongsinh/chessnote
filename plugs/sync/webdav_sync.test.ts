import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  WebDavConflictError,
  deleteFile,
  downloadFile,
  listEntriesRecursive,
  uploadFile,
  type WebDavAuth,
} from "./webdav_sync.ts";

const auth: WebDavAuth = {
  baseUrl: "https://cloud.example.com/remote.php/dav/files/user/",
  username: "user",
  password: "pw",
};

function xmlResponse(status: number, body: string) {
  return new Response(body, { status, headers: { "content-type": "application/xml" } });
}

beforeEach(() => {
  vi.stubGlobal("nativeFetch", vi.fn());
});

describe("listEntriesRecursive", () => {
  test("parses a multistatus response, skips collections, and strips the base path", async () => {
    const multistatus = `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:">
  <d:response>
    <d:href>/remote.php/dav/files/user/ChessNote/</d:href>
    <d:propstat><d:prop>
      <d:getetag>"folder-etag"</d:getetag>
      <d:resourcetype><d:collection/></d:resourcetype>
    </d:prop></d:propstat>
  </d:response>
  <d:response>
    <d:href>/remote.php/dav/files/user/ChessNote/game1.md</d:href>
    <d:propstat><d:prop>
      <d:getetag>"etag1"</d:getetag>
      <d:getlastmodified>Mon, 01 Sep 2026 00:00:00 GMT</d:getlastmodified>
      <d:resourcetype/>
    </d:prop></d:propstat>
  </d:response>
  <d:response>
    <d:href>/remote.php/dav/files/user/ChessNote/notes/game%202.md</d:href>
    <d:propstat><d:prop>
      <d:getetag>W/"etag2"</d:getetag>
      <d:resourcetype/>
    </d:prop></d:propstat>
  </d:response>
</d:multistatus>`;
    (nativeFetch as any).mockResolvedValueOnce(xmlResponse(207, multistatus));

    const entries = await listEntriesRecursive(auth, "ChessNote");

    expect(entries).toEqual([
      { path: "game1.md", rev: "etag1", serverModified: "Mon, 01 Sep 2026 00:00:00 GMT", deleted: false },
      { path: "notes/game 2.md", rev: "etag2", serverModified: "", deleted: false },
    ]);
  });

  test("sends PROPFIND with Depth: infinity and Basic Auth", async () => {
    (nativeFetch as any).mockResolvedValueOnce(
      xmlResponse(207, `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"></d:multistatus>`),
    );

    await listEntriesRecursive(auth, "ChessNote");

    const [url, init] = (nativeFetch as any).mock.calls[0];
    expect(url).toBe("https://cloud.example.com/remote.php/dav/files/user/ChessNote/");
    expect(init.method).toBe("PROPFIND");
    expect(init.headers.Depth).toBe("infinity");
    expect(init.headers.Authorization).toBe("Basic " + btoa("user:pw"));
  });

  test("404 (folder not yet created on the server) returns an empty list, not an error", async () => {
    (nativeFetch as any).mockResolvedValueOnce(new Response(null, { status: 404 }));
    const entries = await listEntriesRecursive(auth, "ChessNote");
    expect(entries).toEqual([]);
  });

  test("a non-404 error status throws a clear error instead of silently returning empty", async () => {
    (nativeFetch as any).mockResolvedValueOnce(new Response(null, { status: 403 }));
    await expect(listEntriesRecursive(auth, "ChessNote")).rejects.toThrow(/PROPFIND WebDAV thất bại/);
  });
});

describe("downloadFile", () => {
  test("reads rev/serverModified from ETag/Last-Modified headers and returns raw bytes", async () => {
    (nativeFetch as any).mockResolvedValueOnce(
      new Response(new Uint8Array([104, 105]), {
        status: 200,
        headers: { etag: '"r9"', "last-modified": "s9" },
      }),
    );
    const result = await downloadFile(auth, "ChessNote", "a.md");
    expect(result.rev).toBe("r9");
    expect(result.serverModified).toBe("s9");
    expect(new TextDecoder().decode(result.data)).toBe("hi");
  });
});

describe("uploadFile", () => {
  test("add mode sends If-None-Match: *", async () => {
    (nativeFetch as any).mockResolvedValueOnce(
      new Response(null, { status: 201, headers: { etag: '"r1"' } }),
    );
    await uploadFile(auth, "ChessNote", "a.md", new Uint8Array([1]), { tag: "add" });
    const [, init] = (nativeFetch as any).mock.calls[0];
    expect(init.headers["If-None-Match"]).toBe("*");
  });

  test("update mode sends If-Match with the quoted rev", async () => {
    (nativeFetch as any).mockResolvedValueOnce(
      new Response(null, { status: 204, headers: { etag: '"r2"' } }),
    );
    await uploadFile(auth, "ChessNote", "a.md", new Uint8Array([1]), { tag: "update", rev: "r1" });
    const [, init] = (nativeFetch as any).mock.calls[0];
    expect(init.headers["If-Match"]).toBe('"r1"');
  });

  test("overwrite mode sends no precondition header", async () => {
    (nativeFetch as any).mockResolvedValueOnce(
      new Response(null, { status: 204, headers: { etag: '"r3"' } }),
    );
    await uploadFile(auth, "ChessNote", "a.md", new Uint8Array([1]), { tag: "overwrite" });
    const [, init] = (nativeFetch as any).mock.calls[0];
    expect(init.headers["If-Match"]).toBeUndefined();
    expect(init.headers["If-None-Match"]).toBeUndefined();
  });

  test("412 Precondition Failed raises WebDavConflictError", async () => {
    (nativeFetch as any).mockResolvedValueOnce(new Response(null, { status: 412 }));
    await expect(
      uploadFile(auth, "ChessNote", "a.md", new Uint8Array([1]), { tag: "add" }),
    ).rejects.toBeInstanceOf(WebDavConflictError);
  });

  test("409 triggers MKCOL for each missing parent, then retries the PUT once", async () => {
    (nativeFetch as any)
      .mockResolvedValueOnce(new Response(null, { status: 409 })) // PUT #1: parent missing
      .mockResolvedValueOnce(new Response(null, { status: 201 })) // MKCOL notes
      .mockResolvedValueOnce(new Response(null, { status: 201 })) // MKCOL notes/2026
      .mockResolvedValueOnce(new Response(null, { status: 201, headers: { etag: '"r1"' } })); // PUT #2 (retry)

    const result = await uploadFile(
      auth,
      "ChessNote",
      "notes/2026/game.md",
      new Uint8Array([1]),
      { tag: "add" },
    );

    expect(result.rev).toBe("r1");
    expect((nativeFetch as any).mock.calls[1][1].method).toBe("MKCOL");
    expect((nativeFetch as any).mock.calls[1][0]).toBe(
      "https://cloud.example.com/remote.php/dav/files/user/ChessNote/notes/",
    );
    expect((nativeFetch as any).mock.calls[2][1].method).toBe("MKCOL");
    expect((nativeFetch as any).mock.calls[2][0]).toBe(
      "https://cloud.example.com/remote.php/dav/files/user/ChessNote/notes/2026/",
    );
    expect((nativeFetch as any).mock.calls[3][1].method).toBe("PUT");
  });

  test("MKCOL 405 (already exists) is treated as success, not an error", async () => {
    (nativeFetch as any)
      .mockResolvedValueOnce(new Response(null, { status: 409 }))
      .mockResolvedValueOnce(new Response(null, { status: 405 }))
      .mockResolvedValueOnce(new Response(null, { status: 201, headers: { etag: '"r1"' } }));

    const result = await uploadFile(auth, "ChessNote", "notes/game.md", new Uint8Array([1]), {
      tag: "add",
    });
    expect(result.rev).toBe("r1");
  });

  test("falls back to a HEAD request when the PUT response has no ETag", async () => {
    (nativeFetch as any)
      .mockResolvedValueOnce(new Response(null, { status: 201 })) // PUT, no etag
      .mockResolvedValueOnce(new Response(null, { status: 200, headers: { etag: '"from-head"' } }));

    const result = await uploadFile(auth, "ChessNote", "a.md", new Uint8Array([1]), { tag: "add" });
    expect(result.rev).toBe("from-head");
    expect((nativeFetch as any).mock.calls[1][1].method).toBe("HEAD");
  });
});

describe("deleteFile", () => {
  test("404 (already gone) is treated as success, not an error", async () => {
    (nativeFetch as any).mockResolvedValueOnce(new Response(null, { status: 404 }));
    await expect(deleteFile(auth, "ChessNote", "gone.md")).resolves.toBeUndefined();
  });

  test("a non-404 error status throws", async () => {
    (nativeFetch as any).mockResolvedValueOnce(new Response(null, { status: 500 }));
    await expect(deleteFile(auth, "ChessNote", "a.md")).rejects.toThrow(/Xoá file WebDAV thất bại/);
  });
});
