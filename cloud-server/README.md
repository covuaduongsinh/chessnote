# ChessNote Cloud (Phase B — tuỳ chọn)

Server tự host cho đồng bộ đa nền tảng gần-realtime, thay thế/bổ sung cho Dropbox/WebDAV
thông thường (Phase A). Về bản chất là **1 server WebDAV tối giản** — client ChessNote dùng
**nguyên** provider WebDAV đã có ở Phase A (`plugs/sync/webdav_sync.ts`), không cần sửa gì
phía client cho phần lưu file — cộng thêm **1 kênh WebSocket** (`/_push`) đẩy tín hiệu "có gì
mới, đồng bộ ngay" để không phải chờ interval/debounce.

Thiết kế cho dùng **cá nhân/nhóm nhỏ** (giống hướng đã chốt cho AI Gateway) — vài tài khoản
cấu hình tay qua biến môi trường, không có màn đăng ký, không multi-tenant SaaS.

## Chạy thử tại chỗ (local)

```bash
cd cloud-server
npm install
cp .env.example .env   # rồi sửa CHESSNOTE_CLOUD_USERS trong .env
npm run dev            # hoặc: CHESSNOTE_CLOUD_USERS=alice:pass npm start
```

Kiểm tra: `curl http://127.0.0.1:8080/healthz` → `{"ok":true}`.

## Chạy test

```bash
npm test    # vitest — gồm test tích hợp THẬT gọi qua network tới
            # ../plugs/sync/webdav_sync.ts (client thật của ChessNote), không mock
npm run check
```

## Chạy qua Docker

```bash
docker build -t chessnote-cloud .
docker run -d \
  -p 8080:8080 \
  -e CHESSNOTE_CLOUD_USERS="alice:doi-mat-khau-nay" \
  -v chessnote-cloud-data:/data \
  --name chessnote-cloud \
  chessnote-cloud
```

## ⚠️ Bắt buộc dùng TLS (HTTPS/WSS) khi deploy ra internet

Kênh push realtime dùng WebSocket (`ws://` khi chưa có TLS, `wss://` khi có) — nhiều webview
mục tiêu của ChessNote (WKWebView trên Desktop macOS/iOS, Android WebView) áp trình duyệt an
toàn tương đương HTTPS cho trang chính, và có thể chặn kết nối `ws://` (không mã hoá) từ 1
trang/worker đã ở ngữ cảnh an toàn ("mixed content"). Đưa TLS vào **trước** domain của
ChessNote Cloud để tránh vấn đề này hoàn toàn — khuyến nghị dùng
[Caddy](https://caddyserver.com/) (tự xin chứng chỉ Let's Encrypt, cấu hình 3 dòng):

```
mychessnote.example.com {
  reverse_proxy 127.0.0.1:8080
}
```

Nếu chỉ dùng trong LAN nhà riêng (không expose ra internet, không cần push realtime, chỉ dùng
lớp WebDAV file-sync của Phase A) thì `http://` thuần vẫn hoạt động bình thường cho phần
file-sync — chỉ kênh `/_push` (WebSocket) mới cần lưu ý mixed-content nói trên.

## Cấu hình phía ChessNote (Configuration Manager)

1. `chess.webdav.url` = `https://mychessnote.example.com/` (domain/IP của ChessNote Cloud).
2. `chess.webdav.folder` = để trống (mỗi tài khoản trên ChessNote Cloud đã có 1 thư mục gốc
   riêng, không cần thêm 1 lớp thư mục con nữa — nhưng vẫn dùng được nếu muốn).
3. Chạy Command **"Chess: Đăng nhập WebDAV"**, nhập đúng username/password đã đặt trong
   `CHESSNOTE_CLOUD_USERS`.
4. Chạy Command **"Chess: Đồng bộ WebDAV"** để kiểm tra lần đầu.
5. (Tuỳ chọn, cần TLS — xem trên) Bật `chess.webdav.enableRealtimePush` để đồng bộ gần-realtime
   thay vì chờ interval.

Lặp lại bước 1–3 (dùng CÙNG username/password) trên mọi thiết bị khác (Web/Desktop/Mobile) —
mọi thiết bị dùng đúng 1 tài khoản sẽ tự đồng bộ với nhau qua chính server này.

## Kiến trúc

- `src/storage.ts` — lưu file thuần trên filesystem, mỗi user 1 thư mục gốc riêng, ETag =
  sha1(nội dung). Chặn path traversal.
- `src/webdav_xml.ts` — sinh XML `multistatus` cho PROPFIND (RFC 4918, namespace `D:`).
- `src/auth.ts` — Basic Auth (route file) + token base64 qua query string (route `/_push`, vì
  `WebSocket` client-side không gắn được header `Authorization` tuỳ ý).
- `src/push.ts` — đăng ký kết nối WebSocket đang mở theo user, phát tín hiệu `"changed"` (không
  mang payload — thiết bị nhận tự chạy lại `performSync` đầy đủ; giữ đúng nguyên tắc "server
  không cần hiểu nội dung", đặc biệt khi client bật E2EE — server chỉ thấy ciphertext).
- `src/server.ts` — route HTTP (PROPFIND/GET/HEAD/PUT/DELETE/MKCOL) + upgrade WebSocket.

## Còn thiếu / rủi ro đã biết (không giấu)

- **Chưa kiểm chứng bằng tay với 1 deploy thật** (VPS/Docker + domain thật + client thật trên
  ≥2 thiết bị) — mọi kiểm chứng hiện tại là tự động (`npm test`, gồm test tích hợp gọi qua
  network localhost tới client thật, nhưng vẫn là localhost, không phải mạng thật/TLS thật).
- Không có rate-limit/chống brute-force mật khẩu ở tầng auth — chấp nhận được ở quy mô cá
  nhân phía sau 1 domain không công khai rộng, nhưng nên thêm nếu mở ra internet công khai lâu
  dài (ví dụ `fail2ban` ở tầng reverse proxy, hoặc chặn theo IP).
- Không có cơ chế xoay/thu hồi mật khẩu ngoài việc tự sửa `CHESSNOTE_CLOUD_USERS` và khởi động
  lại server (đủ dùng ở quy mô cá nhân, không đáng xây UI quản trị riêng).
- `PROPFIND` đọc TOÀN BỘ nội dung mỗi file để tính ETag mỗi lần liệt kê (`storage.ts:listRecursive`)
  — chấp nhận được cho file Markdown/PGN nhỏ ở quy mô cá nhân, sẽ chậm nếu Space có rất nhiều
  file lớn; có thể tối ưu sau bằng cache ETag theo (path, mtime, size) nếu cần.
