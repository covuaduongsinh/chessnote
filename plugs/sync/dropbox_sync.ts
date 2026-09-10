/**
 * Dropbox client thuần (MIT) — OAuth2 PKCE + thao tác file API v2 qua fetch()
 * thô, không dùng SDK `dropbox` (giữ đúng tinh thần "gọn nhẹ, không thêm
 * dependency" mà phiên trước đã chọn — chỉ khác là lần này OAuth có thật).
 *
 * KHÔNG có logic đồng bộ hai chiều ở đây — chỉ là client API. Thuật toán
 * đồng bộ + đăng ký Command nằm ở `dropbox_bridge.ts`.
 *
 * CHƯA kiểm chứng thật với một tài khoản Dropbox/App key thật (cần người
 * dùng tự tạo Dropbox App ở dropbox.com/developers rồi cấu hình App key —
 * việc tạo tài khoản bên thứ ba không thể tự động hoá được). Luồng "không
 * redirect_uri → Dropbox tự hiện mã để copy tay" là hành vi ĐÃ TÀI LIỆU HOÁ
 * chính thức của Dropbox (dùng bởi nhiều CLI/rclone), nhưng vẫn cần một lượt
 * thử tay thật trước khi coi là chắc chắn trên phiên bản API hiện tại.
 */

const AUTHORIZE_URL = "https://www.dropbox.com/oauth2/authorize";
const TOKEN_URL = "https://api.dropboxapi.com/oauth2/token";
const API_ROOT = "https://api.dropboxapi.com/2";
const CONTENT_ROOT = "https://content.dropboxapi.com/2";

// ---- PKCE ----

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 43 ký tự base64url — nằm trong khoảng 43-128 ký tự RFC 7636 yêu cầu. */
export function generateCodeVerifier(): string {
  return base64UrlEncode(globalThis.crypto.getRandomValues(new Uint8Array(32)));
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return base64UrlEncode(new Uint8Array(digest));
}

/**
 * URL đăng nhập Dropbox. KHÔNG kèm redirect_uri — app tự host không có domain
 * cố định để đăng ký redirect URI, nên dùng luồng "no redirect": Dropbox tự
 * hiện mã xác thực trên trang để người dùng copy tay, dán lại vào ChessNote
 * (giống hệt khuôn "dán mã" đã dùng cho đăng nhập Claude Code ở Giai đoạn 3).
 */
export function buildAuthorizeUrl(appKey: string, codeChallenge: string): string {
  const params = new URLSearchParams({
    client_id: appKey,
    response_type: "code",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    token_access_type: "offline", // xin refresh_token để tự gia hạn khi 401
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export interface DropboxTokens {
  accessToken: string;
  refreshToken: string;
  /** epoch ms lúc access token hết hạn. */
  expiresAt: number;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  error?: string;
  error_description?: string;
}

/** Đổi mã xác thực (người dùng dán tay) lấy access+refresh token. */
export async function exchangeCodeForTokens(
  appKey: string,
  code: string,
  codeVerifier: string,
): Promise<DropboxTokens> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: code.trim(),
    client_id: appKey,
    code_verifier: codeVerifier,
  });
  // dropboxapi.com là domain public, không cần/không nên đi qua proxy `/.proxy/`
  // của server Rust — server đó có thể không tồn tại trên Desktop/Mobile
  // (bundle tĩnh, không server). `nativeFetch` là bản fetch() gốc chưa bị
  // worker_runtime.ts monkey-patch. KHÔNG mở quyền mới: `sync.plug.yaml` đã
  // có `requiredPermissions: [fetch]` ở cấp plug, người dùng đã đồng ý cho
  // plug này gọi mạng — đây chỉ đổi cơ chế thực thi, không đổi ranh giới quyền.
  const res = await nativeFetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || `Dropbox trả HTTP ${res.status}`);
  }
  if (!json.refresh_token) {
    throw new Error(
      "Dropbox không trả refresh_token (kiểm tra token_access_type=offline đã gửi đúng chưa).",
    );
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
}

export async function refreshAccessToken(
  appKey: string,
  refreshToken: string,
): Promise<{ accessToken: string; expiresAt: number }> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: appKey,
  });
  // Xem comment ở exchangeCodeForTokens() — nativeFetch để bỏ qua proxy `/.proxy/`.
  const res = await nativeFetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || `Dropbox trả HTTP ${res.status}`);
  }
  return { accessToken: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
}

// ---- Low-level API client với tự gia hạn token + backoff cho 429 ----

export interface DropboxClientDeps {
  appKey: string;
  getTokens: () => Promise<DropboxTokens | undefined>;
  saveTokens: (tokens: DropboxTokens) => Promise<void>;
}

const TOKEN_EXPIRY_SKEW_MS = 60_000;
const MAX_RETRIES = 5;

