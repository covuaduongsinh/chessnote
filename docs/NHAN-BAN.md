# Hướng dẫn thêm module và nhân bản ChessNote sang lĩnh vực khác

> Dựa trên mã nguồn tại commit `383bab47be` (2026-09-13). Mọi đường dẫn, tên hàm dưới đây đã đối chiếu với mã. Chi tiết từng module: [docs/modules/README.md](modules/README.md). Công thức, số liệu: [docs/modules/TRA-CUU-TU-DONG.md](modules/TRA-CUU-TU-DONG.md).
>
> **Chưa chạy thử** các quy trình nhân bản trọn vẹn (đổi tên toàn bộ, build, chạy) trong phiên viết tài liệu này — các bước là suy ra từ đọc mã và cấu hình. Hãy làm trên nhánh riêng và chạy đủ bộ kiểm ở mục 6 sau mỗi bước.

## 1. Bản chất kiến trúc: cái gì tái dùng được

ChessNote = **SilverBullet** (nền ghi chú Markdown lập trình được) + **7 plug cờ vua** + **plug `sync`** + **2 dịch vụ Node** + vỏ Desktop/Mobile + bộ triển khai. Muốn làm "XxxNote" cho lĩnh vực khác (cờ tướng, cờ vây, âm nhạc, toán, cờ bài…), bạn chia mã thành ba nhóm:

| Nhóm | Thành phần | Tái dùng nguyên |
|---|---|---|
| **Chung (giữ nguyên)** | `client/`, `server/`, `plug-api/`, `plugs/{core,editor,index,emoji,image-viewer,configuration-manager,object-graph}`, `plugs/sync`, `cloud-server`, `ai-sidecar`, `desktop/`, `android/`, `ios/` | Có (chỉ đổi tên/nhãn hiệu) |
| **Mẫu thiết kế tái dùng** | Cách viết widget (`chess.ts`), lớp SQLite + FTS5 (`chess-db`), cầu nối AI hai chế độ (`chess-ai/bridge.ts`), tách plug qua syscall (`external_syscalls.ts`), xuất PDF (`chess-pdf-export`), theme (`chess-themes`), ôn tập SRS (`chess-repertoire` + `srs_sm2.ts`) | Sao chép cấu trúc, thay phần miền |
| **Riêng cờ vua (thay mới)** | Thư viện `chess.js`, engine Arasan + NNUE, định dạng FEN/PGN/ECO, `game_reviewer.ts`, toàn bộ tiếng Việt cờ vua trong prompt và mẫu trang | Viết lại |

Tham chiếu trực tiếp cho từng mẫu:

| Mẫu | File tham khảo |
|---|---|
| Widget từ khối mã, iframe, gọi syscall | `plugs/chess/chess.ts`, `plugs/chess/chess.plug.yaml` (`codeWidget`, `renderMode: iframe`) |
| Chỉ mục đối tượng từ khối mã trên trang | `plugs/chess/index.ts` (`page:index` → `index.indexObjects`) |
| Cache kết quả nặng theo trang, tự vô hiệu khi trang đổi | `plugs/chess-ai/trends.ts` (Object Index, ADR-002) |
| Cầu nối AI hai chế độ, prompt chống bịa | `plugs/chess-ai/bridge.ts`, `plugs/chess-ai/coach.ts` |
| Plug độc lập, gọi plug khác qua syscall | `plugs/chess-repertoire/external_syscalls.ts` (chú thích đầu file giải thích lý do) |
| Đồng bộ nhà cung cấp cắm được | `plugs/sync/sync_provider.ts` (interface 4 hàm) |

## 2. Quy trình A — thêm một plug/module mới trong ChessNote

Lấy `chess-repertoire` (nhỏ nhất có lệnh + sự kiện) làm mẫu, rồi làm:

1. **Tạo thư mục** `plugs/<tên>/` với manifest `<tên>.plug.yaml`:
   ```yaml
   name: <tên>
   functions:
     indexSomething:
       path: ./index.ts:indexSomething
       events:
         - page:index
     mySomethingCommand:
       path: ./something.ts:commandSomething
       command:
         name: "Chess: Việc gì đó"
   ```
   Khoá hỗ trợ đã dùng trong repo: `path`, `events`, `command.name`, `codeWidget` + `renderMode`, `syscall.{name, description, parameters, returns}`.
