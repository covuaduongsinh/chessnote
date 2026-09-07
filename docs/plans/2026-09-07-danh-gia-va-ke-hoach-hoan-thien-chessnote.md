# Đánh giá hiện trạng & Kế hoạch hoàn thiện ChessNote

> **Ngày**: 2026-09-07
> **Phạm vi**: rà soát toàn bộ công việc đã commit trong `00183eaa` (+8.516 dòng, 141 file) và
> phần chưa commit trong working tree, đánh giá mức độ hoàn thiện thật, lập kế hoạch sửa chữa
> và hoàn thiện.
> **Phương pháp**: 4 agent audit độc lập đọc mã nguồn, chạy thử test, đối chiếu tài liệu kế
> hoạch cũ (`00-master-plan-chessnote.md` → `05-phase-5-*.md`).

---

## 0. TÓM TẮT ĐIỀU HÀNH (đọc phần này nếu chỉ có 2 phút)

ChessNote hiện tại **trông như đã hoàn thành nhưng phần lớn là vỏ giao diện**. Build sạch, test
xanh, APK 10,57 MB chạy được — nhưng:

- **Bàn cờ không chơi được**: click chỉ tô sáng ô, không đi được nước nào.
- **"Arasan Engine" là giả**: không có engine nào trong repo, chỉ là hàm đếm quân tự viết.
- **"AI Gateway" là code chết**: trả về một đoạn văn hardcode cố định, không nối vào UI cũng
  không nối vào server.
- **Dropbox sync mồ côi**: viết xong nhưng không có nút nào gọi tới.
- Test đều xanh vì chúng chỉ so khớp đúng những chuỗi hardcode đó.

Điểm sáng thật sự: **kiến trúc mobile offline-first hoạt động đúng** (IndexedDB + Blob URL
Worker, không cần server), **license sạch 100% MIT**, và **scaffold desktop Tauri v2 đã compile
được**.

Hai quyết định đã chốt định hướng phần còn lại: **AI dùng cho cá nhân** (bỏ mô hình bán hàng
3 tier) và **đầu tư Arasan WASM thật** (không dùng API online tạm bợ).

---

## 1. HIỆN TRẠNG CHI TIẾT THEO MODULE

### 1.1. Chess Core Plug — ⚠️ Vỏ giao diện đẹp, lõi rỗng

**Đã có thật:**
- 3 code widget đăng ký đúng chuẩn qua `plugs/chess/chess.plug.yaml:3-14`: `fen`, `pgn`,
  `puzzle`, chạy `renderMode: iframe`.
- Dùng thư viện `chess.js@^1.4.0` thật (`package.json:119`) để parse FEN/PGN, không tự viết
  parser sai chuẩn.
- Bàn cờ SVG với bộ quân Staunton tự vẽ (`board_renderer.ts:2-15`), CSS theme sáng/tối, hỗ trợ
  xoay bàn theo cả hai màu (`chess.ts:177-178, 238-239, 493-494, 746-747`).
- **Đã wire vào pipeline build chính thức**: `plugs/builtin_plugs.ts:11` đã có `"chess"`.

**Thiếu/hỏng:**

| Vấn đề | Bằng chứng | Hệ quả |
|---|---|---|
| Không đi được nước cờ nào | `handleSquareClick` chỉ toggle `selectedSquare` (`chess.ts:285-297`, `chess.ts:790-807`); biến `legalMoves` khai báo tại `chess.ts:107` nhưng **không bao giờ được gán** | Bàn cờ chỉ là ảnh tĩnh có tô sáng ô |
| Puzzle không chấm đúng/sai | CSS `.correct`/`.wrong` tồn tại (`board_renderer.ts:412-414`) nhưng **không dòng code nào gán class này** | Không thể luyện tập thật, chỉ xem đáp án |
| PGN không validate nước đi | Không có listener click nào trong đoạn render `chess.ts:503-527` | Chỉ tua tới/lui theo danh sách nước có sẵn |
| Lỗi input bị nuốt im lặng | FEN sai → âm thầm về vị trí đầu (`chess.ts:44-50`); PGN sai → âm thầm reset (`chess.ts:341-347`); Puzzle **không có try/catch nào** | Người dùng gõ sai không biết mình sai |
| Import chết | `centipawnsToWinChance`, `formatScore` import tại `chess.ts:4` nhưng không dùng; công thức bị **chép tay lại** trong chuỗi script tại `chess.ts:170` và `chess.ts:484` | Sửa công thức một nơi, nơi kia vẫn sai |
| Magic number trùng lặp | Kích thước bàn cờ `360px` hardcode ở cả `board_renderer.ts:120-121` lẫn `chess.ts:248` (`360/8` để vẽ mũi tên) | Đổi một nơi, mũi tên lệch ô |

