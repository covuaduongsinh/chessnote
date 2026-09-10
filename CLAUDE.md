# Cẩm Nang Thao Tác Nhanh Dành Cho Claude (CLAUDE.md)

> **Mục đích**: Bản tóm tắt ngữ cảnh siêu tốc giúp Claude / LLM Agents nắm bắt nhanh các lệnh thực thi, quy tắc làm việc và bản đồ mã nguồn trong ChessNote.

---

## 1. Các Lệnh Thực Thi Thường Dùng (Essential Commands)

### 1.1. Xây Dựng (Build)
* **Build toàn bộ Frontend + Plugs**: `npm run build`
* **Chỉ build Plugs**: `npm run build:plugs`
* **Chỉ build Client**: `npm run build:client`
* **Build Client Mobile**: `npm run build:client:mobile`
* **Build Client Desktop**: `npm run build:client:desktop`
* **Build Server Rust (Release)**: `make` (hoặc `cargo build --release`)
* **Build AI Sidecar**: `cd ai-sidecar && npm run build` (hoặc chạy trực tiếp `npx tsx src/server.ts`)

### 1.2. Chạy Ứng Dụng (Run)
* **Chạy Server Rust (Debug mode)**: `cargo run <PATH_TO_SPACE>` (phục vụ bundle trực tiếp từ `client_bundle/`). Trên Windows, nếu cần dùng PDF export/runtime API (headless Chrome), đặt thêm biến môi trường `SB_CHROME_DATA_DIR` chỉ tới 1 đường dẫn tuyệt đối đơn giản (ví dụ `C:\Users\<tên>\chessnote-chrome-data`) — thư mục mặc định (`<space>/.chrome-data`, nằm sâu trong Space, có dấu chấm đầu) khiến Chrome/Edge lặng lẽ thoát ngay (exit code 21) trước khi trả về websocket URL, xem chi tiết trong memory.
* **Chạy AI Sidecar độc lập**: `cd ai-sidecar && npm start` (mặc định cổng `3457`)
* **Chạy Mobile Android**: `npm run mobile:run:android` (hoặc `npm run mobile:android` để mở Android Studio)
* **Chạy Desktop App Dev (Tauri)**: `npm run desktop:dev`

### 1.3. Kiểm Thử & Linting (Test & Quality)
* **Chạy Unit Tests**: `npm test` (vitest)
* **Kiểm tra kiểu dữ liệu (TypeScript)**: `npm run check` (tsc --noEmit)
* **Linter & Code Format**: `npm run lint` / `npm run fmt`
* **E2E Tests (Playwright)**: `npm run test:e2e`

---

## 2. Bản Đồ Mã Nguồn Nhanh (Key Directories)

| Thư mục | Ngôn ngữ | Vai trò chính |
|---|---|---|
| `plugs/chess/` | TypeScript | Toàn bộ tính năng cờ vua: Widget bàn cờ, Game Review, AI Coach/Trends/QA/Tagging, Game Indexer |
| `plugs/chess/engine/` | TS / WASM | Động cơ Arasan WASM, UCI bridge, Game Reviewer |
| `plugs/chess/ai/` | TypeScript | AI Bridge (gọi sang sidecar), Prompt templates, Trends, Tagging, QA RAG |
| `ai-sidecar/` | TypeScript / Node | Tiến trình trung gian quản lý phiên Claude CLI / API Key |
| `cloud-server/` | TypeScript / Node | ChessNote Cloud (Phase B, tuỳ chọn) — server WebDAV tự host + kênh WebSocket đẩy tín hiệu đồng bộ realtime |
| `client/` | TypeScript (Preact) | Giao diện SilverBullet, CodeMirror 6, Space Lua VM |
| `server/` | Rust | Máy chủ HTTP, Proxy router `/.proxy/`, Quản lý Space |
| `desktop/` | Rust (Tauri) | Vỏ bọc ứng dụng máy tính Desktop |
| `android/` | Java / Kotlin / Cap | Vỏ bọc ứng dụng di động Android |
| `docs/` | Markdown | Toàn bộ tài liệu thiết kế, API và hướng dẫn |

---

## 3. Các Quy Tắc Kỹ Thuật Quan Trọng

1. **Plug Worker Sandbox**: Mọi mã nguồn trong `plugs/chess/` chạy trong Web Worker Sandbox. Không gọi DOM/Window trực tiếp — dùng Syscalls (`editor`, `space`, `config`, `index`, `clientStore`).
2. **AI Sidecar Communication**: Sandbox Worker giao tiếp với `ai-sidecar` qua syscall `sandboxFetch.fetch` -> Rust route `/.proxy/<host:port>/...` -> Node `ai-sidecar`.
3. **Engine Evaluation**: Động cơ Arasan WASM chạy độc lập trong Worker riêng. Không chặn main UI thread khi duyệt ván cờ.
4. **Cache Game Review**: Dữ liệu phân tích ván đấu được lưu vào Object Index `chess-game-review`, không ghi vào Frontmatter YAML để tránh hỏng file.
5. **Tham khảo chi tiết**:
   - Quy chuẩn Agent: [AGENTS.md](file:///D:/code/chessnote/AGENTS.md)
   - Kiến trúc kỹ thuật: [TECH.md](file:///D:/code/chessnote/TECH.md)
   - Thuật toán Cờ vua: [docs/CHESS_MODULES.md](file:///D:/code/chessnote/docs/CHESS_MODULES.md)
   - Lịch sử & ADR: [MEMORY.md](file:///D:/code/chessnote/MEMORY.md)
