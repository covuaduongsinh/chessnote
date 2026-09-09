# Giai đoạn A — Đồng bộ đa nền tảng (Dropbox + WebDAV), hoàn tất

> **Ngày**: 2026-09-09
> **Bối cảnh**: người dùng muốn ChessNote đồng bộ được Web/Desktop/Mobile giống Super
> Productivity. Kế hoạch chi tiết (Phase 0 + Phase A + định hướng Phase B) đã được duyệt qua
> plan mode cùng ngày — xem lại tại lịch sử phiên nếu cần, không lặp lại toàn bộ ở đây. Tài
> liệu này chỉ ghi **những gì đã triển khai thật**, khác với `04-phase-4-multi-platform-and-sync.md`
> (chỉ là định hướng gốc, tên file/kiến trúc trong đó KHÔNG khớp code thật).

---

## Tóm tắt điều hành

Đã triển khai xong **Phase 0** (bắt buộc) và toàn bộ **Phase A** (Dropbox + WebDAV sync, tự
động trigger theo 3 cơ chế, trạng thái gộp, E2EE tuỳ chọn). `npm run check` sạch, toàn bộ
vitest suite của repo xanh. **Đã kiểm chứng tay thật trên Web với 1 Dropbox App thật —
đăng nhập + đồng bộ thành công** (xem "NHẬT KÝ KIỂM CHỨNG" dưới, 2026-09-10). Desktop/Mobile/
WebDAV-server-thật vẫn chưa kiểm chứng — xem mục "Còn thiếu" cuối file.

## Phát hiện quan trọng nhất (Phase 0)

Mọi `fetch()` gọi từ trong 1 Plug bị monkey-patch (`client/plugos/worker_runtime.ts:143-170`)
để luôn đi qua proxy `/.proxy/` của server Rust. Desktop (Tauri, bundle tĩnh) và Mobile
(Capacitor, không `server.url`) **không có server Rust thật** → mọi `fetch()` trong plug, kể cả
gọi thẳng domain public như `api.dropboxapi.com`, sẽ lỗi trên 2 nền tảng này. Dropbox sync
(đã code từ trước, "Giai đoạn 4" cũ) không có gate `isCapacitor()` nào — lệnh "Đồng bộ Dropbox"
hiện ra trên Mobile/Desktop nhưng rất có thể âm thầm lỗi khi bấm.

**Đã có lối thoát chính thức, chưa ai dùng**: `client/plugos/worker_runtime.ts:140` lưu sẵn
`globalThis.nativeFetch` (bản gốc, không bị monkey-patch), type đã khai báo ở
`plug-api/lib/native_fetch.ts`. Chỉ cần đổi call site.

## Đã triển khai

### Phase 0
- `plugs/sync/dropbox_sync.ts`: `fetch()` → `nativeFetch()` (3 vị trí:
  `exchangeCodeForTokens`, `refreshAccessToken`, `apiFetch`).
- `plugs/sync/dropbox_sync.test.ts`: mock `nativeFetch` thay `fetch`.
- `client/spaces/platform.ts` (mới): tách `detectStandaloneEnv()` từ `client.ts` (logic
  `isStandalone` cũ), dùng lại cho syscall mới.
- Syscall mới `system.hasServerProxy` (`client/plugos/syscalls/system.ts`,
  `plug-api/syscalls/system.ts`) — tổng quát hơn `isCapacitor()` (bao cả case Tauri Desktop
  không server), chưa bắt buộc phải đổi các chỗ đang dùng `isCapacitor()` cũ.

### Phase A.1 — Tổng quát hoá interface
- `plugs/sync/sync_provider.ts` (mới): interface `SyncProvider` tối giản + `RemoteFileEntry`/
  `WriteMode`/`RemoteConflictError`.
- `plugs/sync/sync_engine.ts` (mới): thuật toán `performSync` tách từ `dropbox_bridge.ts`,
  tổng quát hoá theo `SyncProvider`. **Bug thật phát hiện & sửa khi tổng quát hoá**: state file
  (`_dropbox/sync-state.json`) dùng chung sẽ làm Dropbox/WebDAV ghi đè tracking của nhau —
  giờ `stateFilePathFor()` cho mỗi provider 1 file riêng (Dropbox giữ path cũ để không ép
  người dùng hiện tại re-sync).
