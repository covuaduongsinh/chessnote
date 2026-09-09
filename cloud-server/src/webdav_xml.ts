// Sinh XML multistatus cho PROPFIND — chuẩn RFC 4918, namespace "DAV:" với
// prefix "D:" (phổ biến nhất, khớp namespace mà `plugs/sync/webdav_sync.ts`
// (client) đã viết để khoan dung mọi prefix, và cũng là quy ước phổ biến của
// các server WebDAV thật khác — không chỉ tương thích với client của chính
// ChessNote).
import type { FileEntry } from "./storage.ts";

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** `href` phải là URL-encoded (RFC 4918 §5.1) — path đã được decode phía
 * caller nên encode lại từng segment ở đây. */
function encodeHref(path: string): string {
  return path
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

function responseFor(hrefBase: string, entry: FileEntry): string {
  const href = xmlEscape(`${hrefBase}/${encodeHref(entry.path)}${entry.isDirectory ? "/" : ""}`);
  const resourcetype = entry.isDirectory ? "<D:collection/>" : "";
  const etagProp = entry.isDirectory ? "" : `<D:getetag>"${xmlEscape(entry.etag)}"</D:getetag>`;
  return (
    `<D:response>` +
    `<D:href>${href}</D:href>` +
    `<D:propstat><D:prop>` +
    etagProp +
    `<D:getlastmodified>${xmlEscape(entry.mtimeHttp)}</D:getlastmodified>` +
    `<D:resourcetype>${resourcetype}</D:resourcetype>` +
    `</D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat>` +
    `</D:response>`
  );
}

/**
 * `hrefBase` là path (không domain) của chính thư mục được PROPFIND, ví dụ
 * "/ChessNote" — `entries` là danh sách TƯƠNG ĐỐI bên trong thư mục đó
 * (không gồm chính thư mục gốc; client của ChessNote không cần entry cho
 * chính thư mục nó PROPFIND, chỉ cần các file/thư mục con — xem
 * `webdav_sync.ts:listEntriesRecursive` bỏ qua entry rỗng sau khi strip prefix).
 */
export function buildMultistatusXml(hrefBase: string, entries: FileEntry[]): string {
  const selfHref = xmlEscape(`${hrefBase}/`);
  const selfResponse =
    `<D:response><D:href>${selfHref}</D:href>` +
    `<D:propstat><D:prop><D:resourcetype><D:collection/></D:resourcetype></D:prop>` +
    `<D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>`;
  const body = entries.map((e) => responseFor(hrefBase, e)).join("");
  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<D:multistatus xmlns:D="DAV:">${selfResponse}${body}</D:multistatus>`
  );
}
