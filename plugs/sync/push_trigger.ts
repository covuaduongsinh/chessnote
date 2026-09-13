// Kênh đẩy tín hiệu realtime của ChessNote Cloud (Phase B) — kết nối
// WebSocket tới `/_push` của `cloud-server/`, đồng bộ ngay khi nhận tín hiệu
// "changed" thay vì chờ interval/debounce (Giai đoạn A.3). CHỈ áp dụng khi
// `chess.webdav.url` đang trỏ vào 1 ChessNote Cloud thật (có endpoint
// `/_push`) — Dropbox và WebDAV thông thường (Nextcloud, rclone...) KHÔNG có
// endpoint này, bật tuỳ chọn này ở đó sẽ chỉ khiến kết nối lặp lại thất bại
// (đã xử lý: exponential backoff, không spam lỗi, tự thôi log sau vài lần).
//
// Dùng `WebSocket` global thay `EventSource`: hỗ trợ trong Web Worker sandbox
// (nơi plug này chạy) ổn định/lâu đời hơn nhiều trên các webview engine mục
// tiêu (WebView2, WKWebView, Android WebView) — EventSource-trong-Worker là
// bổ sung tương đối gần đây, chưa chắc có mặt đủ rộng.
import { clientStore, config } from "@silverbulletmd/silverbullet/syscalls";
import type { WebDavAuth } from "./webdav_sync.ts";
import { runAllConfiguredSyncs } from "./auto_trigger.ts";

const CREDENTIALS_KEY = "webdavCredentials"; // khớp key trong webdav_bridge.ts

const INITIAL_RECONNECT_DELAY_MS = 5_000;
const MAX_RECONNECT_DELAY_MS = 5 * 60_000;

// Giai đoạn 1.2(a) (2026-09-13): 1 lượt sync ở thiết bị khác ghi N file ->
// server phát N tín hiệu "changed" gần như liên tiếp (mỗi PUT/DELETE 1 tín
// hiệu riêng, xem cloud-server/src/push.ts) -- không debounce ở đây thì mỗi
// tín hiệu gọi thẳng `runAllConfiguredSyncs()`, có thể xếp hàng N lượt
// full-sync thừa dù `providerLocks` (auto_trigger.ts) đã chặn được các lượt
// CHỒNG LẤP thật sự đang chạy. Debounce ngắn (không phải 30s như
// DEBOUNCE_AFTER_SAVE_MS ở auto_trigger.ts -- đây là kênh "realtime", không
// nên trễ lâu) gộp cả 1 burst tín hiệu thành đúng 1 lượt sync sau khi burst
// lắng xuống.
const PUSH_DEBOUNCE_MS = 3_000;

let socket: WebSocket | undefined;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
let pushDebounceTimer: ReturnType<typeof setTimeout> | undefined;

export function buildPushUrl(webdavUrl: string, auth: WebDavAuth): string {
  const u = new URL(webdavUrl);
  const wsProtocol = u.protocol === "https:" ? "wss:" : "ws:";
  const token = btoa(`${auth.username}:${auth.password}`);
  return `${wsProtocol}//${u.host}/_push?auth=${encodeURIComponent(token)}`;
}

/** Init hook (editor:init) — đăng ký cấu hình + thử kết nối lần đầu.
 * Lưu ý: giống `chess.sync.autoIntervalMinutes` ở `auto_trigger.ts`, đổi cờ
 * này chỉ có hiệu lực sau khi mở lại/tải lại (không tự phát hiện live). */
export async function initPushTrigger() {
  await config.define("chess.webdav.enableRealtimePush", {
    description:
      "Bật kênh đẩy tín hiệu realtime của ChessNote Cloud (server tự host CÓ hỗ trợ " +
      "/_push, xem cloud-server/) — đồng bộ ngay khi thiết bị khác thay đổi, thay vì chờ " +
      "interval/debounce. KHÔNG áp dụng cho Dropbox hoặc WebDAV thông thường (Nextcloud, " +
      "rclone...) — chỉ ChessNote Cloud mới có endpoint này.",
    type: "boolean",
    default: false,
    ui: { category: "WebDAV Sync", label: "Đẩy tín hiệu realtime (ChessNote Cloud)", priority: 3 },
  });
  await syncConnectionWithConfig();
}

/** Gọi từ `webdav_bridge.ts` ngay sau đăng nhập/đăng xuất WebDAV — để không
 * phải chờ hết vòng backoff mới nhận ra vừa có credential mới/bị xoá. */
export async function notifyCredentialsChanged() {
  disconnect();
  await syncConnectionWithConfig();
}

function disconnect() {
  if (reconnectTimer !== undefined) {
    clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }
  if (pushDebounceTimer !== undefined) {
    clearTimeout(pushDebounceTimer);
    pushDebounceTimer = undefined;
  }
  reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
  socket?.close();
  socket = undefined;
}

async function syncConnectionWithConfig() {
  const enabled = await config.get<boolean>("chess.webdav.enableRealtimePush", false);
  if (!enabled) {
    disconnect();
    return;
  }
  if (socket) return; // đã có kết nối (hoặc đang chờ mở) -- không mở thêm
  await connect();
}

async function connect(): Promise<void> {
  if (typeof WebSocket === "undefined") {
    console.warn(
      "[chess sync push] Không có WebSocket trong môi trường này -- bỏ qua kênh push realtime.",
    );
    return;
  }
  const webdavUrl = await config.get<string>("chess.webdav.url", "");
  const auth: WebDavAuth | undefined = await clientStore.get(CREDENTIALS_KEY);
  if (!webdavUrl || !auth) {
    scheduleReconnect(); // chưa cấu hình/đăng nhập WebDAV -- thử lại sau
    return;
  }

  const ws = new WebSocket(buildPushUrl(webdavUrl, auth));
  ws.onopen = () => {
    reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS; // kết nối khoẻ -- reset backoff
  };
  ws.onmessage = () => {
    if (pushDebounceTimer !== undefined) clearTimeout(pushDebounceTimer);
    pushDebounceTimer = setTimeout(() => {
      pushDebounceTimer = undefined;
      void runAllConfiguredSyncs();
    }, PUSH_DEBOUNCE_MS);
  };
  ws.onclose = () => {
    if (socket === ws) socket = undefined;
    scheduleReconnect();
  };
  ws.onerror = () => {
    ws.close(); // onclose (trên) lo phần lên lịch reconnect
  };
  socket = ws;
}

function scheduleReconnect() {
  if (reconnectTimer !== undefined) return;
  const delay = reconnectDelayMs;
  reconnectDelayMs = Math.min(reconnectDelayMs * 2, MAX_RECONNECT_DELAY_MS);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined;
    void syncConnectionWithConfig();
  }, delay);
}
