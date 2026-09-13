// Interface tối giản để `sync_engine.ts` dùng chung thuật toán đồng bộ cho
// nhiều remote storage (Dropbox, WebDAV...) mà không cần biết chi tiết API
// của từng dịch vụ. CHỦ Ý dừng ở mức tối giản này — không tạo package riêng,
// không registry driver động: ChessNote hiện chỉ có 1-2 provider, không cần
// abstraction nặng.

export interface RemoteFileEntry {
  /** Đường dẫn tương đối bên trong `folder`, không có "/" đầu. */
  path: string;
  rev: string;
  serverModified: string;
  deleted: boolean;
}

export type WriteMode =
  | { tag: "add" }
  | { tag: "update"; rev: string }
  | { tag: "overwrite" };

/**
 * Kết quả `listEntries` (Giai đoạn 2.1, 2026-09-13) -- hỗ trợ liệt kê DELTA
 * thay vì luôn liệt kê lại toàn bộ cây remote mỗi lần sync (nguyên nhân chính
 * gây lỗi 429/chậm khi Space nhiều file, xem docs/plans).
 */
export interface ListEntriesResult {
  /** Nếu `full === true`: TOÀN BỘ file hiện có. Nếu `full === false`: CHỈ
   * phần đã thay đổi (thêm/sửa/xoá) kể từ `priorCursor` -- caller (xem
   * `sync_engine.ts:resolveRemoteEntries`) phải tự merge vào bản đã biết
   * trước đó, không được coi đây là toàn bộ remote. */
  entries: RemoteFileEntry[];
  /** Con trỏ để lần gọi sau chỉ nhận delta -- undefined nếu provider không hỗ
   * trợ (WebDAV) hoặc không có cursor khả dụng lần này (vd thư mục chưa tồn
   * tại trên Dropbox). */
  cursor?: string;
  /** true nếu `entries` là danh sách ĐẦY ĐỦ, false nếu chỉ là delta. */
  full: boolean;
}

/** Provider tự phát hiện race lúc ghi (rev/add đã lệch giữa chừng) ném lỗi này
 * thay vì lỗi chung — `sync_engine.ts` coi đây là 1 lượt xung đột bỏ qua an
 * toàn (lần sync sau sẽ thấy trạng thái mới và xử lý lại), không phải lỗi thật. */
export class RemoteConflictError extends Error {
  constructor(public path: string) {
    super(`Xung đột ghi tại ${path}`);
  }
}

export interface SyncProvider {
  /** Tên hiển thị cho thông báo/log, ví dụ "Dropbox", "WebDAV". */
  readonly name: string;

  /** Liệt kê file trong `folder` (đường dẫn tương đối, đã strip prefix) --
   * truyền `priorCursor` (nếu có, từ lần gọi trước) để provider hỗ trợ delta
   * chỉ trả phần thay đổi thay vì liệt kê lại toàn bộ; provider không hỗ trợ
   * bỏ qua tham số này và luôn trả `full: true`. */
  listEntries(folder: string, priorCursor?: string): Promise<ListEntriesResult>;

  download(
    folder: string,
    path: string,
  ): Promise<{ data: Uint8Array; rev: string; serverModified: string }>;

  /** Upload có điều kiện — provider tự quyết cách thực hiện add/update/overwrite
   * đúng ngữ nghĩa của dịch vụ (Dropbox: mode arg; WebDAV: If-Match/If-None-Match). */
  upload(
    folder: string,
    path: string,
    data: Uint8Array,
    mode: WriteMode,
  ): Promise<{ rev: string; serverModified: string }>;

  delete(folder: string, path: string): Promise<void>;
}
