/**
 * Mã hoá đầu cuối (E2EE) tuỳ chọn cho NỘI DUNG file trước khi upload lên
 * Dropbox/WebDAV — GIỮ NGUYÊN tên file (path) trên remote, chỉ nội dung
 * được mã hoá (mã hoá tên file sẽ phá vỡ logic path-based của
 * `sync_engine.ts`, không đáng đổi ở giai đoạn này).
 *
 * `EncryptingSyncProvider` bọc quanh 1 `SyncProvider` bất kỳ theo decorator
 * pattern — mã hoá trước `inner.upload`, giải mã sau `inner.download` — nên
 * `sync_engine.ts` (kể cả logic ghi file `.conflict-<ts>.md` cần đọc nội
 * dung remote để hiển thị) hoàn toàn không cần biết gì về mã hoá: nó luôn
 * thấy plaintext qua `provider.download()`/`provider.upload()`.
 *
 * KDF: PBKDF2 (WebCrypto thuần, không thêm dependency ngoài), 600.000 vòng
 * lặp (khuyến nghị OWASP 2023) — đủ an toàn cho dùng cá nhân, tránh gánh
 * nặng Argon2id/WASM mà Super Productivity dùng.
 *
 * Cipher: AES-GCM 256-bit, IV ngẫu nhiên 12 byte MỖI LẦN mã hoá (bắt buộc
 * với GCM — không bao giờ tái dùng IV cho cùng 1 key). Gói tin mỗi file:
 * iv(12) + ciphertext+tag.
 *
 * ⚠️ Salt CỐ ĐỊNH (hardcode ngay dưới), KHÔNG sinh ngẫu nhiên theo từng
 * Space/thiết bị — đánh đổi CÓ CHỦ Ý: một salt ngẫu nhiên phải được đồng bộ
 * tới MỌI thiết bị trước khi thiết bị đó giải mã được bất kỳ file nào (bài
 * toán "gà và trứng" — file chứa salt cũng phải đi qua chính cơ chế sync mà
 * nó đang cấu hình). Đánh đổi này chấp nhận được với mô hình đe doạ ở đây:
 * che nội dung khỏi nhà cung cấp lưu trữ đám mây, KHÔNG phải chống
 * rainbow-table trên quy mô mọi người dùng ChessNote toàn cầu — 600.000 vòng
 * PBKDF2 đã làm điều đó đủ chậm dù salt có cố định. Nhờ vậy, MỌI thiết bị chỉ
 * cần đúng mật khẩu là suy ra đúng key ngay, không cần đồng bộ gì thêm để
 * "khởi tạo" E2EE trên thiết bị mới.
 */
import type { SyncProvider, WriteMode } from "./sync_provider.ts";

const PBKDF2_ITERATIONS = 600_000;
const IV_BYTES = 12;

// 16 byte cố định — KHÔNG phải bí mật (xem giải thích ở trên); chỉ cần khác
// một salt PBKDF2 mặc định/rỗng. Bytes của chuỗi ASCII "ChessNote-E2EE-v1".
const FIXED_SALT = new Uint8Array([
  0x43, 0x68, 0x65, 0x73, 0x73, 0x4e, 0x6f, 0x74, 0x65, 0x2d, 0x45, 0x32, 0x45,
  0x45, 0x2d, 0x76, 0x31,
]);

async function deriveKeyFromPassword(password: string): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: FIXED_SALT as BufferSource, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const LOCAL_CHECK_PLAINTEXT = "chessnote-e2ee-local-check-v1";

/**
 * Tạo 1 "key check value" MỚI — CHỈ để cho UX "sai mật khẩu" một thông báo
 * rõ ràng NGAY trên máy này khi vừa nhập; đây KHÔNG phải nguồn sự thật và
 * KHÔNG cần đồng bộ đi đâu — một thiết bị MỚI (chưa từng tạo check value
 * này) không cần nó vẫn giải mã đúng nếu gõ đúng mật khẩu (vì salt cố định,
 * xem giải thích ở đầu file); check value chỉ tránh phải chờ tới lúc giải mã
 * file thật mới biết mật khẩu sai.
 */
export async function createLocalCheckValue(
  password: string,
): Promise<{ key: CryptoKey; checkValue: string }> {
  const key = await deriveKeyFromPassword(password);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    new TextEncoder().encode(LOCAL_CHECK_PLAINTEXT) as BufferSource,
  );
  return { key, checkValue: bytesToBase64(concatBytes(iv, new Uint8Array(ciphertext))) };
}

/** Xác minh mật khẩu bằng 1 check value đã lưu trước đó trên CHÍNH máy này. */
export async function verifyLocalCheckValue(password: string, checkValue: string): Promise<CryptoKey> {
  const key = await deriveKeyFromPassword(password);
  const packed = base64ToBytes(checkValue);
  const iv = packed.slice(0, IV_BYTES);
  const ciphertext = packed.slice(IV_BYTES);
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, ciphertext as BufferSource);
    if (new TextDecoder().decode(plain) !== LOCAL_CHECK_PLAINTEXT) {
      throw new Error("mismatch");
    }
  } catch {
    throw new Error("Mật khẩu không đúng.");
  }
  return key;
}

export async function encryptBuffer(key: CryptoKey, data: Uint8Array): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    data as BufferSource,
  );
  return concatBytes(iv, new Uint8Array(ciphertext));
}

export async function decryptBuffer(key: CryptoKey, packed: Uint8Array): Promise<Uint8Array> {
  const iv = packed.slice(0, IV_BYTES);
  const ciphertext = packed.slice(IV_BYTES);
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, ciphertext as BufferSource);
    return new Uint8Array(plain);
  } catch {
    throw new Error(
      "Không giải mã được — mật khẩu E2EE sai, hoặc file này không được ChessNote mã hoá.",
    );
  }
}

/**
 * Decorator: trong suốt với `sync_engine.ts` — giữ nguyên `name` (không đổi
 * đường dẫn state-file riêng theo provider khi bật/tắt E2EE, xem
 * `sync_engine.ts:stateFilePathFor`), không đổi `listEntries`/`delete` (chỉ
 * nội dung file mới cần mã hoá, không phải metadata/đường dẫn).
 */
export class EncryptingSyncProvider implements SyncProvider {
  readonly name: string;

  constructor(private inner: SyncProvider, private key: CryptoKey) {
    this.name = inner.name;
  }

  listEntries(folder: string, priorCursor?: string) {
    return this.inner.listEntries(folder, priorCursor);
  }

  async download(folder: string, path: string) {
    const raw = await this.inner.download(folder, path);
    return { ...raw, data: await decryptBuffer(this.key, raw.data) };
  }

  async upload(folder: string, path: string, data: Uint8Array, mode: WriteMode) {
    const encrypted = await encryptBuffer(this.key, data);
    return this.inner.upload(folder, path, encrypted, mode);
  }

  delete(folder: string, path: string) {
    return this.inner.delete(folder, path);
  }
}
