# Giai đoạn B — ChessNote Cloud (đồng bộ gần-realtime, tự host)

> **Ngày**: 2026-09-09 (tiếp nối `2026-09-09-giai-doan-a-dong-bo-da-nen-tang.md`)
> **Bối cảnh**: Giai đoạn B ban đầu chỉ định hướng sơ bộ trong plan gốc (không thiết kế chi
> tiết, để làm sau). Người dùng sau đó yêu cầu triển khai luôn.

## Quyết định thiết kế

Đúng định hướng plan gốc: "ChessNote Cloud" **về bản chất là 1 provider giống Dropbox/WebDAV
của Phase A** (không cần kiến trúc SuperSync đầy đủ với vector-clock/op-log ở mức entity — dữ
liệu ChessNote là file thô, không phải task JSON mịn như Super Productivity), **cộng thêm 1
kênh đẩy tín hiệu** thay cho việc chờ interval polling.

Các quyết định kỹ thuật cụ thể hoá thêm khi triển khai:

1. **Server WebDAV tối giản, KHÔNG phải thư viện WebDAV đầy đủ** — chỉ implement đúng subset
   mà `plugs/sync/webdav_sync.ts` (client, đã viết ở Phase A) cần: PROPFIND (Depth: infinity),
   GET/HEAD, PUT (If-Match/If-None-Match), DELETE, MKCOL. **Không cần sửa gì phía client cho
   phần lưu file** — chỉ cần trỏ `chess.webdav.url` vào ChessNote Cloud.
2. **WebSocket (qua package `ws`) thay Server-Sent Events** — cả hai đều thoả yêu cầu "kênh
   đẩy tín hiệu", nhưng EventSource-trong-Web-Worker (nơi plug chạy) là bổ sung tương đối gần
   đây, chưa chắc có mặt đủ rộng trên mọi webview mục tiêu (WebView2/WKWebView/Android WebView);
   WebSocket-trong-Worker ổn định/lâu đời hơn nhiều. Đánh đổi: cần TLS (`wss://`) khi deploy
   thật để tránh mixed-content — đã ghi rõ trong `cloud-server/README.md`.
3. **Dependency `ws`** — ngoại lệ có chủ đích với quy ước "chỉ dùng Node core" của
   `ai-sidecar/`: tự viết WebSocket handshake/framing (RFC 6455) đúng chuẩn là việc dễ sai tinh
   vi (masking, ping/pong, close handshake), rủi ro không đáng để tránh 1 dependency nhỏ, phổ
   biến, ít bảo trì.
4. **Auth**: Basic Auth cho route file (khớp `WebDavSyncProvider` đã có, không cần code mới
   phía client), token base64(user:pass) qua query string cho route `/_push` (WebSocket
   client-side không gắn được header `Authorization` tuỳ ý). Danh sách tài khoản cấu hình tay
   qua biến môi trường `CHESSNOTE_CLOUD_USERS` — thiết kế CÁ NHÂN/nhóm nhỏ, không multi-tenant
   SaaS (nhất quán với quyết định đã chốt cho AI Gateway).
5. **Lưu trữ**: filesystem thuần, mỗi user 1 thư mục gốc riêng (cách ly hoàn toàn). ETag =
   sha1(nội dung) — phản ánh đúng thay đổi nội dung, không lệ thuộc mtime.
6. **Payload push rỗng có chủ đích** — chỉ là 1 "chuông báo" `"changed"`, không mang delta.
   Thiết bị nhận tự chạy lại `performSync` đầy đủ. Giữ đúng nguyên tắc "server không cần hiểu
   nội dung" — quan trọng khi client bật E2EE (Phase A.5): server chỉ thấy ciphertext.

## Đã triển khai

### `cloud-server/` (mới, dự án Node.js độc lập — cùng style `ai-sidecar/`)
- `src/storage.ts`: filesystem storage, chặn path traversal, ETag sha1, 4 lỗi định danh
  (`NotFoundError`/`PreconditionFailedError`/`ConflictError`/`AlreadyExistsCollectionError`).
- `src/webdav_xml.ts`: sinh XML `multistatus` chuẩn RFC 4918 (namespace `D:`).
- `src/auth.ts`: parse `CHESSNOTE_CLOUD_USERS`, Basic Auth header + token query-string, so
  sánh mật khẩu constant-time.