async function ensureFreshTokens(deps: DropboxClientDeps): Promise<DropboxTokens> {
  const tokens = await deps.getTokens();
  if (!tokens) throw new Error("Chưa đăng nhập Dropbox.");
  if (tokens.expiresAt - Date.now() > TOKEN_EXPIRY_SKEW_MS) return tokens;
  const refreshed = await refreshAccessToken(deps.appKey, tokens.refreshToken);
  const next: DropboxTokens = { ...tokens, ...refreshed };
  await deps.saveTokens(next);
  return next;
}

/** sleep tách riêng để test có thể mock/rút ngắn. */
export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function apiFetch(
  deps: DropboxClientDeps,
  url: string,
  init: { headers: Record<string, string>; body?: BodyInit },
  attempt = 0,
): Promise<Response> {
  const tokens = await ensureFreshTokens(deps);
  // Xem comment ở exchangeCodeForTokens() — nativeFetch để bỏ qua proxy `/.proxy/`.
  const res = await nativeFetch(url, {
    method: "POST",
    ...init,
    headers: { ...init.headers, authorization: `Bearer ${tokens.accessToken}` },
  });

  if (res.status === 401 && attempt === 0) {
    // Token có thể bị thu hồi/hết hạn ngoài dự kiến — thử refresh một lần rồi thôi.
    const refreshed = await refreshAccessToken(deps.appKey, tokens.refreshToken);
    await deps.saveTokens({ ...tokens, ...refreshed });
    return apiFetch(deps, url, init, attempt + 1);
  }
  if (res.status === 429 && attempt < MAX_RETRIES) {
    const retryAfterHeader = res.headers.get("retry-after");
    const retryAfterS = retryAfterHeader ? Number(retryAfterHeader) : NaN;
    const waitMs = Number.isFinite(retryAfterS) ? retryAfterS * 1000 : 500 * 2 ** attempt;
    await sleep(waitMs);
    return apiFetch(deps, url, init, attempt + 1);
  }
  return res;
}

/**
 * Đọc chi tiết lỗi thật từ body (Dropbox trả `{"error_summary": "...", ...}`
 * cho hầu hết lỗi 4xx) — trước đây các nhánh lỗi dưới chỉ báo mã HTTP trần,
 * không đủ để tự chẩn đoán (ví dụ 400 có thể do path sai định dạng, thiếu
 * scope quyền, hay app type App-Folder/Full Dropbox không khớp cấu hình).
 * An toàn gọi TRƯỚC khi bất kỳ chỗ nào khác đọc `res.json()`/`res.arrayBuffer()`
 * (mỗi Response chỉ đọc body được đúng 1 lần).
 */
async function describeError(res: Response): Promise<string> {
  try {
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      return json.error_summary || json.error_description || text.slice(0, 300);
    } catch {
      return text.slice(0, 300);
    }
  } catch {
    return "";
  }
}

/**
 * Dropbox yêu cầu header `Dropbox-API-Arg` chỉ chứa ASCII (đây là quy định
 * chính thức của Dropbox — xem docs "HTTP header" — KHÔNG phải suy đoán) vì
 * đây là 1 HTTP header, còn path có thể chứa ký tự có dấu (tiếng Việt,
 * Catalan, ...). Dropbox tự unescape `\uXXXX` phía server, nên client phải tự
 * escape TRƯỚC khi gửi. Thiếu bước này khiến chính Fetch API của trình
 * duyệt throw ngay lúc set header — `TypeError: Failed to execute 'fetch'...
 * String contains non ISO-8859-1 code point` — trước khi request kịp rời
 * máy, nên lỗi này KHÔNG liên quan gì tới Dropbox/mạng, dễ chẩn đoán sai.
 */
const NON_ASCII_RE = new RegExp(
  "[^" + String.fromCharCode(0) + "-" + String.fromCharCode(127) + "]",
  "g",
);

export function toAsciiSafeHeaderJson(value: unknown): string {
  return JSON.stringify(value).replace(
    NON_ASCII_RE,
    (ch) => "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0"),
  );
}

export type DropboxWriteMode =
  | { tag: "add" }
  | { tag: "update"; rev: string }
  | { tag: "overwrite" };

function modeArg(mode: DropboxWriteMode) {
  if (mode.tag === "add") return { ".tag": "add" };
  if (mode.tag === "update") return { ".tag": "update", update: mode.rev };
  return { ".tag": "overwrite" };
}

export class DropboxConflictError extends Error {
  constructor(public path: string) {
    super(`Xung đột ghi Dropbox tại ${path}`);
  }
}

/**
 * Upload có điều kiện: `mode:add` báo lỗi nếu file đã tồn tại, `mode:update`
 * kèm `rev` báo lỗi nếu rev hiện tại trên Dropbox khác — đây là cách Dropbox
 * chống race điều kiện (client-side rev-compare-trước-khi-ghi luôn có khe hở
 * TOCTOU; để chính Dropbox trọng tài là đúng).
 */