2. **Nếu cần dùng plug khác**: viết `plugs/<tên>/external_syscalls.ts` bọc `syscall("tên.syscall", …)` — **không** `import` mã của plug khác (để plug build độc lập). Ví dụ đầy đủ ở `plugs/chess-repertoire/external_syscalls.ts`.
3. **Nếu cần cung cấp syscall cho plug khác**: khai báo trong manifest (`syscall:`), thêm `plug_api.ts` mỏng để plug khác sao chép mẫu gọi.
4. **Đăng ký plug dựng sẵn**: thêm tên vào `builtinPlugNames` trong `plugs/builtin_plugs.ts`. Bước build (`build/build_plugs.ts`) đọc `./plugs/<tên>/<tên>.plug.yaml` cho **mọi** tên trong danh sách và xuất `Library/Std/Plugs/<tên>.plug.js`.
5. **Khoá cấu hình**: khai báo bằng `config.define("chess.<nhóm>.<khoá>", {...})` trong hàm nghe `editor:init` (mẫu `plugs/chess-ai/bridge.ts:initAiConfig`) để hiện trong Configuration Manager.
6. **Test**: đặt `*.test.ts` cạnh mã, chạy `npm test`. Tách logic thuần (prompt, parse, công thức) ra hàm không phụ thuộc syscall để test không cần mock — cách các plug hiện tại làm.
7. **Tài liệu**: thêm `docs/modules/NN-<tên>.md` theo mẫu hai phần, cập nhật `docs/modules/README.md`, chạy `python scripts/gen_module_reference.py`.

Ràng buộc bắt buộc của sandbox: plug chạy trong Web Worker, **không** dùng `window`/`document`/`localStorage` ở phần Worker; mọi tương tác qua syscall (`editor`, `space`, `index`, `config`, `clientStore`, `sandboxFetch`).

### Kiểm tra thêm cho việc nặng (quy tắc ADR-004)

Nếu module chạy engine, gọi AI hoặc tốn thời gian: **bắt buộc** để người dùng chủ động (nút hoặc lệnh); tuyệt đối không gắn vào `page:saved` (autosave debounce chỉ 1 giây). Việc nhẹ và tức thì (đánh chỉ mục, tra cứu) thì được chạy ngầm ở `page:index`.

## 3. Quy trình B — nhân bản sang lĩnh vực khác ("XxxNote")

Làm trên nhánh mới hoặc bản sao repo. Thứ tự đề xuất, mỗi bước xong thì `npm run check && npm test`:

### Bước 1 — Đổi nhãn hiệu (chỉ chuỗi/cấu hình, không đụng logic)

| Vị trí | Trường cần đổi |
|---|---|
| `client/boot.ts` | `spaceFolderPath: "ChessNote"` |
| `capacitor.config.ts` | `appId`, `appName` |
| `android/app/build.gradle` | `namespace`, `applicationId`, `versionName`, `versionCode` |
| `desktop/src-tauri/tauri.conf.json` | `productName`, `identifier`, `version`, mô tả bundle |
| `desktop/src-tauri/src/lib.rs` | `AppInfo.name` (chuỗi `"ChessNote"`) |
| `docker-compose.*.yml`, `Caddyfile`, `scripts/deploy-vps.sh` | Tên service/container/miền/volume |
| `README.md`, `CLAUDE.md`, `AGENTS.md`, `TECH.md`, `SKILLS.md`, `MEMORY.md` | Nội dung mô tả |

Tên `chess-*` và tiền tố khoá cấu hình `chess.*`, syscall `chess.*`/`chessSql.*`/`chessEmbedding.*` nằm rải nhiều nơi. **Đổi tên hàng loạt là rủi ro cao** (syscall là chuỗi, không có kiểu kiểm tra): nếu đổi, dùng tìm-thay thế có kiểm soát rồi `npm run check`, `npm test`, và thử từng lệnh trong Command Palette. Phương án an toàn hơn: **giữ nguyên tiền tố nội bộ** ở lần nhân bản đầu, chỉ đổi phần người dùng nhìn thấy (tên lệnh, chuỗi giao diện).

### Bước 2 — Thay lõi miền