- `src/push.ts`: đăng ký/broadcast kết nối WebSocket theo user.
- `src/server.ts`: route HTTP đầy đủ + upgrade WebSocket, `createRequestHandler`/
  `createPushUpgradeHandler` export riêng để test được (không tự mở cổng khi import).
- `.env.example`, `README.md` (hướng dẫn tự host, CẢNH BÁO bắt buộc TLS cho push), `Dockerfile`.

### Client (`plugs/sync/`)
- `push_trigger.ts` (mới): kết nối `WebSocket` tới `/_push`, gọi `runAllConfiguredSyncs()` khi
  nhận tín hiệu, tự reconnect với exponential backoff (5s → tối đa 5 phút), gate theo config
  `chess.webdav.enableRealtimePush` (mặc định tắt — không ảnh hưởng người dùng Dropbox/WebDAV
  thông thường). Gọi `notifyCredentialsChanged()` từ `webdav_bridge.ts` sau đăng nhập/đăng
  xuất để không phải chờ hết vòng backoff.
- `webdav_bridge.ts`: thêm lời gọi `notifyCredentialsChanged()`.
- `sync.plug.yaml`: đăng ký `pushTriggerInit` (event `editor:init`).

### ⚠️ Import cycle có chủ đích, đã kiểm chứng an toàn
`webdav_bridge.ts` → `push_trigger.ts` → `auto_trigger.ts` → `webdav_bridge.ts`. An toàn vì mọi
lời gọi chéo nằm TRONG thân hàm (gọi muộn), không phải ở top-level lúc module evaluate — đã
viết `plugs/sync/module_graph.test.ts` import CẢ CHUỖI KHÔNG MOCK (chỉ mock syscalls) để xác
nhận thật, không chỉ tin lý thuyết ESM.

## Kiểm chứng đã làm

- `cloud-server/`: `npm run check` sạch; `npm test` (vitest riêng của dự án con) — 47 test
  pass, gồm **test tích hợp thật** (`webdav_integration.test.ts`, `push_integration.test.ts`):
  dựng 1 server thật trên localhost, gọi THẲNG các hàm client thật trong
  `plugs/sync/webdav_sync.ts` (repo gốc) qua HTTP/WebSocket thật qua network — không mock giao
  thức ở bất kỳ phía nào. Đây là bài test có giá trị cao nhất trong cả đợt Phase B: xác nhận
  client Phase A và server Phase B THỰC SỰ nói cùng 1 "ngôn ngữ" (path encoding, ETag, header
  If-Match/If-None-Match, mapping mã lỗi 412/409/404).
- Root project: `npm run check` sạch; `npx vitest run` — toàn bộ suite xanh (client/plug-api/plugs),
  gồm `plugs/sync/push_trigger.test.ts` (13 test) và `plugs/sync/module_graph.test.ts` (2 test).

## Còn thiếu — cần người dùng tự làm (không tự động hoá được)

1. **Deploy thật 1 instance** (VPS/Docker + domain + TLS qua Caddy/nginx) — mọi test tích hợp
   hiện tại chỉ chạy qua `localhost`, chưa qua mạng thật/TLS thật/reverse proxy thật.
2. **Kiểm chứng bằng tay trên ≥2 thiết bị thật** (ví dụ Desktop + Mobile, hoặc 2 máy): đăng
   nhập cùng 1 tài khoản ChessNote Cloud trên cả hai, sửa 1 file ở máy A, xác nhận máy B tự
   đồng bộ — cả qua interval bình thường VÀ (nếu bật) qua push realtime (sửa xong, chờ vài giây
   xem máy B có tự cập nhật ngay không, không cần đợi hết interval).
3. **Xác nhận WebSocket-trong-Worker hoạt động thật trên từng webview mục tiêu** — đã chọn
   WebSocket vì tin nó ổn định hơn EventSource ở Worker context trên WebView2/WKWebView/Android
   WebView, nhưng đây vẫn là suy luận dựa trên hiểu biết chung, KHÔNG phải đã tự chạy thử trên
   từng nền tảng. Nếu gặp lỗi "WebSocket không tồn tại" trên 1 nền tảng cụ thể, code đã có
   fallback graceful (`typeof WebSocket === "undefined"` → log cảnh báo, không throw) nhưng
   người dùng nền tảng đó sẽ không có push realtime, chỉ còn interval/debounce.
