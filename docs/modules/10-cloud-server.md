# Module `cloud-server` — ChessNote Cloud: máy chủ WebDAV tự host + kênh đẩy tín hiệu

> Tài liệu này mô tả mã nguồn tại commit `383bab47be` (2026-09-13). README riêng của module: `cloud-server/README.md`. Phía client: [08](08-sync.md).

## Phần A — Chức năng

### Module này làm gì

Một **máy chủ nhỏ tự dựng** để đồng bộ ghi chú giữa các thiết bị mà không cần Dropbox hay dịch vụ thứ ba. Ưu điểm so với WebDAV thường: khi một thiết bị lưu xong, các thiết bị khác **nhận tín hiệu ngay** và đồng bộ trong vài giây, thay vì chờ chu kỳ.

- Dành cho **cá nhân hoặc nhóm nhỏ**: vài tài khoản cấu hình tay, mỗi tài khoản một thư mục riêng cách ly. Không có màn đăng ký, không phải dịch vụ đa khách hàng.
- Dữ liệu là **file thường trên đĩa** — sao lưu thư mục dữ liệu là sao lưu tất cả.
- Máy chủ **không cần hiểu nội dung**: nếu bạn bật mã hoá đầu cuối, nó chỉ giữ dữ liệu đã mã hoá.

### Cách dùng ngắn gọn

1. Chạy server với `CHESSNOTE_CLOUD_USERS="tên:mật khẩu,…"` (bắt buộc, không có thì server không khởi động).
2. Trong ChessNote: đặt `chess.webdav.url` = địa chỉ server; chạy lệnh "Chess: Đăng nhập WebDAV" nhập đúng tên/mật khẩu; chạy "Chess: Đồng bộ WebDAV".
3. Muốn đồng bộ gần thời gian thực: bật `chess.webdav.enableRealtimePush` (cần HTTPS/WSS khi đưa ra internet).

### Cảnh báo quan trọng

Khi đưa ra internet **bắt buộc dùng HTTPS**: mật khẩu đi trong header Basic Auth, và kênh WebSocket bị trình duyệt/webview chặn nếu là `ws://` trên trang an toàn ("mixed content"). README khuyên đặt Caddy phía trước.

---

## Phần B — Kỹ thuật

### B.1. Tệp

| File | Dòng | Vai trò |
|---|---|---|
| `cloud-server/src/server.ts` | 284 | Định tuyến HTTP (`PROPFIND`/`GET`/`HEAD`/`PUT`/`DELETE`/`MKCOL`) + nâng cấp WebSocket |
| `cloud-server/src/storage.ts` | 180 | Lưu file trên đĩa, ETag, chống path traversal |
| `cloud-server/src/webdav_xml.ts` | 60 | Sinh XML `multistatus` (RFC 4918, namespace `D:`) |
| `cloud-server/src/auth.ts` | 90 | Basic Auth + token query cho `/_push` |
| `cloud-server/src/push.ts` | 60 | Đăng ký kết nối theo user, phát `"changed"` |
| `cloud-server/src/*.test.ts` | 6 file | Có test tích hợp **thật qua mạng** gọi vào `plugs/sync/webdav_sync.ts` |

Dependency: `ws` (ngoại lệ có chủ đích so với quy ước "chỉ Node core" của `ai-sidecar/`, vì tự viết khung WebSocket RFC 6455 dễ sai tinh vi).

### B.2. Luồng

```mermaid
sequenceDiagram
    participant A as Thiết bị A
    participant S as cloud-server
    participant B as Thiết bị B
    B->>S: WebSocket /_push?auth=base64(user:pass)
    A->>S: PUT file, kèm If-Match hoặc If-None-Match
    S->>S: ghi đĩa, ETag = sha1(nội dung)
    S-->>A: 204 (PUT thành công; 201 dành cho MKCOL)
    S->>S: broadcastChanged(user), gộp trong 800 ms
    S-->>B: "changed"
    B->>B: debounce 3 giây, rồi performSync đầy đủ
```

### B.3. Điểm thiết kế