export async function uploadFile(
  deps: DropboxClientDeps,
  dropboxPath: string,
  content: Uint8Array,
  mode: DropboxWriteMode,
): Promise<{ rev: string; serverModified: string }> {
  const res = await apiFetch(deps, `${CONTENT_ROOT}/files/upload`, {
    headers: {
      "dropbox-api-arg": toAsciiSafeHeaderJson({
        path: dropboxPath,
        mode: modeArg(mode),
        autorename: false,
        mute: true,
      }),
      "content-type": "application/octet-stream",
    },
    body: content as BodyInit,
  });
  if (res.status === 409) {
    throw new DropboxConflictError(dropboxPath);
  }
  if (!res.ok) {
    throw new Error(
      `Upload Dropbox thất bại (${dropboxPath}): HTTP ${res.status} — ${await describeError(res)}`,
    );
  }
  const json = await res.json();
  return { rev: json.rev, serverModified: json.server_modified };
}

export async function downloadFile(
  deps: DropboxClientDeps,
  dropboxPath: string,
): Promise<{ data: Uint8Array; rev: string; serverModified: string }> {
  const res = await apiFetch(deps, `${CONTENT_ROOT}/files/download`, {
    headers: { "dropbox-api-arg": toAsciiSafeHeaderJson({ path: dropboxPath }) },
  });
  if (!res.ok) {
    throw new Error(
      `Download Dropbox thất bại (${dropboxPath}): HTTP ${res.status} — ${await describeError(res)}`,
    );
  }
  const apiResultHeader = res.headers.get("dropbox-api-result") || "{}";
  const meta = JSON.parse(apiResultHeader);
  const data = new Uint8Array(await res.arrayBuffer());
  return { data, rev: meta.rev, serverModified: meta.server_modified };
}

export async function deleteFile(deps: DropboxClientDeps, dropboxPath: string): Promise<void> {
  const res = await apiFetch(deps, `${API_ROOT}/files/delete_v2`, {
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: dropboxPath }),
  });
  // 409 với reason path_lookup/not_found nghĩa là đã bị xoá từ trước — coi như thành công (idempotent).
  if (!res.ok && res.status !== 409) {
    throw new Error(
      `Xoá file Dropbox thất bại (${dropboxPath}): HTTP ${res.status} — ${await describeError(res)}`,
    );
  }
}

/**
 * Dropbox yêu cầu path API là `""` cho gốc, hoặc bắt đầu bằng `/` và KHÔNG có
 * `/` cuối cho thư mục con (`PathROrId` pattern) — thiếu dấu `/` đầu từng là
 * một bug thật ở đây (bắt được nhờ test, không phải suy đoán): `path:
 * folder` gửi thẳng chuỗi "ChessNote" (không "/") khiến API list_folder lẽ ra
 * phải bị Dropbox từ chối.
 */
export function normalizeDropboxFolder(folder: string): { apiPath: string; prefix: string } {
  const trimmed = folder.replace(/^\/+|\/+$/g, "");
  return {
    apiPath: trimmed ? `/${trimmed}` : "",
    prefix: trimmed ? `/${trimmed}/` : "/",
  };
}

export interface DropboxEntry {
  path: string; // đường dẫn tương đối bên trong syncFolder, không có "/" đầu
  rev: string;
  serverModified: string;
  deleted: boolean;
}

/** Liệt kê đệ quy toàn bộ file trong `folder`, tự phân trang qua `list_folder/continue`. */
export async function listFolderRecursive(
  deps: DropboxClientDeps,
  folder: string,
): Promise<DropboxEntry[]> {
  const entries: DropboxEntry[] = [];
  const { apiPath, prefix } = normalizeDropboxFolder(folder);

  let res = await apiFetch(deps, `${API_ROOT}/files/list_folder`, {
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      path: apiPath,
      recursive: true,
      include_deleted: true,
      include_media_info: false,
    }),
  });
  if (res.status === 409) {
    // Thư mục chưa tồn tại trên Dropbox (lần đồng bộ đầu tiên) — coi như rỗng.
    return [];
  }
  if (!res.ok) {
    throw new Error(
      `Liệt kê thư mục Dropbox thất bại: HTTP ${res.status} — ${await describeError(res)}`,
    );
  }

  for (;;) {
    const json = await res.json();
    for (const e of json.entries || []) {
      if (e[".tag"] !== "file" && e[".tag"] !== "deleted") continue;
      const fullPath: string = e.path_display || e.path_lower;
      const relative = fullPath.startsWith(prefix) ? fullPath.slice(prefix.length) : fullPath;
      entries.push({
        path: relative.replace(/^\/+/, ""),
        rev: e.rev || "",
        serverModified: e.server_modified || "",
        deleted: e[".tag"] === "deleted",
      });
    }
    if (!json.has_more) break;
    res = await apiFetch(deps, `${API_ROOT}/files/list_folder/continue`, {
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cursor: json.cursor }),
    });
    if (!res.ok) {
      throw new Error(
        `Phân trang danh sách Dropbox thất bại: HTTP ${res.status} — ${await describeError(res)}`,
      );
    }
  }
  return entries;
}
