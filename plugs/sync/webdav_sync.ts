/**
 * Client WebDAV thuần (RFC 4918 tối thiểu: PROPFIND/GET/PUT/DELETE/MKCOL),
 * dùng `nativeFetch` — xem comment tương tự ở `dropbox_sync.ts`: bỏ qua proxy
 * `/.proxy/` của server Rust vì WebDAV server là 1 host bên ngoài, không cần
 * và không nên đi qua server đó (server có thể không tồn tại trên
 * Desktop/Mobile).
 *
 * CHƯA kiểm chứng thật với server WebDAV nào (Nextcloud/rclone/NAS...) — chỉ
 * viết đúng theo RFC 4918/RFC 7232. Parser XML dưới đây CỐ Ý dùng regex thay
 * vì DOMParser (không có sẵn trong Web Worker sandbox của plug), khoan dung
 * với namespace prefix khác nhau (`D:`, `d:`, `lp1:`, không prefix) nhưng
 * KHÔNG phải một XML parser đầy đủ — server trả XML lồng phức tạp bất thường
 * có thể không parse đúng. Cần 1 lượt test tay với server thật trước khi tin
 * chắc, đúng như kế hoạch đã ghi rõ rủi ro này.
 */

export interface WebDavAuth {
  /** URL gốc WebDAV, ví dụ Nextcloud: "https://cloud.example.com/remote.php/dav/files/user/". */
  baseUrl: string;
  username: string;
  password: string;
}

export class WebDavHttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export class WebDavConflictError extends Error {
  constructor(public path: string) {
    super(`Xung đột ghi WebDAV tại ${path}`);
  }
}

const FETCH_TIMEOUT_MS = 30_000;

/**
 * Không có `AbortSignal`/timeout nào từng tồn tại cho `nativeFetch` trong
 * file này — nếu kết nối treo (server không trả lời gì, không phải lỗi
 * 412/409), `await nativeFetch(...)` chờ VÔ THỜI HẠN, khiến "Chess: Đồng bộ
 * WebDAV" trông như treo im lặng hàng phút không báo gì (đúng lỗi đã gặp với
 * Dropbox, sự cố 2026-09-13 — xem `dropbox_sync.ts`'s `timedFetch`). Dùng
 * đúng mẫu `AbortSignal.timeout()` đã có ở
 * `client/spaces/http_space_primitives.ts` — hết hạn sẽ ném `DOMException`
 * tên "TimeoutError", bọc lại thành `Error` tiếng Việt rõ ràng để không bị
 * nuốt im lặng.
 */
async function timedFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await nativeFetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch (e) {
    if ((e as { name?: string }).name === "TimeoutError") {
      throw new Error(
        `Kết nối tới WebDAV quá thời gian chờ (${FETCH_TIMEOUT_MS / 1000}s) — kiểm tra mạng rồi thử lại.`,
      );
    }
    throw e;
  }
}

function authHeader(auth: WebDavAuth): string {
  return "Basic " + btoa(`${auth.username}:${auth.password}`);
}

function joinUrl(baseUrl: string, relativePath: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  const rel = relativePath.replace(/^\/+/, "");
  if (!rel) return base;
  const encoded = rel
    .split("/")
    .filter((s) => s.length > 0)
    .map(encodeURIComponent)
    .join("/");
  return `${base}/${encoded}`;
}