### 1.2. Engine "Arasan" — ❌ Không tồn tại

- **Không có binary, không có `.wasm`, không có mã spawn tiến trình nào.** Grep
  `spawn|child_process|Deno.Command|execFile` trong `plugs/chess/` → không kết quả.
- `engine/uci_protocol.ts` chỉ có **chiều nhận** (`parseUciInfoLine`, dòng 30-65) — không có
  hàm gửi lệnh `uci`/`position`/`go`, không có state machine.
- `engine/game_reviewer.ts:101-244` (`reviewGame`) **không gọi engine nào**, nó dùng
  `evaluatePositionHeuristic` (dòng 42-96): cộng giá trị quân + bonus trung tâm cố định
  (`centerBonus = 25/10`, dòng 69-70) + bonus mobility (`mobility * 3`, dòng 89-93).
- Chữ "Arasan Engine" trên giao diện (`chess.ts:59, 82, 338, 402`) là **text tĩnh**, gây hiểu
  lầm nghiêm trọng cho người dùng.
- Lý do chọn Arasan có ghi trong kế hoạch cũ (`02-phase-2-arasan-engine.md:2-3`): **vì license
  MIT** (tương thích mục tiêu thương mại hóa), không phải vì hiệu năng.

### 1.3. AI Gateway — ❌ Code chết hoàn toàn