1. Thay `chess.js` bằng thư viện luật của miền mới (hoặc bỏ nếu không có luật).
2. Viết lại `plugs/chess/` thành plug lõi mới: khối mã của miền (thay ` ```fen `/` ```pgn `), hàm dựng widget, hàm trích đối tượng chỉ mục (thay `extractChessGames`).
3. Thay `plugs/chess-engine/` bằng bộ đánh giá của miền (hoặc bỏ). Giữ hợp đồng: một hàm `eval` nhận trạng thái trả điểm số; `reviewGame` tính "mất điểm mỗi bước" và độ chính xác.
4. Giữ nguyên `chess-db` phần chung (SQLite, FTS5, embedding, SM-2); thay tên cột/bảng riêng cờ vua (`eco`, `white`, `black`, `pgn`…).
5. Thay prompt tiếng Việt cờ vua trong `chess-ai/coach.ts`, `tagging.ts`, `qa.ts`, `trends.ts`. **Giữ nguyên nguyên tắc chống bịa**: AI chỉ nhận số liệu đã tính, mỗi prompt kèm quy tắc cấm suy diễn ngoài số liệu.
6. Thay mẫu trang trong `libraries/Library/Chess/` (Templates, Slash_Templates, Demo).

### Bước 3 — Gộp hoặc tách theo nhu cầu

- Chỉ cần đồng bộ: giữ `plugs/sync` + `cloud-server`, bỏ mọi plug `chess-*` (khỏi `builtinPlugNames`).
- Không cần AI: bỏ `chess-ai`, `ai-sidecar`; loại tên khỏi `plugs/builtin_plugs.ts`.
- Cần bán từng plug riêng: theo ADR-005/006 — mỗi plug tự đủ (`external_syscalls.ts`), publish sang một repo `chessnote-plug-<tên>` với `.plug.js` đã build + trang Library (`tags: meta/library`).

### Bước 4 — Build, kiểm, triển khai

Xem mục 6 và [docs/modules/11-nen-tang-va-trien-khai.md](modules/11-nen-tang-va-trien-khai.md). Đổi mật khẩu mặc định trong compose **trước** khi triển khai (xem [docs/modules/10-cloud-server.md](modules/10-cloud-server.md)).

## 4. Điều kiện pháp lý cần rà khi nhân bản/thương mại hoá

- Dự án ưu tiên phần mềm/thư viện giấy phép **MIT hoặc tương đương** (ghi trong bản bàn giao 2026-09-07). Trước khi phát hành: rà giấy phép các bộ quân cờ SVG (`plugs/chess-themes/pieces/*.ts`) và engine Arasan/mạng NNUE — **chưa được kiểm tra** trong bộ tài liệu này.
- Chế độ AI `subscription` chỉ hợp lệ cho một người dùng là chính chủ tài khoản; sản phẩm nhiều người dùng phải dùng `api_key` ([04](modules/04-chess-ai.md), [09](modules/09-ai-sidecar.md)).
- Nâng cấp từ SilverBullet upstream: các chỗ đã chỉnh cần hợp nhất tay (`client/components/panel_html.ts`, thanh tab, `client/boot.ts`).

## 5. Bảng thay thế nhanh (cờ vua → miền khác)

| Khái niệm cờ vua | Nơi trong mã | Khái niệm miền mới cần định nghĩa |
|---|---|---|
| FEN (thế cờ) | `plugs/chess/chess.ts` (`fenWidget`) | Biểu diễn một "trạng thái" |
| PGN (ván đấu) | `plugs/chess/index.ts` (`extractChessGames`) | Biểu diễn một "chuỗi diễn biến" |
| ECO, khai cuộc | `chess_games.eco`, `chess-repertoire` | Nhãn phân loại chính |
| Engine + CPL + accuracy | `plugs/chess-engine/game_reviewer.ts` | Thước đo chất lượng mỗi bước |
| Puzzle | `puzzleWidget` | Bài tập có lời giải chấm tự động |
| Sổ tay khai cuộc + SM-2 | `plugs/chess-repertoire/`, `srs_sm2.ts` | Thẻ ôn tập ngắt quãng |
| Xu hướng theo giai đoạn ván | `classifyPhase` trong `trends.ts` | Các giai đoạn của "ván" trong miền mới |

## 6. Bộ kiểm bắt buộc sau mỗi thay đổi

```bash
npm run check        # tsc --noEmit
npm test             # vitest
npm run fmt:check    # định dạng (Biome)
cargo check --workspace   # nếu sửa Rust
python scripts/gen_module_reference.py   # cập nhật tài liệu tự động
git status --porcelain   # rà file lạ
```

E2E (`npm run test:e2e`) và build đầy đủ (`npm run build`, `make`) chạy trước khi phát hành. Nhớ: sau khi build lại plug, gọi `system.reloadPlugs` để trình duyệt nạp bản mới; `console.log` trong Worker của plug không thấy được qua công cụ Chrome — trả thông tin chẩn đoán qua giá trị của syscall.
