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

/** Phát tín hiệu tới TẤT CẢ kết nối của `username`, kể cả kết nối vừa gây ra
 * thay đổi (client tự gọi lại sync sẽ chỉ thấy "không có gì mới" — vô hại,
 * đơn giản hơn là phải theo dõi "ai vừa ghi" để loại trừ chính họ). */
export function broadcastChanged(username: string): void {
  const set = connectionsByUser.get(username);
  if (!set) return;
  for (const ws of set) {
    if (ws.readyState === ws.OPEN) {
      ws.send("changed");
    }
  }
}

/** Chỉ dùng cho test — đếm số kết nối đang mở của 1 user. */
export function connectionCountForTests(username: string): number {
  return connectionsByUser.get(username)?.size ?? 0;
}