- **ETag = `sha1(nội dung)`** (không dựa `mtime`): phản ánh đúng thay đổi, tránh sai khi nội dung đổi mà `mtime` trùng và ngược lại.
- **Xác thực**: `CHESSNOTE_CLOUD_USERS` phân tích thành `Map<user, password>` (mật khẩu **plaintext trong bộ nhớ**), so sánh bằng `timingSafeEqual`, kể cả khi độ dài khác nhau (vẫn so với chính nó để không lộ độ dài). Định dạng sai → `throw`, server không chạy không xác thực.
- **`/_push` dùng token trong query string** (`base64(user:pass)`) vì `WebSocket` phía client không gắn được header `Authorization` tuỳ ý. Hệ quả: mật khẩu (mã hoá base64, không phải băm) có thể xuất hiện trong log truy cập của reverse proxy.
- **Cách ly người dùng**: thư mục gốc `join(dataDir, username)`; `username` đã được xác thực khớp danh sách nên an toàn làm tên thư mục. `normalizeRelPath` + kiểm `resolve(userRoot, rel) !== abs` chặn path traversal.
- **Ghi có điều kiện** (`PUT`): `If-None-Match: *` → chế độ `add`; có `If-Match` → `update` (so ETag đã bỏ tiền tố `W/` và dấu nháy); không header nào → `overwrite`. Điều kiện không khớp → `PreconditionFailedError` (HTTP 412); thư mục cha thiếu → `ConflictError` (HTTP 409, đúng RFC 4918).
- **Giới hạn thân request**: `100 MB` (`MAX_BODY_BYTES`).
- **Gộp tín hiệu (Giai đoạn 1.2b, 2026-09-13)**: mỗi `PUT`/`DELETE` gọi `broadcastChanged`; hàm gộp các lời gọi trong `800 ms` thành một lần gửi, đọc danh sách kết nối **tại thời điểm timer bắn** (không chụp lúc gọi) để không gửi tới kết nối đã đóng.
- Tín hiệu **không mang dữ liệu** ("chuông báo"); thiết bị nhận tự chạy lại toàn bộ `performSync`. Tín hiệu gửi cả cho thiết bị vừa gây ra thay đổi (vô hại: sync sẽ thấy "không có gì mới").

### B.4. Triển khai

`cloud-server/Dockerfile`; trong `docker-compose.dokploy.yml` là service `chessnote-sync` (cổng 8080, `CHESSNOTE_CLOUD_DATA_DIR=/data`, healthcheck `wget … /healthz`), Traefik định tuyến `Host(chessnote.dsc.edu.vn) && (PathPrefix(/sync) || PathPrefix(/_push))` với middleware `stripprefix /sync` và `priority=100`. `Caddyfile` (cho bản VPS) làm tương tự: `handle /sync/*` với `uri strip_prefix /sync`, và `handle /_push`.

---

## Điểm cần lưu ý và hạn chế

**Thiết kế**
- Không băm mật khẩu, không chống brute-force, không xoay/thu hồi mật khẩu ngoài việc sửa biến môi trường rồi khởi động lại (README: "chấp nhận được ở quy mô cá nhân").
- `PROPFIND` đọc **toàn bộ nội dung mỗi file** để tính ETag mỗi lần liệt kê (`storage.ts:listRecursive`) — chậm khi Space có nhiều file lớn; gợi ý sẵn trong README: cache ETag theo `(path, mtime, size)`.

**Vận hành**
- **Chưa kiểm chứng tay với deploy thật** (VPS + domain + ≥ 2 thiết bị thật): test hiện có chỉ chạy trên localhost.
- Bắt buộc TLS khi ra internet (xem phần A).
- Sao lưu = sao lưu thư mục `CHESSNOTE_CLOUD_DATA_DIR`.

**Điều đáng ngờ**
- **Đã sửa 2026-09-29 — mật khẩu mặc định ghi cứng**: trước đây compose có giá trị dự phòng công khai (`SYNC_USERS` → `admin:MatKhauSync2026!`; `SB_AUTH_USER` → `admin:MatKhauManh2026!`). Nay `SYNC_USERS` (cả hai compose) và `SB_AUTH_USER` (bản VPS) dùng cú pháp `${VAR:?thông báo}` — thiếu biến thì `docker compose` **dừng với lỗi rõ ràng**; `.env.vps.example` chỉ còn placeholder `DOI_MAT_KHAU_NAY` và `scripts/deploy-vps.sh` từ chối triển khai nếu `.env` còn placeholder. ⚠️ **Việc bạn cần làm**: (1) đặt `SYNC_USERS` trong biến môi trường Dokploy trước lần redeploy kế tiếp, nếu không stack sẽ không lên; (2) **hai mật khẩu cũ đã nằm trong lịch sử git — nếu từng dùng thật, hãy đổi**. Chưa xử lý: `docker-compose.dokploy.yml` vẫn để `SB_USER=${SB_USER:-}` (mặc định rỗng = ứng dụng web không đòi đăng nhập) vì có thể bạn cố ý chạy sau lớp xác thực khác.
- Token `/_push` là `base64(user:pass)` trong URL: có thể lọt vào log truy cập của Traefik/Caddy.

## Đường dẫn tham chiếu nhanh

| Muốn xem… | Mở file |
|---|---|
| Các route, WebSocket | **`cloud-server/src/server.ts`** |
| Lưu file, ETag, chống path traversal | **`cloud-server/src/storage.ts`** |
| Xác thực | `cloud-server/src/auth.ts` |
| Phát tín hiệu | `cloud-server/src/push.ts` |
| Hướng dẫn chạy/Docker/TLS | `cloud-server/README.md`, `.env.example` |
| Cấu hình deploy | `docker-compose.dokploy.yml`, `Caddyfile`, `scripts/deploy-vps.sh` |
| Client | `plugs/sync/webdav_sync.ts`, `plugs/sync/push_trigger.ts` |
