# Cẩm Nang Thao Tác Nhanh Dành Cho Claude (CLAUDE.md)

> **Mục đích**: Bản tóm tắt ngữ cảnh siêu tốc giúp Claude / LLM Agents nắm bắt nhanh các lệnh thực thi, quy tắc làm việc và bản đồ mã nguồn trong ChessNote.
> Cập nhật lần cuối theo mã nguồn tại commit `383bab47be` (2026-09-13). Tài liệu chi tiết từng module: [docs/modules/README.md](docs/modules/README.md).

---

## 1. Các Lệnh Thực Thi Thường Dùng (Essential Commands)

### 1.1. Xây Dựng (Build)
* **Build toàn bộ Frontend + Plugs**: `npm run build`
* **Chỉ build Plugs**: `npm run build:plugs`
* **Chỉ build Client**: `npm run build:client`
* **Build Client Mobile / Desktop**: `npm run build:client:mobile` / `npm run build:client:desktop`
* **Build Server Rust (Release)**: `make` (hoặc `cargo build --release`)
* **Build AI Sidecar**: `cd ai-sidecar && npm run build` (hoặc chạy trực tiếp `npx tsx src/server.ts`)

### 1.2. Chạy Ứng Dụng (Run)
* **Chạy Server Rust (Debug mode)**: `cargo run <PATH_TO_SPACE>` (phục vụ bundle trực tiếp từ `client_bundle/`). Trên Windows, nếu cần dùng PDF export/runtime API (headless Chrome), đặt thêm biến môi trường `SB_CHROME_DATA_DIR` chỉ tới 1 đường dẫn tuyệt đối đơn giản (ví dụ `C:\Users\<tên>\chessnote-chrome-data`) — thư mục mặc định (`<space>/.chrome-data`, nằm sâu trong Space, có dấu chấm đầu) khiến Chrome/Edge lặng lẽ thoát ngay (exit code 21) trước khi trả về websocket URL, xem chi tiết trong memory.
* **Chạy AI Sidecar độc lập** (chỉ cần khi `chess.ai.mode = "subscription"`): `cd ai-sidecar && npm start` (cổng `3457`). Chế độ mặc định `api_key` không cần sidecar.
* **Chạy ChessNote Cloud (đồng bộ tự host)**: `cd cloud-server && npm run dev` (cần `CHESSNOTE_CLOUD_USERS`).
* **Chạy Mobile Android**: `npm run mobile:run:android` (hoặc `npm run mobile:android` để mở Android Studio)
* **Chạy Desktop App Dev (Tauri)**: `npm run desktop:dev`

### 1.3. Kiểm Thử & Linting (Test & Quality)
* **Unit Tests**: `npm test` (vitest) — riêng cờ vua + sync + dịch vụ Node: `npx vitest run plugs/chess plugs/chess-ai plugs/chess-db plugs/chess-engine plugs/chess-pdf-export plugs/chess-repertoire plugs/chess-themes plugs/sync cloud-server ai-sidecar` (41 file, 394 test, đã chạy xanh ngày 2026-09-29)
* **Typecheck**: `npm run check` (tsc --noEmit)
* **Linter & Format**: `npm run lint` / `npm run fmt` / `npm run fmt:check`
* **E2E (Playwright)**: `npm run test:e2e`
* **Cập nhật bảng tra cứu tự động của tài liệu**: `python scripts/gen_module_reference.py` (sinh `docs/modules/TRA-CUU-TU-DONG.md` và `docs/modules/LICH-SU-COMMIT.md`)

---

## 2. Bản Đồ Mã Nguồn Nhanh (Key Directories)

