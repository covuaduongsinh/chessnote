# ♟️ HƯỚNG DẪN KHỞI CHẠY & ĐÓNG GÓI CHESSNOTE DESKTOP (TAURI V2)

> **Mục tiêu**: Hướng dẫn chi tiết cách khởi chạy thử nghiệm (Development) và đóng gói bản phát hành (Production Installer) cho ứng dụng máy tính ChessNote (Windows, macOS, Linux).  
> **Nền tảng**: Tauri v2 (Rust Backend + Native Webview).

---

## 1. YÊU CẦU MÔI TRƯỜNG (PREREQUISITES)

Để chạy và build ứng dụng Desktop, máy tính cần có:
1. **Node.js**: Phiên bản `>= 24.13.0` (đã có trên máy).
2. **Rust & Cargo**: Phiên bản `>= 1.77.0` (máy hiện tại dùng `rustc 1.95.0`).
3. **C++ Build Tools**:
   - **Windows**: Microsoft C++ Build Tools hoặc Visual Studio with C++ Desktop Development (đã cài đặt WebView2 runtime).
   - **macOS**: Xcode Command Line Tools (`xcode-select --install`).
   - **Linux (Ubuntu/Debian)**: `sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev`.

---

## 2. CÁC LỆNH VẬN HÀNH (NPM SCRIPTS)

Tất cả lệnh tiện ích đã được tích hợp sẵn vào `package.json`:

### 2.1. Kiểm tra nhanh mã nguồn (Type & Syntax Check)
```bash
# Kiểm tra TypeScript
npm run check

# Kiểm tra Rust Backend của Desktop App
npm run desktop:check
```

### 2.2. Chạy ứng dụng Desktop ở chế độ phát triển (Live Dev / Test)
```bash
npm run desktop:dev
```
- Lệnh này sẽ tự động biên dịch client bundle tĩnh, khởi chạy Webview và mở cửa sổ ChessNote Desktop kích thước 1280x850.

### 2.3. Đóng gói bản phát hành độc lập (Release Build / Installer)
```bash
npm run desktop:build
```
- Lệnh sẽ tự động chạy `npm run build` (biên dịch toàn bộ Plugs và Client Bundle), sau đó Tauri sẽ đóng gói mã nguồn và sinh file cài đặt:
  - **Windows**: Bộ cài đặt `.msi` và file thực thi `.exe` tại thư mục:
    `desktop/src-tauri/target/release/bundle/msi/` và `desktop/src-tauri/target/release/chessnote-desktop.exe`
  - **macOS**: Gói `.dmg` và `.app` tại `desktop/src-tauri/target/release/bundle/dmg/`
  - **Linux**: Gói `.deb` hoặc `.AppImage` tại `desktop/src-tauri/target/release/bundle/deb/`

---

## 3. CẤU TRÚC THƯ MỤC ỨNG DỤNG DESKTOP

```
desktop/
  └── src-tauri/
      ├── Cargo.toml            # Khai báo crate chessnote-desktop, Tauri v2 & plugins
      ├── tauri.conf.json       # Cấu hình cửa sổ (1280x850), định danh com.chessnote.app
      ├── build.rs              # Tauri v2 build hook
      ├── icons/                # Bộ icon đầy đủ các định dạng (.ico, .icns, .png đa kích thước)
      └── src/
          ├── lib.rs            # Xử lý logic Tauri, đăng ký plugins (dialog, fs, shell, process)
          └── main.rs           # Điểm khởi động ứng dụng Windows/Mac/Linux
```

---

## 4. TÍNH NĂNG VÀ TRẢI NGHIỆM TRÊN DESKTOP

- **100% Offline**: Tích hợp sẵn toàn bộ kho Plug cờ vua (`chess.plug.js`, `editor.plug.js`, `core.plug.js`, `sync.plug.js`).
- **Bàn cờ cờ vua**: Hỗ trợ hiển thị khối mã ```fen```, ```pgn```, ```puzzle``` với bàn cờ SVG, điều hướng nước đi (PGN), xoay bàn, copy FEN/PGN. ⚠️ *Chưa hỗ trợ kéo-thả/click-to-move thật (chỉ tô sáng ô khi click) và Puzzle chưa chấm đúng/sai — xem `docs/plans/2026-09-07-danh-gia-va-ke-hoach-hoan-thien-chessnote.md`, Giai đoạn 1.*
- **Tiêu thụ tài nguyên tối thiểu**: Dung lượng cài đặt cực nhỏ gọn (~10-15MB), tiêu thụ RAM <50MB nhờ sử dụng WebView2 Native của hệ điều hành.