- `server/ai-gateway/router.ts:72-81`: `handleRequest()` build xong `promptText` (dòng 57-69)
  rồi **vứt đi**, trả về **chuỗi văn bản hardcode cố định** ("Trắng đang chiếm ưu thế trung tâm
  nhờ cặp tốt d4-e4…") bất kể FEN/PGN/câu hỏi đầu vào là gì. Không có `fetch()`, không có SDK
  LLM nào.
- **Không đọc bất kỳ API key nào**: grep `API_KEY|apiKey|ANTHROPIC|OPENAI|Deno.env|process.env`
  trong `server/ai-gateway/` và `plugs/chess/` → chỉ khớp chuỗi literal `"openai"` trong khai
  báo type (`router.ts:4`).
- **Không được gắn vào server Rust**: grep `ai-gateway|ai_gateway|AiGatewayRouter|QuotaManager`
  trong `server/**/*.rs` → **không kết quả**. `server/src/handlers/` không có handler nào cho
  AI. Nghĩa là **không tồn tại HTTP endpoint nào** phục vụ nó.
- **Không được UI gọi tới**: `plugs/chess/ai/index.ts` chỉ được import bởi chính test của nó
  (`ai/gateway.test.ts:2`); `chess.ts` **không hề import** module `ai/`.
- `quota_manager.ts:23` dùng `new Map()` **in-memory** — mất sạch khi restart tiến trình.
- Bộ prompt tiếng Việt (`prompts.ts`, 26 dòng) soạn tốt nhưng **chưa từng được gửi đi đâu**.

### 1.4. Mobile (Capacitor) — ✅ Phần chắc chắn nhất

- Kiến trúc đúng: `capacitor.config.ts:4` nhúng bundle tĩnh (`webDir`), **không có `server.url`**
  → không phụ thuộc server ngoài. `EventedSpacePrimitives` chuyển sang `DataStoreSpacePrimitives`
  (IndexedDB) cho môi trường WebView (`mobile-app-implementation-plan.md:87-91`).
- Đã giải quyết đúng một bug thật sự khó: `WorkerSandbox` không tải được worker qua HTTP trong
  WebView (404) → chuyển sang nạp bytes từ IndexedDB thành **Blob URL Worker**. Đây là giải
  pháp kỹ thuật đúng đắn, tái dùng được cho engine WASM sau này.
- Định danh app đã đổi đúng: `com.chessnote.app` / "ChessNote" ở
  `mobile/capacitor.config.ts:2-3`, `android/app/build.gradle:3,6`,
  `android/app/src/main/res/values/strings.xml:3-5`, `ios/App/App.xcodeproj/project.pbxproj:312,333`.
- **Đã build thật**: APK tồn tại tại `android/app/build/outputs/apk/debug/app-debug.apk`
  (10,57 MB) — agent đã xác minh file có thật, không phải chỉ mô tả trong tài liệu.

**Còn sót:**
- `android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java:24`
  assert `"com.getcapacitor.app"` — **sẽ fail** vì packageName thật là `com.chessnote.app`.
- `android/app/src/test/java/com/getcapacitor/myapp/ExampleUnitTest.java:1` — package boilerplate
  chưa dọn.
- **Chưa có bằng chứng cài & chạy trên thiết bị/emulator thật**, chỉ có bằng chứng build thành công.

### 1.5. Dropbox Sync — ❌ Mồ côi, thiếu nửa quan trọng

- 3 hàm thật, gọi REST API Dropbox v2 trực tiếp bằng `fetch` (không cần SDK — tốt cho mục tiêu
  gọn nhẹ): `uploadFileToDropbox` (dòng 23-27), `downloadFileFromDropbox` (dòng 63-66),
  `listDropboxFiles` (dòng 92-94).
- **Docstring nói dối**: dòng 3 ghi "using Dropbox API v2 with OAuth2 PKCE" nhưng **không có
  một dòng OAuth nào** — không tạo `code_verifier`/`code_challenge`, không có endpoint
  `/oauth2/authorize` hay `/oauth2/token`.
- `DropboxConfig.refreshToken` khai báo tại dòng 8 nhưng **không dùng ở đâu cả** — token hết hạn
  là chết.
- `mode: "overwrite"` cứng (dòng 43) + `strict_conflict: false` (dòng 46) → **last-write-wins,
  mất dữ liệu** khi mobile và desktop cùng sửa một trang.
- Không có `deleteFile`, không retry/backoff khi 429, không xử lý 401.
- **Mồ côi hoàn toàn**: grep toàn repo → không plug manifest nào import, không command nào gọi.

### 1.6. Desktop (Tauri v2) — ⚠️ Đang làm dở, CHƯA COMMIT

> ⚠️ **Cảnh báo phối hợp**: phần này đang nằm trong working tree **chưa commit**, do một phiên
> Claude Code khác đang làm song song. Phải chạy `git status` trước khi động vào.

- Đã có thật và **đã compile được** (`desktop/src-tauri/target/debug/` có `.rlib`).
- `desktop/src-tauri/{Cargo.toml,tauri.conf.json}` đã commit ở dạng **Tauri v1 legacy schema**,
  nhưng working tree đã nâng lên **v2 đúng chuẩn** (`$schema: schema.tauri.app/config/2`).
- Chưa commit: `build.rs`, `src/main.rs`, `src/lib.rs`, `icons/`, `Cargo.lock`, `gen/schemas/`.
- Root `Cargo.toml` đã thêm `exclude = ["desktop/src-tauri"]` để workspace Rust chính không build
  lây crate Tauri — đúng.

**Thiếu:**
- **Không có `desktop/src-tauri/capabilities/default.json`** — Tauri v2 **bắt buộc** khai báo
  permission cho plugin. `lib.rs:23-26` đăng ký `tauri_plugin_{dialog,fs,shell,process}` nhưng
  thiếu file này thì **runtime sẽ bị chặn quyền** dù compile sạch.
- `@tauri-apps/cli` có trong `package.json:142` nhưng **chưa `npm install`** → `npm run
  desktop:dev` hiện tại sẽ fail.
- `desktop/src-tauri/target/` **không nằm trong `.gitignore`** (`.gitignore:38` chỉ có `/target`
  neo ở root) → rủi ro commit nhầm hàng trăm MB build cache.
- Chưa có tích hợp engine nào, chỉ có 1 command demo `get_app_info`.
- Tài liệu `docs/plans/2026-09-07-huong-dan-chay-desktop-app.md:70` **claim sai** rằng bàn cờ
  "hỗ trợ đầy đủ… khả năng kéo thả" — thực tế chưa có kéo thả.

### 1.7. Rủi ro trùng lặp bundle — ⚠️ Hai nguồn sự thật

Tồn tại **song song hai bản** plug cờ vua:
1. `plugs/chess/*.ts` — source, được `build/build_plugs.ts:18-20` biên dịch lại mỗi lần build.
2. `libraries/Library/Chess/Chess.plug.js` — **bundle 1.138 dòng đã biên dịch, đóng băng** tại
   thời điểm commit, được `build_plugs.ts:29-31` copy nguyên trạng.

Sửa source mà quên cập nhật bản đóng băng → hai bản lệch nhau, lỗi rất khó truy.

### 1.8. Chất lượng test — ⚠️ Xanh nhưng vô nghĩa

Đã chạy thật: `vitest run` → **12/12 test pass** (`chess.test.ts` 4, `engine.test.ts` 5,
`ai/gateway.test.ts` 3). Nhưng:
- `chess.test.ts` chỉ `toContain(...)` trên chuỗi HTML — test cấu trúc chuỗi, không test hành vi.
- `engine.test.ts` test parser/toán thuần và chính hàm heuristic giả — **không thể fail vì thiếu
  Arasan**, vì nó chưa bao giờ đòi hỏi Arasan.
- `ai/gateway.test.ts:44` assert `res.content` chứa `"Phân tích bởi Grandmaster AI"` — tức là
  **test đang xác nhận cái stub giả là "đúng"**, sẽ mãi xanh kể cả khi AI hoàn toàn không tồn tại.
- **Không có marker `TODO`/`FIXME`/`stub` nào** trong `plugs/chess/` và `server/ai-gateway/` —
  code được viết như thể đã hoàn chỉnh, không cảnh báo người đọc sau.

### 1.9. Giấy phép — ✅ Sạch, đúng mục tiêu thương mại

- Root `LICENSE.md`: **MIT** (Copyright 2022, Zef Hemel) — cho phép sửa, phân phối, bán.
- Dependency mới: `chess.js@^1.4.0` (BSD/MIT), `@capacitor/*` (MIT). Không có GPL/AGPL nào.
- Arasan cũng là MIT → giữ được mục tiêu "100% permissive license".
- ⚠️ Ghi chú ngoài lề: `preact` bị nới pin từ `"10.28.2"` → `"^10.25.0"`, có thể là thay đổi
  ngoài ý muốn, nên rà lại.

---

## 2. HAI QUYẾT ĐỊNH ĐÃ CHỐT

### Quyết định 1: Mô hình AI = **CÁ NHÂN** (không phải SaaS đa người dùng)

**Hệ quả bắt buộc:**
- **Gỡ bỏ toàn bộ tầng billing 3-tier** trong `quota_manager.ts` (`TIER_LIMITS` dòng 16-20:
  Free $0 / Pro $9 / Master $19, đếm quota theo `userId` dòng 25-51). Không có khách hàng trả
  phí thì không cần tier, không cần quota theo user.
- **Được phép** dùng subscription-bridge (chạy CLI chính chủ của nhà cung cấp) — hợp lệ vì phục
  vụ đúng chính chủ tài khoản.
- **Ranh giới phải ghi rõ trong code và UI**: nếu sau này mở cho nhiều người dùng hoặc bán ra
  ngoài thì **bắt buộc chuyển sang API key trả phí**. Gói thuê bao cá nhân không phủ trường hợp
  đó và đã có tiền lệ khoá tài khoản. Vì vậy **dựng sẵn công tắc chuyển API key ngay từ đầu**,
  không để làm sau.

### Quyết định 2: Engine = **ĐẦU TƯ ARASAN WASM THẬT**

Không dùng giải pháp tạm (gọi API online). Chấp nhận đây là hạng mục nặng nhất, đổi lại: hoạt
động offline hoàn toàn, license MIT sạch, đúng kế hoạch gốc `02-phase-2`.

---

## 3. KẾ HOẠCH HOÀN THIỆN (thứ tự triển khai đề xuất)

### Giai đoạn 0 — Vá gấp (nửa ngày, không phụ thuộc quyết định nào)

| # | Việc | File |
|---|---|---|
| 0.1 | Sửa/xóa 2 file test Android boilerplate sai package | `android/app/src/{androidTest,test}/java/com/getcapacitor/myapp/*.java` |
| 0.2 | Thêm `desktop/src-tauri/target/`, `desktop/src-tauri/gen/` vào `.gitignore` | `.gitignore` |
| 0.3 | **Đổi nhãn gây hiểu lầm**: "Arasan Engine" → "Đánh giá sơ bộ (heuristic)"; "Grandmaster AI" → ẩn hẳn | `chess.ts:59,82,338,402`; `router.ts:74` |
| 0.4 | Sửa tài liệu claim sai "hỗ trợ kéo thả" | `docs/plans/2026-09-07-huong-dan-chay-desktop-app.md:70` |
| 0.5 | Dedupe bundle: **xóa** `libraries/Library/Chess/Chess.plug.js`, để build sinh từ source | `libraries/Library/Chess/` |
| 0.6 | Rà lại pin `preact` (`^10.25.0` → `10.28.2`?) | `package.json` |

**Nguyên tắc**: từ nay mọi phần chưa làm thật phải có marker `TODO`/comment cảnh báo rõ ràng
trong code, tuyệt đối không viết stub trông như đã hoàn chỉnh.

### Giai đoạn 1 — Bàn cờ chơi được thật (ưu tiên cao nhất về giá trị người dùng)

1. Đưa `chess.js` vào được script chạy trong iframe (bundle vào chuỗi script, hoặc nạp ESM từ
   CDN trong sandbox) để tính legal move ngay phía client.
2. `fenWidget`: click-to-move + drag-and-drop thật, chỉ cho phép nước hợp lệ, cập nhật FEN.
3. `puzzleWidget`: so khớp nước người dùng với đáp án, gán `.correct`/`.wrong` (CSS đã sẵn),
   hiện phản hồi ngay; tự xoay bàn theo bên cần đi.
4. `pgnWidget`: validate nước đi, hỗ trợ biến thể (variations) và NAG như `01-phase-1` mô tả.
5. Thay việc nuốt lỗi im lặng bằng thông báo lỗi rõ ràng trên widget.
6. Gom `360px` thành một hằng số dùng chung cho cả CSS lẫn toán vẽ mũi tên.
7. Xóa import chết `centipawnsToWinChance`/`formatScore` ở `chess.ts:4`, dùng thật hoặc bỏ.

### Giai đoạn 2 — Arasan WASM thật (hạng mục nặng nhất, chia 6 bước)

1. **Pipeline build**: lấy source Arasan (MIT, Jon Dart), biên dịch bằng Emscripten (`emcc`) ra
   `arasan.wasm` + JS glue. Bắt đầu **bản single-thread** để tránh phụ thuộc SharedArrayBuffer +
   header COOP/COEP (rất khó bật trong WebView Capacitor). Đo dung lượng `.wasm` và RAM thực tế,
   đối chiếu chỉ tiêu ≤128 MB của `02-phase-2`.
2. **Hoàn thiện lớp UCI hai chiều**: bổ sung chiều gửi (`uci`, `isready`, `position fen …`,
   `go depth N`, `stop`) + state machine chờ `uciok`/`readyok`/`bestmove` vào `uci_protocol.ts`
   (hiện chỉ có chiều nhận).
3. **Chạy trong Web Worker riêng**, giao tiếp bằng message — tái dùng đúng cơ chế Blob URL Worker
   mà phiên trước đã dựng cho Capacitor (`client_system.ts`, `worker_sandbox.ts`).
4. **Đóng gói `.wasm` làm asset của plug**: khai báo `assets:` trong `chess.plug.yaml`, đọc bằng
   `asset.readAsset`. Đây chính là lý do phần này **phải** là Plug TypeScript — Space Lua không
   đóng gói được asset nhị phân lớn.
5. **Thay heuristic giả bằng engine thật**: nối vào `reviewGame()` (`game_reviewer.ts`, thay
   `evaluatePositionHeuristic`) và nút "Engine Eval" (`chess.ts:147-158`).
6. **Desktop dùng bản native nhanh hơn**: trên Tauri spawn binary Arasan qua `tauri-plugin-shell`
   (UCI subprocess), dùng chung lớp UCI ở bước 2, chỉ khác lớp transport.

### Giai đoạn 3 — AI cá nhân qua subscription-bridge

1. **Dọn trước**: gỡ `quota_manager.ts` (mô hình bán hàng), viết lại `router.ts` (đang trả chuỗi
   giả).
2. **Kiến trúc = Sidecar**: server ChessNote là Rust (không phải Node/Python) → chạy CLI trong
   tiến trình Node riêng; server Rust gọi sang qua HTTP nội bộ.
3. **Tuyệt đối không tự đọc/giải mã token OAuth** rồi gọi thẳng API nhà cung cấp — đường này đã
   bị chặn từ 04/2026 (nhận diện qua dấu vân tay request thiếu telemetry của CLI). Luôn để
   **chính binary CLI** gửi request.
4. **Khuôn đăng nhập riêng cho từng CLI** (không dùng chung một khuôn):
   - **Claude Code**: pipe + regex — spawn CLI, bắt URL từ stdout, ghi mã người dùng dán vào stdin.
   - **Codex/ChatGPT**: tự implement OAuth device-code/PKCE, bắc cầu file token cho CLI đọc.
   - **Antigravity (`agy`)**: token nằm trong keyring hệ điều hành → **không bắc cầu được**, chỉ
     hướng dẫn người dùng tự chạy `agy login`.
   - **Grok/xAI**: **không có đường chính thức nào** → bỏ khỏi phạm vi, hoặc chỉ hỗ trợ qua API
     key. Đừng mất công tìm bridge.
5. **4 endpoint xác thực**: `/auth/status`, `/auth/start`, `/auth/code`, `/auth/logout` — gác bằng
   token nội bộ, quyền Admin. UI: nút → hiện URL → ô dán mã → thẻ trạng thái.
6. **Công tắc API key dựng ngay từ đầu**: mặc định `subscription`; giá trị cấu hình lạ rơi về
   `subscription`; biến môi trường API key rỗng cũng lùi về `subscription` thay vì làm chết mọi
   lượt gọi.
7. **Cảnh báo ranh giới ở nơi không thu gọn được** trong UI (không giấu trong tooltip): chế độ
   subscription chỉ hợp lệ cho một người dùng là chính chủ tài khoản.
8. **Thư mục token riêng cho từng CLI** (ví dụ `claude-auth`), tách khỏi thư mục state chung —
   dọn state không được làm mất đăng nhập.
9. **Timeout ≠ đăng xuất**: trả trạng thái `unknown`/`stale` riêng, đừng gộp vào `connected:false`.
10. **Giết tiến trình phải TERM trước, KILL sau**, giết cả cây tiến trình — SIGKILL rơi trúng lúc
    CLI ghi file token sẽ gây "tự nhiên bị đăng xuất".
11. **Wire vào UI thật**: thêm command/nút thật (ví dụ "Phân tích ván đấu bằng AI") gọi sang
    sidecar — hiện `plugs/chess/ai/index.ts` hoàn toàn là code chết.

### Giai đoạn 4 — Dropbox Sync hoàn thiện

1. Implement OAuth2 PKCE thật (authorize + token exchange), dùng `refreshToken` đã khai báo sẵn
   để tự gia hạn khi 401.
2. So sánh `rev`/`server_modified` trước khi ghi đè; nếu phát hiện xung đột thì tạo file
   `.conflict.md` như `04-phase-4` đã thiết kế, thay cho `mode: overwrite` mù quáng hiện tại.
3. Thêm retry/backoff cho 429, hàm xóa file, xử lý tombstone.
4. **Wire vào command/UI thật** — hiện không ai gọi tới nó.

### Giai đoạn 5 — Desktop Tauri v2 hoàn thiện

> Chạy `git status` trước; phối hợp với phiên đang làm dở để tránh đè lên nhau.

1. Thêm `desktop/src-tauri/capabilities/default.json` (bắt buộc, nếu không fs/dialog/shell bị
   chặn quyền lúc chạy). Có thể tham khảo file tương ứng trong nhánh `upstream/tauri-desktop`.
2. `npm install` để có `@tauri-apps/cli`; xác minh `npm run desktop:dev` và `desktop:build` chạy
   được thật.
3. Tích hợp Arasan native qua UCI subprocess (sau Giai đoạn 2 bước 6).
4. ⚠️ Lưu ý: nhánh `upstream/tauri-desktop` phân nhánh **trước** khi SilverBullet chuyển sang
   kiến trúc offline-first PWA, dùng sidecar server binary — **không áp dụng trực tiếp** được
   cho ChessNote; chỉ tham khảo cấu trúc `capabilities/` và cách đóng gói icon.

### Giai đoạn 6 — Kiểm thử thật

1. Test hành vi thật thay vì so khớp chuỗi: giả lập click nước đi → kiểm tra state bàn cờ đổi
   đúng; puzzle chấm đúng/sai đúng; PGN từ chối nước phi pháp.
2. Test AI gateway bằng mock HTTP thật, **không** tự so khớp chuỗi hardcode của chính mình.
3. Test UCI protocol với engine thật (hoặc engine giả trả output UCI chuẩn).
4. Cài & chạy thử mobile app trên thiết bị/emulator thật, không dừng ở "build APK thành công".
5. Xoá bỏ hoặc viết lại `ai/gateway.test.ts:44` (đang khoá cứng hành vi giả).

---

## 4. RỦI RO & LƯU Ý VẬN HÀNH

1. **Hai phiên Claude Code chạy song song trên cùng repo** — đây là nguyên nhân của toàn bộ tình
   huống này. Khuyến nghị: mỗi lần bắt đầu một hạng mục, `git status` trước; chốt một phiên làm
   một nhánh/phạm vi file riêng; dùng chính thư mục `docs/plans/` làm nơi ghi "ai đang làm gì".
2. **Không tin tài liệu tự báo cáo** — tài liệu trong `docs/plans/` của phiên trước có nhiều
   chỗ tự nhận hoàn thành ("hỗ trợ kéo thả", "OAuth2 PKCE") trong khi code không có. Luôn đối
   chiếu code trước khi tin.
3. **Build xanh ≠ tính năng chạy** — 12/12 test pass mà bàn cờ vẫn không đi được nước nào. Cần
   bổ sung tiêu chí "kiểm chứng bằng thao tác thật" trước khi tuyên bố hoàn thành.
4. **Ranh giới thương mại của AI** — hiện chốt dùng cá nhân. Nếu đổi ý muốn bán ra ngoài, phải
   quay lại thiết kế lại toàn bộ tầng AI theo mô hình API key có tính phí, không được tái dùng
   subscription cá nhân.

---

## 5. THỨ TỰ ƯU TIÊN ĐỀ XUẤT

```
Giai đoạn 0 (vá gấp, nửa ngày)
        ↓
Giai đoạn 1 (bàn cờ chơi được — giá trị người dùng cao nhất, độ khó vừa)
        ↓
Giai đoạn 2 (Arasan WASM — nặng nhất, nên làm khi bàn cờ đã ổn định)
        ↓
Giai đoạn 3 (AI cá nhân) ─── song song được với ─── Giai đoạn 4 (Dropbox) & 5 (Desktop)
        ↓
Giai đoạn 6 (kiểm thử thật — làm dần xuyên suốt, không dồn cuối)
```

**Lý do**: Giai đoạn 1 biến sản phẩm từ "ảnh tĩnh" thành "dùng được thật" với chi phí thấp nhất.
Giai đoạn 2 nặng nhưng là lõi khác biệt của sản phẩm. Giai đoạn 3-5 độc lập nhau, chia được cho
nhiều phiên/người làm song song mà ít đụng file.