function stripEtagQuotes(etag: string): string {
  return etag.replace(/^W\//, "").replace(/^"|"$/g, "");
}

function stripTagPrefix(xml: string): string {
  // Chuẩn hoá "<D:foo>"/"<d:foo>"/"<lp1:foo>" -> "<foo>" để regex sau không
  // phải đoán namespace prefix của từng server.
  return xml.replace(/<(\/?)[A-Za-z0-9]*:/g, "<$1");
}

function extractTag(block: string, tag: string): string | undefined {
  const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i").exec(block);
  return m?.[1]?.trim();
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

export interface WebDavEntry {
  /** Đường dẫn tương đối bên trong `folder`, không có "/" đầu. */
  path: string;
  rev: string; // ETag, đã bỏ dấu ngoặc kép
  serverModified: string;
  deleted: boolean;
}

const PROPFIND_BODY = `<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:">
  <D:prop>
    <D:getetag/>
    <D:getlastmodified/>
    <D:resourcetype/>
  </D:prop>
</D:propfind>`;

/** PROPFIND đệ quy (Depth: infinity). 404 = thư mục chưa tồn tại trên server
 * -> coi như rỗng (giống hành vi 409 "chưa tồn tại" của Dropbox); mọi lỗi
 * khác báo rõ ràng, không âm thầm coi là rỗng (ví dụ server không hỗ trợ
 * Depth: infinity thường trả 403/400 — đó là lỗi cấu hình cần biết). */
export async function listEntriesRecursive(
  auth: WebDavAuth,
  folder: string,
): Promise<WebDavEntry[]> {
  const url = joinUrl(auth.baseUrl, folder) + "/";
  const res = await timedFetch(url, {
    method: "PROPFIND",
    headers: {
      Authorization: authHeader(auth),
      Depth: "infinity",
      "Content-Type": "application/xml; charset=utf-8",
    },
    body: PROPFIND_BODY,
  });
  if (res.status === 404) return [];
  if (!res.ok) {
    throw new WebDavHttpError(res.status, `PROPFIND WebDAV thất bại: HTTP ${res.status}`);
  }
  const xml = stripTagPrefix(await res.text());
  const responseBlocks = xml.match(/<response[^>]*>[\s\S]*?<\/response>/gi) ?? [];

  let basePathname: string;
  try {
    basePathname = new URL(joinUrl(auth.baseUrl, folder) + "/", "http://placeholder/").pathname;
  } catch {
    basePathname = "/";
  }

  const entries: WebDavEntry[] = [];
  for (const block of responseBlocks) {
    const hrefRaw = extractTag(block, "href");
    if (!hrefRaw) continue;
    const isCollection = /<resourcetype[^>]*>[\s\S]*?<collection/i.test(block);
    if (isCollection) continue; // bỏ qua thư mục, chỉ liệt kê file

    let hrefPathname: string;
    try {
      hrefPathname = new URL(decodeXmlEntities(hrefRaw), "http://placeholder/").pathname;
    } catch {
      hrefPathname = decodeXmlEntities(hrefRaw);
    }
    let relative = hrefPathname.startsWith(basePathname)
      ? hrefPathname.slice(basePathname.length)
      : hrefPathname;
    relative = decodeURIComponent(relative.replace(/^\/+/, ""));
    if (!relative) continue; // chính thư mục gốc

    const etagRaw = extractTag(block, "getetag") ?? "";
    const lastModified = extractTag(block, "getlastmodified") ?? "";
    entries.push({
      path: relative,
      rev: stripEtagQuotes(etagRaw),
      serverModified: lastModified,
      deleted: false,
    });
  }
  return entries;
}

export async function downloadFile(
  auth: WebDavAuth,
  folder: string,
  path: string,
): Promise<{ data: Uint8Array; rev: string; serverModified: string }> {
  const url = joinUrl(auth.baseUrl, `${folder}/${path}`);
  const res = await timedFetch(url, {
    method: "GET",
    headers: { Authorization: authHeader(auth) },
  });
  if (!res.ok) {
    throw new WebDavHttpError(res.status, `Download WebDAV thất bại (${path}): HTTP ${res.status}`);
  }
  const data = new Uint8Array(await res.arrayBuffer());
  return {
    data,
    rev: stripEtagQuotes(res.headers.get("etag") ?? ""),
    serverModified: res.headers.get("last-modified") ?? "",
  };
}

export type WebDavWriteMode =
  | { tag: "add" }
  | { tag: "update"; rev: string }
  | { tag: "overwrite" };

/** Tạo các thư mục cha còn thiếu bằng MKCOL (idempotent — 405 "Method Not
 * Allowed" nghĩa là thư mục đã tồn tại trên hầu hết server WebDAV, coi là
 * thành công). Cần cho PUT vào 1 path có thư mục con (ví dụ "notes/game.md")
 * — RFC 4918 yêu cầu thư mục cha phải tồn tại trước, khác Dropbox (tự tạo
 * thư mục ngầm khi upload). */
async function ensureParentCollections(auth: WebDavAuth, folder: string, path: string): Promise<void> {
  const segments = path.split("/").slice(0, -1);
  let cur = folder.replace(/^\/+|\/+$/g, "");
  for (const segment of segments) {
    cur = cur ? `${cur}/${segment}` : segment;
    const url = joinUrl(auth.baseUrl, cur) + "/";
    const res = await timedFetch(url, {
      method: "MKCOL",
      headers: { Authorization: authHeader(auth) },
    });
    if (!res.ok && res.status !== 405) {
      throw new WebDavHttpError(res.status, `Tạo thư mục WebDAV thất bại (${cur}): HTTP ${res.status}`);
    }
  }
}

/**
 * Upload có điều kiện qua RFC 7232 precondition header — tương đương ngữ
 * nghĩa mode add/update/overwrite của Dropbox: `add` (If-None-Match: *, lỗi
 * nếu đã tồn tại), `update` kèm rev (If-Match: "<rev>", lỗi nếu rev hiện tại
 * trên server khác), `overwrite` (không header nào).
 */
export async function uploadFile(
  auth: WebDavAuth,
  folder: string,
  path: string,
  content: Uint8Array,
  mode: WebDavWriteMode,
): Promise<{ rev: string; serverModified: string }> {
  const url = joinUrl(auth.baseUrl, `${folder}/${path}`);
  const headers: Record<string, string> = {
    Authorization: authHeader(auth),
    "Content-Type": "application/octet-stream",
  };
  if (mode.tag === "add") headers["If-None-Match"] = "*";
  else if (mode.tag === "update") headers["If-Match"] = `"${mode.rev}"`;

  let res = await timedFetch(url, { method: "PUT", headers, body: content as BodyInit });
  if (res.status === 409) {
    // Rất có thể do thư mục cha chưa tồn tại (RFC 4918) — thử tạo rồi retry
    // đúng 1 lần, không lặp vô hạn.
    await ensureParentCollections(auth, folder, path);
    res = await timedFetch(url, { method: "PUT", headers, body: content as BodyInit });
  }
  if (res.status === 412 || res.status === 409) {
    throw new WebDavConflictError(path);
  }
  if (!res.ok) {
    throw new WebDavHttpError(res.status, `Upload WebDAV thất bại (${path}): HTTP ${res.status}`);
  }

  let rev = stripEtagQuotes(res.headers.get("etag") ?? "");
  let serverModified = res.headers.get("last-modified") ?? "";
  if (!rev) {
    // Không phải mọi server trả ETag ngay trong response PUT — HEAD lại để lấy.
    const head = await timedFetch(url, {
      method: "HEAD",
      headers: { Authorization: authHeader(auth) },
    });
    rev = stripEtagQuotes(head.headers.get("etag") ?? "");
    serverModified = head.headers.get("last-modified") ?? serverModified;
  }
  return { rev, serverModified };
}

export async function deleteFile(auth: WebDavAuth, folder: string, path: string): Promise<void> {
  const url = joinUrl(auth.baseUrl, `${folder}/${path}`);
  const res = await timedFetch(url, {
    method: "DELETE",
    headers: { Authorization: authHeader(auth) },
  });
  // 404 = đã bị xoá từ trước — coi như thành công (idempotent, giống Dropbox 409).
  if (!res.ok && res.status !== 404) {
    throw new WebDavHttpError(res.status, `Xoá file WebDAV thất bại (${path}): HTTP ${res.status}`);
  }
}
