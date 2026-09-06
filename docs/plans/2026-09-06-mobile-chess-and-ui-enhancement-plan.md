# Kế Hoạch Khắc Phục Lỗi Hiển Thị Bàn Cờ FEN/PGN, Menu Mobile & Nâng Cấp Toàn Diện ChessNote Mobile

## 1. Mô Tả Mục Tiêu & Phân Tích Hiện Trạng

Dựa trên ảnh chụp màn hình `Screenshot_20260906_230549_ChessNote.jpg` và phản hồi từ người dùng:
1. **Khối mã FEN & PGN chưa hiển thị bàn cờ và bảng điều khiển nước đi**:
   - Khối ```pgn ... ``` và ```fen ... ``` chỉ hiển thị dạng text/markdown thô, không kích hoạt widget bàn cờ tương tác.
   - **Nguyên nhân gốc rễ**: Lớp `WorkerSandbox` đang cố tải worker script từ URL HTTP `http://localhost/.fs/...`. Trong môi trường WebView độc lập trên Mobile (Capacitor), không có backend HTTP phục vụ endpoint này (trả về 404), khiến Web Worker của plug `chess.plug.js` và các plug hệ thống khác không khởi động được -> `CodeWidgetHook` không đăng ký được handler `fen`, `pgn`, `puzzle`.
2. **Nút menu 3 dấu gạch (`☰`) không có phản ứng khi bấm**:
   - **Nguyên nhân 1 (CSS)**: Trong file `client/styles/top.scss`, class `.sb-actions.hamburger` dùng selector `&.open:hover`. Trên màn hình cảm ứng di động không có sự kiện `:hover`, nên menu không bao giờ bung mở khi có class `.open`.
   - **Nguyên nhân 2 (Sự kiện touch & blur)**: Sự kiện `onBlur` trên nút bấm dập tắt class `open` ngay khi chạm. Đồng thời nút menu bị thiếu thuộc tính `dropdown: false` nên bị xếp nhầm vị trí.
3. **Nâng cấp trải nghiệm người dùng & Hệ thống mô-đun trên Mobile**:
   - Khởi chạy toàn bộ hệ thống Plug (Chess, Editor, Core, Index, Emoji, Sync) 100% Offline qua cơ chế **Blob URL In-Memory Worker**.
   - Thêm thanh công cụ phím tắt / Action Bar tối ưu cho Mobile (Command Palette, Quick Open, Thêm ván cờ PGN/FEN nhanh).
   - Tối ưu giao diện bàn cờ cờ vua co giãn vừa vặn màn hình điện thoại, hỗ trợ chạm 2 chạm (chạm ô chọn quân -> chạm ô đến) và thanh điều khiển nước đi (First, Prev, Play/Pause, Next, Last, Flip Board).

---

## 2. Thay Đổi Đề Xuất Chi Tiết (Proposed Changes)

### 2.1. Khắc Phục Cơ Chế Khởi Chạy Plug Worker (Blob URL In-Memory Worker)
- **File cần chỉnh sửa**: [`client/client_system.ts`](file:///D:/code/chessnote/client/client_system.ts) & [`client/plugos/sandboxes/worker_sandbox.ts`](file:///D:/code/chessnote/client/plugos/sandboxes/worker_sandbox.ts)
  - Trong `client_system.ts`: Cập nhật `loadPlugFromPath` đọc dữ liệu byte của plug trực tiếp từ `space.readFile(path)` và tạo `Blob` URL.
  - Trong `WorkerSandbox`: Hỗ trợ nạp `Blob URL` và tự động giải phóng URL qua `URL.revokeObjectURL` khi sandbox dừng (`stop()`).

### 2.2. Khắc Phục Menu 3 Dấu Gạch (Hamburger Menu) & Thanh Điều Khiển Mobile
- **File cần chỉnh sửa**: [`client/styles/top.scss`](file:///D:/code/chessnote/client/styles/top.scss)
  - Sửa đổi quy tắc CSS: Đổi `&.open:hover` thành `&.open, &.open:hover` để mở rộng danh sách nút bấm ngay khi có class `open`.
  - Tối ưu hiệu ứng mở mượt mà và nền kính mờ `backdrop-filter`.
- **File cần chỉnh sửa**: [`client/editor_ui.tsx`](file:///D:/code/chessnote/client/editor_ui.tsx) & [`client/components/top_bar.tsx`](file:///D:/code/chessnote/client/components/top_bar.tsx)
  - Đặt `dropdown: false` cho nút expander `☰` để nút luôn nằm cố định trên thanh tiêu đề.
  - Tinh chỉnh sự kiện `onClick` và loại bỏ xung đột `onBlur` trên thiết bị cảm ứng di động.
  - Bổ sung các nút hành động tiện ích mặc định trên Mobile: Mở danh sách ghi chú (Page Navigator), Bảng lệnh (Command Palette), Thêm ván cờ mới (New Chess Note).

### 2.3. Tối Ưu Hiển Thị & Tương Tác Bàn Cờ Cờ Vua trên Mobile
- **File cần chỉnh sửa**: [`plugs/chess/board_renderer.ts`](file:///D:/code/chessnote/plugs/chess/board_renderer.ts) & [`plugs/chess/chess.scss`](file:///D:/code/chessnote/plugs/chess/chess.scss)
  - Đảm bảo bàn cờ tự động co giãn theo chiều ngang thiết bị (`max-width: 100%`, `aspect-ratio: 1/1`).
  - Tối ưu thanh điều khiển nước đi PGN: Các nút bấm (⏮ ◀ ▶ ⏭ 🔄) kích thước tối thiểu 44px x 44px dễ bấm trên màn hình cảm ứng.
  - Bảng danh sách nước đi (Move notation table) tự động cuộn theo nước đi hiện tại, phông chữ rõ nét.

---

## 3. Kế Hoạch Kiểm Thử & Xác Minh (Verification Plan)

### Kiểm thử tự động:
1. `npm run check` -> Đảm bảo 100% không có lỗi TypeScript.
2. `npm run test` / `npm run build` -> Biên dịch lại tất cả plugs (bao gồm `chess.plug.js`) và client bundle.

### Kiểm thử đóng gói & chạy thực tế:
1. `npm run mobile:build` -> Đồng bộ mã nguồn đã sửa vào `android/app/src/main/assets/public/`.
2. `cd android && .\gradlew.bat assembleDebug` -> Đóng gói APK mới.
3. Cài đặt APK và kiểm tra trên thiết bị thực tế:
   - [x] Mở trang `INDEX`: Các khối FEN/PGN tự động chuyển thành bàn cờ cờ vua tương tác.
   - [x] Chạm vào các nút điều khiển nước đi (⏮, ◀, ▶, ⏭) xem quân cờ di chuyển mượt mà.
   - [x] Chạm vào nút 3 gạch `☰`: Menu bung mở mượt mà, bấm chọn lệnh hoạt động bình thường.
   - [x] Gõ văn bản và lưu trang không có bất kỳ lỗi nào.
