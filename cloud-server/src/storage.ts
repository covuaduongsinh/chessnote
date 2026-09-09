// Lưu trữ file thuần trên filesystem, mỗi user 1 thư mục gốc riêng — cùng
// tinh thần "thin file store" của server Rust ChessNote (không DB nào lưu
// nội dung, chỉ filesystem). ETag = sha1(nội dung) — phản ánh ĐÚNG thay đổi
// nội dung (không dùng mtime: có thể giữ nguyên qua backup/restore mà nội
// dung không đổi, hoặc đổi mà mtime vô tình giống — sha1 tránh cả 2 sai lệch).
import { createHash } from "node:crypto";
import { mkdir as fsMkdir, readdir, readFile as fsReadFile, rm, stat, writeFile as fsWriteFile } from "node:fs/promises";
import { join, normalize, relative, resolve, sep } from "node:path";

export class NotFoundError extends Error {}
export class PreconditionFailedError extends Error {} // 412 — If-Match/If-None-Match không khớp
export class ConflictError extends Error {} // 409 — thư mục cha chưa tồn tại (giống RFC 4918 PUT)
export class AlreadyExistsCollectionError extends Error {} // "405" khi MKCOL vào thư mục đã có

export interface FileEntry {
  path: string; // tương đối, dùng "/" luôn (không phân biệt Windows/POSIX)
  isDirectory: boolean;
  size: number;
  mtimeHttp: string; // định dạng RFC 7231 cho header Last-Modified/getlastmodified
  etag: string;
}

function etagOf(data: Buffer): string {
  return createHash("sha1").update(data).digest("hex");
}

function toHttpDate(d: Date): string {
  return d.toUTCString();
}

/**
 * Chặn path traversal (`..`, path tuyệt đối lạ) — BẮT BUỘC vì server này
 * nhận path trực tiếp từ URL của người dùng qua network. Trả về path tuyệt
 * đối đã xác nhận nằm trong `userRoot`, ném lỗi nếu không.
 */
function resolveSafePath(userRoot: string, relPath: string): string {
  const cleaned = relPath.replace(/^\/+/, "");
  const abs = resolve(userRoot, cleaned);
  const rel = relative(userRoot, abs);
  if (rel.startsWith("..") || resolve(userRoot, rel) !== abs) {
    throw new Error(`Đường dẫn không hợp lệ (path traversal?): ${relPath}`);
  }
  return abs;
}

export async function ensureUserRoot(userRoot: string): Promise<void> {
  await fsMkdir(userRoot, { recursive: true });
}

export async function listRecursive(userRoot: string, relDir: string): Promise<FileEntry[]> {
  const startAbs = resolveSafePath(userRoot, relDir);
  const entries: FileEntry[] = [];

  async function walk(abs: string, relPrefix: string) {
    let dirents;
    try {
      dirents = await readdir(abs, { withFileTypes: true });
    } catch (e: any) {
      if (e?.code === "ENOENT") return; // thư mục chưa tồn tại -> coi như rỗng
      throw e;
    }
    for (const d of dirents) {
      const childAbs = join(abs, d.name);
      const childRel = relPrefix ? `${relPrefix}/${d.name}` : d.name;
      if (d.isDirectory()) {
        entries.push({
          path: childRel,
          isDirectory: true,
          size: 0,
          mtimeHttp: toHttpDate(new Date()),
          etag: "",
        });
        await walk(childAbs, childRel);
      } else if (d.isFile()) {
        const [data, st] = await Promise.all([fsReadFile(childAbs), stat(childAbs)]);
        entries.push({
          path: childRel,
          isDirectory: false,
          size: st.size,
          mtimeHttp: toHttpDate(st.mtime),
          etag: etagOf(data),
        });
      }
    }
  }

  await walk(startAbs, "");
  return entries;
}

export async function readFileEntry(
  userRoot: string,
  relPath: string,
): Promise<{ data: Buffer; etag: string; mtimeHttp: string }> {
  const abs = resolveSafePath(userRoot, relPath);
  let data: Buffer;
  let st;
  try {
    [data, st] = await Promise.all([fsReadFile(abs), stat(abs)]);
  } catch (e: any) {
    if (e?.code === "ENOENT") throw new NotFoundError(relPath);
    throw e;
  }
  return { data, etag: etagOf(data), mtimeHttp: toHttpDate(st.mtime) };
}

export type WriteMode =
  | { tag: "add" } // lỗi nếu file đã tồn tại (If-None-Match: *)
  | { tag: "update"; ifMatch: string } // lỗi nếu ETag hiện tại khác ifMatch (If-Match)
  | { tag: "overwrite" }; // không kiểm gì, luôn ghi đè

export async function writeFileEntry(
  userRoot: string,
  relPath: string,
  data: Buffer,
  mode: WriteMode,
): Promise<{ etag: string; mtimeHttp: string }> {
  const abs = resolveSafePath(userRoot, relPath);

  let currentEtag: string | undefined;
  try {
    const existing = await fsReadFile(abs);
    currentEtag = etagOf(existing);
  } catch (e: any) {
    if (e?.code !== "ENOENT") throw e;
  }

  if (mode.tag === "add" && currentEtag !== undefined) {
    throw new PreconditionFailedError(`${relPath} đã tồn tại (add yêu cầu chưa có).`);
  }
  if (mode.tag === "update" && currentEtag !== mode.ifMatch) {
    throw new PreconditionFailedError(
      `${relPath} đã đổi từ lúc đọc (ETag hiện tại ${currentEtag ?? "(không có)"}, kỳ vọng ${mode.ifMatch}).`,
    );
  }

  try {
    await fsWriteFile(abs, data);
  } catch (e: any) {
    if (e?.code === "ENOENT") {
      // Thư mục cha chưa tồn tại — giống hành vi RFC 4918 PUT, để caller (route
      // handler) quyết định trả 409 cho client tự MKCOL rồi retry, KHÔNG tự tạo
      // ngầm ở đây (giữ đúng ngữ nghĩa WebDAV chuẩn mà `webdav_sync.ts` đã cài đặt).
      throw new ConflictError(`Thư mục cha của ${relPath} chưa tồn tại.`);
    }
    throw e;
  }

  const st = await stat(abs);
  return { etag: etagOf(data), mtimeHttp: toHttpDate(st.mtime) };
}

export async function deleteFileEntry(userRoot: string, relPath: string): Promise<void> {
  const abs = resolveSafePath(userRoot, relPath);
  try {
    await rm(abs);
  } catch (e: any) {
    if (e?.code === "ENOENT") throw new NotFoundError(relPath);
    throw e;
  }
}

export async function makeCollection(userRoot: string, relPath: string): Promise<void> {
  const abs = resolveSafePath(userRoot, relPath);
  try {
    await fsMkdir(abs);
  } catch (e: any) {
    if (e?.code === "EEXIST") throw new AlreadyExistsCollectionError(relPath);
    throw e;
  }
}

/** Chỉ dùng để tính path tương đối chuẩn hoá theo "/", tránh lệ thuộc `sep` của Windows khi so khớp URL. */
export function toUnixPath(p: string): string {
  return p.split(sep).join("/");
}

export function normalizeRelPath(p: string): string {
  return normalize(p).split(sep).join("/").replace(/^\/+/, "");
}
