import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  DropboxConflictError,
  buildAuthorizeUrl,
  deleteFile,
  downloadFile,
  exchangeCodeForTokens,
  generateCodeChallenge,
  generateCodeVerifier,
  listFolderRecursive,
  refreshAccessToken,
  uploadFile,
  type DropboxClientDeps,
  type DropboxTokens,
} from "./dropbox_sync.ts";

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers });
}

describe("PKCE", () => {
  test("generateCodeVerifier produces a 43-char base64url string (no +/=)", () => {
    const v = generateCodeVerifier();
    expect(v.length).toBe(43);
    expect(v).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  test("generateCodeChallenge is deterministic (S256 of the verifier) and base64url-safe", async () => {
    const c1 = await generateCodeChallenge("fixed-verifier-value");
    const c2 = await generateCodeChallenge("fixed-verifier-value");
    expect(c1).toBe(c2);
    expect(c1).toMatch(/^[A-Za-z0-9_-]+$/);
    // Different verifier -> different challenge.
    const c3 = await generateCodeChallenge("other-verifier-value");
    expect(c3).not.toBe(c1);
  });

  test("buildAuthorizeUrl omits redirect_uri (no fixed domain for a self-hosted app)", () => {
    const url = buildAuthorizeUrl("app-key-123", "challenge-abc");
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe("https://www.dropbox.com/oauth2/authorize");
    expect(parsed.searchParams.get("client_id")).toBe("app-key-123");
    expect(parsed.searchParams.get("code_challenge")).toBe("challenge-abc");
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
    expect(parsed.searchParams.get("token_access_type")).toBe("offline");
    expect(parsed.searchParams.has("redirect_uri")).toBe(false);
  });
});

describe("Token exchange", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  test("exchangeCodeForTokens throws a clear error when Dropbox doesn't grant a refresh_token", async () => {
    (fetch as any).mockResolvedValueOnce(
      jsonResponse(200, { access_token: "at", expires_in: 14400 }),
    );
    await expect(exchangeCodeForTokens("key", "code", "verifier")).rejects.toThrow(/refresh_token/);
  });

  test("exchangeCodeForTokens computes expiresAt from expires_in", async () => {
    const now = Date.now();
    (fetch as any).mockResolvedValueOnce(
      jsonResponse(200, { access_token: "at", refresh_token: "rt", expires_in: 100 }),
    );
    const tokens = await exchangeCodeForTokens("key", "code", "verifier");
    expect(tokens.accessToken).toBe("at");
    expect(tokens.refreshToken).toBe("rt");
    expect(tokens.expiresAt).toBeGreaterThanOrEqual(now + 99_000);
    expect(tokens.expiresAt).toBeLessThanOrEqual(now + 101_000);
  });

  test("exchangeCodeForTokens surfaces Dropbox's error_description on failure", async () => {
    (fetch as any).mockResolvedValueOnce(
      jsonResponse(400, { error: "invalid_grant", error_description: "mã đã hết hạn" }),
    );
    await expect(exchangeCodeForTokens("key", "bad-code", "verifier")).rejects.toThrow(
      "mã đã hết hạn",
    );
  });
});

describe("apiFetch behavior (via uploadFile as a representative call)", () => {
  const freshTokens: DropboxTokens = {
    accessToken: "fresh-token",
    refreshToken: "refresh-token",
    expiresAt: Date.now() + 10 * 60_000, // xa hạn, không cần refresh chủ động
  };

  function makeDeps(overrides: Partial<DropboxClientDeps> = {}): DropboxClientDeps {
    return {
      appKey: "app-key",
      getTokens: vi.fn().mockResolvedValue(freshTokens),
      saveTokens: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  test("401 triggers exactly one refresh-and-retry, then succeeds", async () => {
    // Fake store CÓ TRẠNG THÁI: getTokens phải phản ánh saveTokens gần nhất,
    // giống clientStore thật — nếu không, retry sẽ lại dùng token cũ.
    let stored = freshTokens;
    const saveTokens = vi.fn().mockImplementation(async (t: DropboxTokens) => {
      stored = t;
    });
    const deps = makeDeps({ saveTokens, getTokens: vi.fn().mockImplementation(async () => stored) });
    (fetch as any)
      .mockResolvedValueOnce(jsonResponse(401, { error: "expired_access_token" }))
      .mockResolvedValueOnce(
        jsonResponse(200, { access_token: "new-token", expires_in: 14400 }),
      ) // refresh call
      .mockResolvedValueOnce(jsonResponse(200, { rev: "rev1", server_modified: "2026-01-01" }));

    const result = await uploadFile(deps, "/a.md", new Uint8Array([1]), { tag: "add" });
    expect(result.rev).toBe("rev1");
    expect(saveTokens).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: "new-token" }),
    );
    // Lần gọi cuối (upload thật) phải mang access token MỚI, không phải token cũ.
    const lastCallHeaders = (fetch as any).mock.calls[2][1].headers;
    expect(lastCallHeaders.authorization).toBe("Bearer new-token");
  });

  test("429 with Retry-After retries and eventually succeeds", async () => {
    const deps = makeDeps();
    (fetch as any)
      .mockResolvedValueOnce(jsonResponse(429, {}, { "retry-after": "0" }))
      .mockResolvedValueOnce(jsonResponse(200, { rev: "rev1", server_modified: "x" }));

    const result = await uploadFile(deps, "/a.md", new Uint8Array([1]), { tag: "add" });
    expect(result.rev).toBe("rev1");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test("429 gives up after MAX_RETRIES and returns the failing response as an error", async () => {
    const deps = makeDeps();
    (fetch as any).mockResolvedValue(jsonResponse(429, {}, { "retry-after": "0" }));
    await expect(
      uploadFile(deps, "/a.md", new Uint8Array([1]), { tag: "add" }),
    ).rejects.toThrow(/Upload Dropbox thất bại/);
    // 1 lần gọi ban đầu + tối đa 5 lần retry = 6 tổng cộng, không lặp vô hạn.
    expect((fetch as any).mock.calls.length).toBeLessThanOrEqual(6);
  });

  test("409 on upload raises DropboxConflictError (not a generic Error)", async () => {
    const deps = makeDeps();
    (fetch as any).mockResolvedValueOnce(jsonResponse(409, { error_summary: "conflict" }));
    await expect(
      uploadFile(deps, "/a.md", new Uint8Array([1]), { tag: "add" }),
    ).rejects.toBeInstanceOf(DropboxConflictError);
  });

  test("uploadFile sends the correct mode argument for add vs update", async () => {
    const deps = makeDeps();
    (fetch as any).mockResolvedValue(jsonResponse(200, { rev: "r", server_modified: "x" }));
    await uploadFile(deps, "/a.md", new Uint8Array([1]), { tag: "update", rev: "prev-rev" });
    const arg = JSON.parse((fetch as any).mock.calls[0][1].headers["dropbox-api-arg"]);
    expect(arg.mode).toEqual({ ".tag": "update", update: "prev-rev" });
  });

  test("downloadFile reads rev/server_modified from the dropbox-api-result header and returns raw bytes", async () => {
    const deps = makeDeps();
    const bytes = new Uint8Array([104, 105]); // "hi"
    (fetch as any).mockResolvedValueOnce(
      new Response(bytes, {
        status: 200,
        headers: { "dropbox-api-result": JSON.stringify({ rev: "r9", server_modified: "s9" }) },
      }),
    );
    const result = await downloadFile(deps, "/a.md");
    expect(result.rev).toBe("r9");
    expect(result.serverModified).toBe("s9");
    expect(new TextDecoder().decode(result.data)).toBe("hi");
  });

  test("deleteFile treats 409 (already gone) as success, not an error", async () => {
    const deps = makeDeps();
    (fetch as any).mockResolvedValueOnce(jsonResponse(409, { error_summary: "path_lookup/not_found" }));
    await expect(deleteFile(deps, "/gone.md")).resolves.toBeUndefined();
  });
});

describe("listFolderRecursive", () => {
  function makeDeps(): DropboxClientDeps {
    return {
      appKey: "app-key",
      getTokens: vi.fn().mockResolvedValue({
        accessToken: "t",
        refreshToken: "r",
        expiresAt: Date.now() + 60 * 60_000,
      }),
      saveTokens: vi.fn(),
    };
  }

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  test("follows has_more/cursor across pages and strips the folder prefix", async () => {
    (fetch as any)
      .mockResolvedValueOnce(
        jsonResponse(200, {
          entries: [
            { ".tag": "file", path_display: "/ChessNote/a.md", rev: "r1", server_modified: "s1" },
          ],
          has_more: true,
          cursor: "cursor-1",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          entries: [
            {
              ".tag": "deleted",
              path_display: "/ChessNote/b.md",
              rev: "",
              server_modified: "",
            },
          ],
          has_more: false,
        }),
      );

    const entries = await listFolderRecursive(makeDeps(), "ChessNote");
    expect(entries).toEqual([
      { path: "a.md", rev: "r1", serverModified: "s1", deleted: false },
      { path: "b.md", rev: "", serverModified: "", deleted: true },
    ]);
    expect(fetch).toHaveBeenCalledTimes(2);
    const secondCallBody = JSON.parse((fetch as any).mock.calls[1][1].body);
    expect(secondCallBody.cursor).toBe("cursor-1");
  });

  test("409 (folder not yet created on Dropbox) returns an empty list, not an error", async () => {
    (fetch as any).mockResolvedValueOnce(jsonResponse(409, { error_summary: "path/not_found" }));
    const entries = await listFolderRecursive(makeDeps(), "ChessNote");
    expect(entries).toEqual([]);
  });
});

describe("refreshAccessToken", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  test("posts grant_type=refresh_token with the given refresh token", async () => {
    (fetch as any).mockResolvedValueOnce(jsonResponse(200, { access_token: "at2", expires_in: 100 }));
    const result = await refreshAccessToken("app-key", "rt-value");
    expect(result.accessToken).toBe("at2");
    const body = (fetch as any).mock.calls[0][1].body as string;
    const params = new URLSearchParams(body);
    expect(params.get("grant_type")).toBe("refresh_token");
    expect(params.get("refresh_token")).toBe("rt-value");
    expect(params.get("client_id")).toBe("app-key");
  });
});
