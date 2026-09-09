import { describe, expect, test } from "vitest";
import { buildMultistatusXml } from "./webdav_xml.ts";
import type { FileEntry } from "./storage.ts";

describe("buildMultistatusXml", () => {
  test("includes a self-response for the requested collection, marked as a collection", () => {
    const xml = buildMultistatusXml("", []);
    expect(xml).toContain('<D:multistatus xmlns:D="DAV:">');
    expect(xml).toContain("<D:href>/</D:href>");
    expect(xml).toContain("<D:collection/>");
  });

  test("emits a file entry with quoted ETag and getlastmodified, no collection marker", () => {
    const entries: FileEntry[] = [
      { path: "a.md", isDirectory: false, size: 5, mtimeHttp: "Mon, 01 Sep 2026 00:00:00 GMT", etag: "abc123" },
    ];
    const xml = buildMultistatusXml("", entries);
    expect(xml).toContain("<D:href>/a.md</D:href>");
    expect(xml).toContain('<D:getetag>"abc123"</D:getetag>');
    expect(xml).toContain("<D:getlastmodified>Mon, 01 Sep 2026 00:00:00 GMT</D:getlastmodified>");
    // Nội dung <D:resourcetype></D:resourcetype> của file phải RỖNG (không có
    // <D:collection/> bên trong) -- đây chính là điều client dùng để phân
    // biệt file vs thư mục (regex /<resourcetype[^>]*>[\s\S]*?<collection/i).
    expect(xml).not.toMatch(/getetag>"abc123"<\/D:getetag><\/D:prop>[\s\S]{0,50}collection/);
  });

  test("marks a directory entry as a collection and omits its ETag", () => {
    const entries: FileEntry[] = [
      { path: "notes", isDirectory: true, size: 0, mtimeHttp: "Mon, 01 Sep 2026 00:00:00 GMT", etag: "" },
    ];
    const xml = buildMultistatusXml("", entries);
    expect(xml).toContain("<D:href>/notes/</D:href>");
    expect(xml).not.toContain("getetag");
  });

  test("nests hrefBase correctly for a non-root folder", () => {
    const entries: FileEntry[] = [
      { path: "game.md", isDirectory: false, size: 1, mtimeHttp: "x", etag: "e1" },
    ];
    const xml = buildMultistatusXml("/ChessNote", entries);
    expect(xml).toContain("<D:href>/ChessNote/game.md</D:href>");
  });

  test("percent-encodes path segments with spaces/unicode in the href", () => {
    const entries: FileEntry[] = [
      { path: "notes/game 1.md", isDirectory: false, size: 1, mtimeHttp: "x", etag: "e1" },
    ];
    const xml = buildMultistatusXml("", entries);
    expect(xml).toContain("<D:href>/notes/game%201.md</D:href>");
  });

  test("XML-escapes special characters in ETag/last-modified values", () => {
    const entries: FileEntry[] = [
      { path: "a.md", isDirectory: false, size: 1, mtimeHttp: 'x & <y>', etag: 'has"quote' },
    ];
    const xml = buildMultistatusXml("", entries);
    expect(xml).toContain("&amp;");
    expect(xml).toContain("&lt;y&gt;");
    expect(xml).not.toContain('x & <y>');
  });
});