- `plugs/sync/dropbox_provider.ts` (mới): adapter `DropboxSyncProvider`.
- `plugs/sync/dropbox_bridge.ts`: rút gọn, chỉ còn config + 3 Command + `runDropboxSync()`
  (dùng chung cho Command và auto-trigger) + tracking lần sync/lỗi gần nhất.

### Phase A.2 — WebDAV
- `plugs/sync/webdav_sync.ts` (mới): client thuần (PROPFIND/GET/PUT/DELETE/MKCOL), Basic Auth,
  conditional write qua `If-Match`/`If-None-Match`, tự tạo thư mục cha khi PUT gặp 409.
- `plugs/sync/webdav_provider.ts`, `plugs/sync/webdav_bridge.ts` (mới): adapter + config/Command
  (Đăng nhập/Đồng bộ/Đăng xuất WebDAV), dùng chung `sync_engine.ts`.
- **Chưa kiểm chứng với server WebDAV thật nào** (Nextcloud/rclone/NAS) — parser XML dùng regex
  (không có DOMParser trong Worker sandbox), khoan dung namespace prefix nhưng không phải XML
  parser đầy đủ.

### Phase A.3 — Auto-trigger (cả 3 bước, không lùi bước nào)
- `plugs/sync/auto_trigger.ts` (mới): `runAllConfiguredSyncs()` chạy Dropbox+WebDAV song song,
  lock riêng theo provider, chỉ flash notification khi có gì đáng chú ý.
- Bước 1 — interval: config `chess.sync.autoIntervalMinutes` (default 5, 0=tắt).
- Bước 2 — debounce: hook `page:saved`, 30s debounce collapse nhiều lần sửa liên tiếp.
- Bước 3 — resume/focus: event mới `editor:activityResumed` (`plug-api/types/client.ts`),
  dispatch từ `client.ts:registerActivityResumeListeners()` — `visibilitychange`+`focus` cho
  Web/Tauri Desktop (webview thật, không cần `@tauri-apps/api`), `@capacitor/app` `resume` cho
  Mobile (dynamic import, gate theo `window.Capacitor`). Thêm dependency `@capacitor/app@^8.1.1`
  (khớp version các `@capacitor/*` khác), đã chạy `npx cap sync android` — cập nhật
  `android/capacitor.settings.gradle` + `android/app/capacitor.build.gradle` tự động.

### Phase A.4 — Trạng thái
- Command "Chess: Trạng thái đồng bộ" (`auto_trigger.ts:commandSyncStatus`) gộp trạng thái
  Dropbox+WebDAV (cấu hình/đăng nhập/lần sync gần nhất/lỗi gần nhất) vào 1 notification. Không
  xây UI riêng — Configuration Manager thô đủ dùng.

### Phase A.5 — E2EE tuỳ chọn
- `plugs/sync/e2ee.ts` (mới): PBKDF2 (600k vòng) + AES-GCM 256-bit, IV ngẫu nhiên mỗi file.
  **Salt cố định (hardcode), có chủ đích** — tránh bài toán "gà và trứng" đồng bộ salt tới mọi
  thiết bị trước khi thiết bị đó giải mã được gì; mọi thiết bị chỉ cần đúng mật khẩu là suy ra
  đúng key ngay. `EncryptingSyncProvider` bọc quanh `SyncProvider` bất kỳ theo decorator pattern
  — `sync_engine.ts` không cần biết gì về mã hoá (kể cả logic ghi file `.conflict-*.md` vẫn thấy
  plaintext qua `provider.download()`).
- `plugs/sync/e2ee_bridge.ts` (mới): config `chess.sync.e2ee.enabled`, Command "Mở khoá"/"Khoá
  lại", `wrapProviderWithE2eeIfEnabled()` — fail-closed (ném lỗi rõ ràng nếu bật E2EE nhưng
  chưa mở khoá, không bao giờ âm thầm sync plaintext).

### Phase B
Chỉ định hướng (không code) — xem file plan gốc của phiên: mô hình phù hợp hơn SuperSync đầy đủ
là 1 provider giống Dropbox/WebDAV + kênh WebSocket đẩy tín hiệu "có gì mới", tái dùng nguyên
vẹn thuật toán conflict-resolution + E2EE đã có.

## Kiểm chứng đã làm