| Thư mục | Ngôn ngữ | Vai trò chính | Tài liệu |
|---|---|---|---|
| `plugs/chess/` | TypeScript | **Plug lõi**: widget `fen`/`pgn`/`puzzle`, sửa bàn cờ, chỉ mục ván `chess-game`, ván liên quan | [01](docs/modules/01-chess-core.md) |
| `plugs/chess-engine/` | TS / WASM | Arasan WASM, UCI, Game Review (CPL, accuracy) | [02](docs/modules/02-chess-engine.md) |
| `plugs/chess-db/` | TS / SQLite WASM | SQLite trong bộ nhớ: FTS5, thống kê khai cuộc, SM-2, embedding | [03](docs/modules/03-chess-db.md) |
| `plugs/chess-ai/` | TypeScript | AI Coach, xu hướng, gắn tag, hỏi đáp, thống kê; cầu nối `api_key`/`subscription` | [04](docs/modules/04-chess-ai.md) |
| `plugs/chess-pdf-export/` | TypeScript | Xuất PDF có bàn cờ tĩnh | [05](docs/modules/05-chess-pdf-export.md) |
| `plugs/chess-repertoire/` | TypeScript | Sổ tay khai cuộc + ôn tập SRS | [06](docs/modules/06-chess-repertoire.md) |
| `plugs/chess-themes/` | TypeScript | 6 bộ quân, 8 màu bàn | [07](docs/modules/07-chess-themes.md) |
| `plugs/sync/` | TypeScript | Đồng bộ Dropbox/WebDAV, xung đột, E2EE, kênh đẩy | [08](docs/modules/08-sync.md) |
| `ai-sidecar/` | TypeScript / Node | Tiến trình quản lý phiên Claude CLI (tuỳ chọn) | [09](docs/modules/09-ai-sidecar.md) |
| `cloud-server/` | TypeScript / Node | ChessNote Cloud: WebDAV tự host + WebSocket `/_push` | [10](docs/modules/10-cloud-server.md) |
| `client/` | TypeScript (Preact) | Giao diện SilverBullet, CodeMirror 6, Space Lua VM, thanh tab | [11](docs/modules/11-nen-tang-va-trien-khai.md) |
| `server/`, `server-common/`, `server-merge/`, `server-runtime-chrome/`, `bin/` | Rust | Máy chủ HTTP, proxy `/.proxy/`, Space, Chrome không đầu | [11](docs/modules/11-nen-tang-va-trien-khai.md) |
| `desktop/`, `android/`, `ios/`, `mobile/` | Rust (Tauri) / Java / Capacitor | Vỏ bọc đa nền tảng | [11](docs/modules/11-nen-tang-va-trien-khai.md) |
| `libraries/Library/Chess/` | Markdown + WASM | Mẫu trang, slash template, `arasan.wasm`, mạng NNUE | [02](docs/modules/02-chess-engine.md) |
| `docs/` | Markdown | Tài liệu thiết kế, kế hoạch (`docs/plans/`), module (`docs/modules/`) | — |

Đăng ký plug dựng sẵn: `plugs/builtin_plugs.ts` (15 plug).

---

## 3. Các Quy Tắc Kỹ Thuật Quan Trọng

1. **Plug Worker Sandbox**: Mọi mã nguồn trong `plugs/` chạy trong Web Worker Sandbox. Không gọi DOM/Window trực tiếp — dùng Syscalls (`editor`, `space`, `config`, `index`, `clientStore`, `sandboxFetch`). Script của widget chạy trong **iframe** (nhận qua `postMessage` rồi `eval`) và gọi ngược Worker bằng `syscall(...)`.
2. **Plug độc lập**: Lời gọi xuyên plug đi qua **syscall** (mỗi plug có `external_syscalls.ts` bọc `syscall()`), không `import` trực tiếp mã plug khác (ADR-005/006). Thứ tự cài: `chess-themes`, `chess-engine`, `chess-db` → `chess` → `chess-pdf-export`, `chess-repertoire`, `chess-ai`.
3. **AI**: `chess.ai.mode` = `api_key` (mặc định, gọi thẳng `api.anthropic.com` qua `/.proxy/`) hoặc `subscription` (qua `ai-sidecar` cổng `3457`). Không để LLM đọc PGN thô diện rộng — chỉ nạp số liệu engine đã tính.
4. **Action-driven**: Việc đắt (engine, AI) luôn do người dùng bấm; không gắn vào `page:saved` (ADR-004).
5. **Engine**: Arasan WASM khởi tạo instance mới mỗi lần `evalPosition`, chạy tuần tự trong Worker của plug; file `arasan.wasm` + `.nnue` (~26 MB) nằm ở `libraries/Library/Chess/`.
6. **Cache Game Review**: Object Index `chess-game-review`, không ghi frontmatter YAML (ADR-002).
7. **SQLite là cache trong bộ nhớ** (`:memory:`), dựng lại từ PGN mỗi lần tải. Lịch SRS được bền hoá ra `_chess/repertoire-srs.json` (`srs_persist.ts`); **embedding thì chưa** — mất khi tải lại (xem [03](docs/modules/03-chess-db.md)).
8. **Sau khi build lại plug**: gọi `system.reloadPlugs` để nạp bản mới; `console.log` trong Worker plug không thấy qua công cụ Chrome — trả thông tin chẩn đoán qua giá trị syscall.
9. **Plan/tài liệu kế hoạch** lưu trong `docs/plans/` theo tên `YYYY-MM-DD-mo-ta-ngan.md`.
10. **Tham khảo chi tiết**:
    - Quy chuẩn Agent: [AGENTS.md](AGENTS.md)
    - Kiến trúc kỹ thuật: [TECH.md](TECH.md)
    - Thuật toán các module cờ vua: [docs/CHESS_MODULES.md](docs/CHESS_MODULES.md) và [docs/modules/](docs/modules/README.md)
    - Thêm module / nhân bản: [docs/NHAN-BAN.md](docs/NHAN-BAN.md), [SKILLS.md](SKILLS.md)
    - Lịch sử & ADR: [MEMORY.md](MEMORY.md)
