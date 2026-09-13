// Đăng ký các kết nối WebSocket đang mở theo user, để phát tín hiệu "có gì
// mới, đồng bộ ngay" tới MỌI thiết bị khác của CÙNG user khi có 1 thay đổi
// ghi/xoá thành công — thay cho việc các thiết bị phải tự polling theo
// interval. Payload rỗng có chủ đích: đây chỉ là 1 "chuông báo", không phải
// kênh truyền delta — thiết bị nhận tín hiệu vẫn tự chạy lại `performSync`
// đầy đủ (xem `plugs/sync/push_trigger.ts` phía client) để tự nó xác định
// đúng cái gì đã đổi, giữ đúng nguyên tắc "server không cần hiểu nội dung"
// (nhất là khi client bật E2EE — server chỉ thấy ciphertext).
import type { WebSocket } from "ws";

const connectionsByUser = new Map<string, Set<WebSocket>>();

export function registerConnection(username: string, ws: WebSocket): void {
  let set = connectionsByUser.get(username);
  if (!set) {
    set = new Set();
    connectionsByUser.set(username, set);
  }
  set.add(ws);
  ws.once("close", () => {
    set!.delete(ws);
    if (set!.size === 0) connectionsByUser.delete(username);
  });
}

// Giai đoạn 1.2(b) (2026-09-13): mỗi PUT/DELETE gọi `broadcastChanged` riêng
// (server.ts) -- 1 lượt sync ghi N file ở thiết bị A phát ra N tín hiệu gần
// như liên tiếp tới thiết bị B, có thể xếp hàng nhiều lượt full-sync thừa dù
// phía client đã debounce (push_trigger.ts, Giai đoạn 1.2a) -- gộp tại gốc để
// giảm tải mạng/CPU cho MỌI client, kể cả client cũ chưa cập nhật debounce.
const BROADCAST_COALESCE_MS = 800;
const pendingBroadcastByUser = new Map<string, ReturnType<typeof setTimeout>>();

/** Phát tín hiệu tới TẤT CẢ kết nối của `username`, kể cả kết nối vừa gây ra
 * thay đổi (client tự gọi lại sync sẽ chỉ thấy "không có gì mới" — vô hại,
 * đơn giản hơn là phải theo dõi "ai vừa ghi" để loại trừ chính họ).
 *
 * Gộp (coalesce) nhiều lần gọi liên tiếp trong `BROADCAST_COALESCE_MS` thành
 * đúng 1 lần gửi thật -- đọc `connectionsByUser` tại THỜI ĐIỂM timer bắn (không
 * snapshot lúc gọi hàm này), để không gửi nhầm tới 1 kết nối đã đóng hoặc bỏ
 * lỡ 1 kết nối mới mở trong lúc chờ. */
export function broadcastChanged(username: string): void {
  if (pendingBroadcastByUser.has(username)) return; // đã có 1 lần gửi đang chờ -- gộp vào đó
  const timer = setTimeout(() => {
    pendingBroadcastByUser.delete(username);
    const set = connectionsByUser.get(username);
    if (!set) return;
    for (const ws of set) {
      if (ws.readyState === ws.OPEN) {
        ws.send("changed");
      }
    }
  }, BROADCAST_COALESCE_MS);
  pendingBroadcastByUser.set(username, timer);
}

/** Chỉ dùng cho test — đếm số kết nối đang mở của 1 user. */
export function connectionCountForTests(username: string): number {
  return connectionsByUser.get(username)?.size ?? 0;
}
