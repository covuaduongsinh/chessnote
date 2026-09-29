// Bền hoá trạng thái ôn tập SRS ra một file trong Space.
//
// Vì sao cần: SQLite của plug này là `:memory:` (xem sqlite_store.ts) nên mọi
// dòng `repertoire_lines` bị dựng lại từ PGN mỗi lần tải trang — riêng lịch ôn
// (due_date/ease_factor/interval_days/review_count/last_grade) là TRẠNG THÁI
// không dựng lại được từ nội dung trang, nên trước đây mất sạch sau mỗi lần
// tải lại. File này giữ chúng ngoài DB; vì nằm trong Space nên còn được engine
// đồng bộ (plugs/sync) mang sang thiết bị khác.
//
// Khoá theo NỘI DUNG (trang + chuỗi nước đi), không theo `ref`: `ref` chứa vị
// trí khối trong trang (`<trang>@<offset>`) nên đổi khi người dùng thêm/xoá chữ
// phía trên khối; chuỗi nước đi thì ổn định chừng nào biến đó không bị sửa.
//
// Thuần, không phụ thuộc syscall/WASM để test được bằng vitest.

export const SRS_STATE_PATH = "_chess/repertoire-srs.json";

export interface PersistedSrsEntry {
  dueDate: string | null;
  easeFactor: number;
  intervalDays: number;
  reviewCount: number;
  lastGrade: string | null;
}

export type PersistedSrsState = Record<string, PersistedSrsEntry>;

/** Khoá ổn định của một biến khai cuộc: trang + chuỗi nước SAN. */
export function srsKey(page: string, movesSan: string): string {
  return `${page}\u0000${movesSan}`;
}

function isEntry(v: unknown): v is PersistedSrsEntry {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    (e.dueDate === null || typeof e.dueDate === "string") &&
    typeof e.easeFactor === "number" &&
    typeof e.intervalDays === "number" &&
    typeof e.reviewCount === "number" &&
    (e.lastGrade === null || typeof e.lastGrade === "string")
  );
}

/** Đọc file JSON; nội dung hỏng/không hợp lệ → `{}` (bỏ qua từng mục sai, không ném lỗi làm hỏng việc đánh chỉ mục). */
export function parseSrsState(text: string): PersistedSrsState {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return {};
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const out: PersistedSrsState = {};
  for (const [k, v] of Object.entries(raw)) {
    if (isEntry(v)) out[k] = v;
  }
  return out;
}

export function serializeSrsState(state: PersistedSrsState): string {
  return JSON.stringify(state, null, 2);
}