- `npm run check`: sạch (không lỗi type nào) sau mỗi bước.
- `npx vitest run`: toàn bộ suite xanh, gồm 105 test mới trong `plugs/sync/`
  (`dropbox_sync`, `dropbox_provider`, `webdav_sync`, `sync_engine`, `auto_trigger`, `e2ee`,
  `e2ee_bridge`).
- `npx cap sync android`: chạy thành công, cập nhật đúng 2 file gradle liên quan tới
  `@capacitor/app`, không đụng gì khác.

## NHẬT KÝ KIỂM CHỨNG — Dropbox sync, kiểm chứng tay thật (2026-09-10)

Đã kiểm chứng bằng tay thật trên **Web** (`cargo run -p silverbullet -- my_space`, mở qua
trình duyệt thật của người dùng — không phải browser tự động của Claude), với 1 Dropbox App
thật (ID `8419411`) do người dùng tự tạo trên dropbox.com/developers/apps:

- **Đăng nhập OAuth2 PKCE thật**: thành công ngay lần đầu ("Chess: Đăng nhập Dropbox").
- **Đồng bộ lần đầu thất bại đúng như dự đoán rủi ro trong plan gốc** — nhưng vì lý do KHÁC:
  không phải path-encoding/ETag như lo ngại ban đầu, mà Dropbox trả **HTTP 400**: `"...is not
  permitted to access this endpoint because it does not have the required scope
  'files.metadata.read'"`. Nguyên nhân: Dropbox App mới tạo **không tự động có scope nào** —
  phải tick tay ở tab "Permissions" trên App Console. Ghi lại chi tiết ở
  `[[project_dropbox_scope_gotcha]]` (memory).
- **Đã sửa `plugs/sync/dropbox_sync.ts`** ngay trong lúc kiểm chứng: thêm hàm `describeError()`
  đọc `error_summary` thật từ response body Dropbox cho MỌI nhánh lỗi (upload/download/delete/
  list_folder/continue) — trước đó chỉ báo mã HTTP trần, không đủ để tự chẩn đoán. Thêm 2 test
  mới (`dropbox_sync.test.ts`) xác nhận `error_summary` được lộ ra đúng.
- Sau khi người dùng tick đủ 4 scope (`files.metadata.{read,write}`, `files.content.{read,write}`)
  và đăng nhập lại (token cũ không tự có scope mới): **"Chess: Đồng bộ Dropbox" chạy thành
  công thật** — xác nhận bằng lời người dùng, không chỉ tin log.
- **Bug phụ phát hiện được trong lúc debug** (không liên quan Dropbox, ảnh hưởng UI
  Configuration Manager): mục cấu hình mới (ví dụ "Dropbox Sync") không hiện trong
  Configuration Manager ở lần tải trang đầu, dù dữ liệu/logic hoàn toàn đúng (xác nhận qua
  console debug: gọi tay `plug.invoke("dropboxInit", [])` chạy đúng ngay). Nghi do trang boot
  3 lần liên tiếp trong 1 lần tải, gây race condition với dispatch `editor:init`. **Không chặn
  chức năng** (Command vẫn đọc/ghi đúng config đã lưu CONFIG.md dù UI không hiện) — tải lại
  trang (F5) vài lần là thấy lại. Chi tiết đầy đủ ở `[[project_editor_init_flaky_dispatch]]`
  (memory) — CHƯA điều tra tận gốc, cần 1 phiên riêng.

## Còn thiếu — cần người dùng tự làm (không tự động hoá được)

1. **Kiểm chứng tay Desktop (Tauri)** (`npm run desktop:dev`) và **Mobile**
   (`npm run mobile:run:android` trên thiết bị/emulator thật) — Web đã kiểm chứng xong (trên),
   còn 2 nền tảng này chưa; đặc biệt trên Mobile cần xác nhận `editor:activityResumed`
   (Capacitor `App` `resume`) thực sự bắn ra khi đưa app từ background lên foreground.
2. **Kiểm chứng với 1 server WebDAV thật** (khuyến nghị Nextcloud hoặc `rclone serve webdav`) —
   PROPFIND/MKCOL/If-Match có thể khác nhau giữa các server.
3. **Điều tra tận gốc bug `editor:init` chập chờn** (mục trên) — hiện chỉ có workaround (F5),
   chưa sửa nguyên nhân.
