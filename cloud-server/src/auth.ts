// Xác thực đơn giản cho ChessNote Cloud — thiết kế cho dùng CÁ NHÂN/nhóm nhỏ
// (vài người dùng cấu hình tay qua biến môi trường), KHÔNG phải multi-tenant
// SaaS: không có bảng người dùng, không có đăng ký, không có mã hoá mật khẩu
// bằng thuật toán chậm (không cần — không có DB để rò rỉ hash hàng loạt, và
// việc brute-force 1 mật khẩu qua network đã bị giới hạn bởi chính network).
import { timingSafeEqual } from "node:crypto";

export type UserStore = Map<string, string>; // username -> password (plaintext, trong bộ nhớ)

/** Parse `CHESSNOTE_CLOUD_USERS="alice:s3cret,bob:t0p"` — ném lỗi rõ ràng nếu
 * rỗng hoặc sai định dạng, để server KHÔNG âm thầm chạy không xác thực gì. */
export function parseUsers(envValue: string | undefined): UserStore {
  const raw = (envValue || "").trim();
  if (!raw) {
    throw new Error(
      "Chưa đặt CHESSNOTE_CLOUD_USERS (định dạng \"user1:pass1,user2:pass2\"). " +
        "Server sẽ không khởi động nếu không có ít nhất 1 tài khoản.",
    );
  }
  const users: UserStore = new Map();
  for (const pair of raw.split(",")) {
    const idx = pair.indexOf(":");
    if (idx <= 0) {
      throw new Error(`Mục "${pair}" trong CHESSNOTE_CLOUD_USERS sai định dạng, cần "user:pass".`);
    }
    const username = pair.slice(0, idx).trim();
    const password = pair.slice(idx + 1);
    if (!username || !password) {
      throw new Error(`Mục "${pair}" trong CHESSNOTE_CLOUD_USERS thiếu username hoặc password.`);
    }
    users.set(username, password);
  }
  return users;
}

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  // Độ dài khác nhau -> chắc chắn không khớp, nhưng vẫn so sánh với 1 buffer
  // cùng độ dài với bufA để không rò rỉ độ dài mật khẩu thật qua thời gian
  // early-return (dù rủi ro này rất nhỏ ở quy mô cá nhân, làm đúng không tốn
  // gì thêm).
  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/** Trả về username nếu (username, password) khớp `users`, ngược lại `undefined`.
 * Dùng chung cho Basic Auth header và token query-string — cả hai chỗ gọi
 * đều cần biết ĐÃ xác thực là AI (để chọn đúng thư mục gốc/kênh push của
 * người đó), không chỉ true/false. */
function checkCredentials(users: UserStore, username: string, password: string): string | undefined {
  const expected = users.get(username);
  if (!expected) return undefined;
  return constantTimeEquals(password, expected) ? username : undefined;
}

/** Header `Authorization: Basic base64(user:pass)` chuẩn RFC 7617. */
export function checkBasicAuthHeader(header: string | undefined, users: UserStore): string | undefined {
  if (!header?.startsWith("Basic ")) return undefined;
  return checkDecodedToken(header.slice("Basic ".length), users);
}

/**
 * Token base64(user:pass) truyền qua query string — dùng cho kênh push
 * (`GET /_push?auth=...`) vì WebSocket client-side (`new WebSocket(url)`)
 * KHÔNG có cách gắn header `Authorization` tuỳ ý, chỉ có URL. Cùng định dạng
 * base64 với Basic Auth header nên client tính 1 lần, dùng lại cho cả hai —
 * xem `plugs/sync/push_trigger.ts:buildPushUrl`.
 */
export function checkQueryToken(token: string | undefined | null, users: UserStore): string | undefined {
  if (!token) return undefined;
  return checkDecodedToken(token, users);
}

function checkDecodedToken(base64Token: string, users: UserStore): string | undefined {
  let decoded: string;
  try {
    decoded = Buffer.from(base64Token, "base64").toString("utf8");
  } catch {
    return undefined;
  }
  const idx = decoded.indexOf(":");
  if (idx <= 0) return undefined;
  const username = decoded.slice(0, idx);
  const password = decoded.slice(idx + 1);
  return checkCredentials(users, username, password);
}
