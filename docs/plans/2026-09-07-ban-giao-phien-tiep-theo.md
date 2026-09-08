# Bàn giao phiên làm việc — tiếp tục hoàn thiện ChessNote

> Viết ngày 2026-09-07, cuối một phiên Claude Code dài (rà soát + Giai đoạn 0/1/2 của kế hoạch
> cải thiện ChessNote). Mục đích: cho phiên **mới** đủ ngữ cảnh để tiếp tục mà không cần đọc lại
> toàn bộ lịch sử hội thoại cũ. Đọc kèm tài liệu gốc:
> `docs/plans/2026-09-07-danh-gia-va-ke-hoach-hoan-thien-chessnote.md` (audit đầy đủ + kế hoạch
> 6 giai đoạn + nhật ký triển khai chi tiết từng giai đoạn, mục 3b/3c/3d).

## 1. Bối cảnh dự án (bắt buộc đọc trước khi làm gì)

- Repo `D:\code\chessnote` **thực chất là fork của SilverBullet** (app ghi chú wiki tự host,
  không phải phần mềm cờ vua gốc) — đang được một người dùng cá nhân tùy biến thành **"ChessNote"**,
  một app chuyên về cờ vua, với tham vọng thương mại hóa sau này (nên **chỉ dùng phần mềm/thư
  viện có giấy phép MIT hoặc tương đương**).
- **Quy ước bắt buộc**: mọi tài liệu kế hoạch của dự án này lưu trong `docs/plans/` của repo,
  đặt tên `YYYY-MM-DD-mo-ta-ngan.md`.
- Một **phiên Claude Code khác chạy song song** trên máy khác của cùng người dùng đang làm dở
  phần **Desktop (Tauri v2)** — có thay đổi CHƯA COMMIT trong `desktop/src-tauri/` và
  `Cargo.toml` (thêm `exclude = ["desktop/src-tauri"]`). **TUYỆT ĐỐI KHÔNG ĐỘNG VÀO** các file
  này (`desktop/src-tauri/*`, `Cargo.toml` gốc) — luôn `git status --short` trước khi bắt đầu
  bất kỳ việc gì để xác nhận chưa có gì mới bị đụng.

## 2. Hai quyết định đã chốt với người dùng (không cần hỏi lại)

1. **Mô hình AI = CHỈ DÙNG CÁ NHÂN** (một người dùng, tự host) — không phải SaaS đa người dùng.
   Được phép dùng kỹ thuật "subscription-bridge" (chạy CLI chính chủ của Claude/Codex/Gemini...)
   nhưng phải có công tắc chuyển sang API key trả phí ngay từ đầu (phòng khi mở rộng ra nhiều
   người dùng — bắt buộc theo điều khoản dịch vụ).
2. **Engine = Arasan WASM thật** (đã đầu tư xong, xem mục 3 bên dưới) — không dùng giải pháp gọi
   API online tạm thời.

## 3. Đã hoàn thành trong phiên vừa rồi (Giai đoạn 0 → 2)

Đã commit tuần tự (không amend), theo đúng nhánh `main`:

| Commit | Nội dung |
|---|---|
| `183b84f0` | Giai đoạn 0 — vá lỗi/rủi ro cấp bách sau audit (nhãn UI lừa dối, bug test Android, `.gitignore`, xoá bundle plug trùng lặp) |
| `8d1c6166` | Giai đoạn 1 — bàn cờ chơi được thật (click-to-move qua chess.js), puzzle chấm đúng/sai thật, vá 2 lỗi nghiêm trọng mới phát hiện (xem bên dưới) |
| `33f954bd` | Giai đoạn 2 — build pipeline Emscripten cho Arasan (MIT, NNUE) thành WASM thật, nối vào nút "⚡ Engine Eval" của `fenWidget` |
| `0cb2a3c2` | Giai đoạn 2 (tiếp) — nối `pgnWidget` (Engine Eval + Game Review) và `engine/game_reviewer.ts` vào engine thật, thay heuristic |

**Trạng thái hiện tại của tính năng cờ vua** (đã kiểm chứng qua trình duyệt thật, bản release
binary, không chỉ unit test):
- `fenWidget` (khối ` ```fen `): click-to-move thật, vẽ mũi tên nước tốt nhất, nút "⚡ Engine
  Eval" gọi Arasan thật (NNUE, WASM) qua syscall `chess.engineEval`.
- `puzzleWidget` (khối ` ```puzzle `): chấm đúng/sai thật bằng chess.js, tự động phát nước đối
  phương.
- `pgnWidget` (khối ` ```pgn `): duyệt ván tức thì (chess.js, đồng bộ, không phụ thuộc engine).
  Nút "⚡ Engine Eval" phân tích trực tiếp vị trí đang xem bằng Arasan thật. Nút "📊 Game Review"
  gọi syscall `chess.reviewGame` (lười biếng, chỉ khi bấm) — chạy Arasan thật cho từng vị trí
  trong ván (N+1 lần gọi cho N nước), chấm % chính xác + gắn nhãn brilliant/best/good/
  inaccuracy/mistake/blunder/book cho từng nước.
- Engine Arasan (mã nguồn MIT của Jon Dart, `jdart1/arasan-chess`, có NNUE) đã biên dịch WASM
  bằng Emscripten, **nhúng thẳng vào chính binary server** (không phải "Library tùy chọn cài
  thêm" như giả định ban đầu — xem phát hiện kiến trúc ở mục 3c của tài liệu gốc) — mọi bản
  build ChessNote chuẩn đều có sẵn ~26MB dữ liệu engine, không cần cài thêm gì.

**3 lỗi thật đã tìm ra và sửa trong lúc kiểm chứng trực tiếp** (không lỗi nào lộ ra khi chỉ chạy
`vitest`/build xanh — đây là bài học lặp lại xuyên suốt phiên: **luôn kiểm chứng qua trình duyệt
thật trước khi báo "xong"**):
1. `build/build_client.ts` (mobile) từng ghi đè `.client/index.html` thật, làm hỏng toàn bộ web
   app cho user tự host thường (đã sửa bằng flag `--mobile`).
2. Puzzle demo mẫu có sẵn trong repo bị sai luật cờ (vua chưa nhập thành nhưng đáp án giả định
   đã nhập thành) — đã sửa FEN, thêm test hồi quy.
3. Gửi `quit` cùng batch stdin với `go depth N` khiến Arasan luôn dừng tìm kiếm ở depth 1 bất kể
   depth yêu cầu — đã sửa (bỏ `quit`, để engine tự thoát khi gặp EOF).
4. (Nhỏ hơn) Nút Engine Eval hiện sai "0.0" khi xem vị trí đã chiếu hết — đã sửa bằng cách kiểm
   tra `chess.isGameOver()` trước khi gọi engine, đặt trong `evalPosition()` để dùng chung mọi nơi.

## 4. Việc CHƯA làm (theo đúng thứ tự đề xuất trong tài liệu gốc, mục 3 & 5)

- **`pgnWidget`'s Game Review** hiện chạy engine cho TỪNG ván riêng lẻ, mỗi lần bấm — vẫn CHƯA
  tối ưu cho việc tái sử dụng module WASM giữa các lần review khác nhau (không quan trọng, không
  cần làm thêm trừ khi có vấn đề hiệu năng thực tế).
- **Giai đoạn 3 — AI cá nhân qua subscription-bridge** (chưa bắt đầu): dọn `quota_manager.ts`
  (mô hình SaaS 3-tier không còn phù hợp), viết lại `router.ts` (đang trả chuỗi giả cố định),
  dựng kiến trúc sidecar cho CLI (Claude Code/Codex/Gemini), 4 endpoint xác thực, công tắc
  chuyển API key. Xem chi tiết đầy đủ ở mục 3, phần "Giai đoạn 3" của tài liệu gốc.
- **Giai đoạn 4 — Dropbox Sync hoàn thiện** (chưa bắt đầu): thêm OAuth2 PKCE thật, xử lý xung đột
  ghi đè, nối vào UI thật (hiện mồ côi, không ai gọi).
- **Giai đoạn 5 — Desktop (Tauri v2)**: **phiên song song đang làm dở**, không tự ý động vào.
  Nếu người dùng yêu cầu tiếp tục phần này, phải `git status` trước và chỉ thao tác trên
  `desktop/` khi chắc chắn không đè lên việc đang dở.
- **Giai đoạn 6 — Kiểm thử thật, không chỉ hời hợt**: bổ sung test hành vi thật hơn nữa, xác nhận
  cài & chạy thử mobile app trên thiết bị/emulator thật.

## 5. Ghi chú kỹ thuật/công cụ quan trọng (tránh mất thời gian lặp lại)

- **Windows/git-bash**: mỗi lệnh Bash là một shell mới — `source` phải chạy lại mỗi lần, không
  qua pipe. Tìm PID Windows thật để `taskkill` (không dùng PID của `ps` trong git-bash) bằng:
  `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='silverbullet.exe'\" | Select-Object ProcessId,CommandLine"`.
- **Build nhanh khi lặp code TS/plug**: `cargo run -p silverbullet -- -p <port> <space>` (KHÔNG
  `--release`) đọc `client_bundle/base_fs` trực tiếp từ đĩa mỗi request (rust-embed's
  `debug-embed` feature không bật) — chỉ cần `npm run build:plugs` lại là server debug tự nhận
  bản mới, không cần build lại Rust. Bản `--release` thì NHÚNG CỨNG vào binary lúc compile — phải
  `cargo build --release` lại mỗi lần đổi code TS nếu muốn verify trên bản release.
- **Kiểm chứng qua trình duyệt (Chrome DevTools Protocol qua `mcp__claude-in-chrome__*`)**:
  - **Click theo toạ độ pixel không đáng tin cậy** để đưa con trỏ ra khỏi khối code (điều kiện
    để widget hiện ra thay vì hiện markdown thô) — đôi khi lệch cả một dòng so với
    `getBoundingClientRect()` tính toán được. **Ưu tiên điều hướng bàn phím** (`Ctrl+End` để về
    cuối văn bản) hoặc gọi thẳng `element.click()` qua `javascript_tool` khi cần bấm nút cụ thể
    bên trong iframe sandbox (widget dùng `renderMode: iframe`).
  - Sau khi sửa file/rebuild plug trong lúc trình duyệt đang mở, thường cần **đóng tab cũ, mở
    tab mới, và đôi khi navigate 2 lần** ("A reload or two is required to update" — thông báo
    PWA service-worker chuẩn của SilverBullet, không phải lỗi).
  - `Page.captureScreenshot` qua CDP thỉnh thoảng timeout 30s dưới tải máy cao (nhiều tiến trình
    cargo/node chạy song song) — không có nghĩa là trang bị treo thật; dùng `javascript_tool`
    (`document.title`, `!!document.querySelector(...)`) để xác minh trang vẫn phản hồi thay vì
    kết luận vội trang bị "treo".
- **Không cần thiết kế "engine sống xuyên suốt ván"** cho Game Review — đã đo thực tế: mỗi lần
  gọi `evalPosition()` (khởi tạo module WASM mới + nạp NNUE 25MB) chỉ mất ~0.4-0.7 giây, không
  phụ thuộc nhiều vào depth. Tạo mới mỗi vị trí là đủ nhanh, không cần tối ưu thêm.

## 6. File/lệnh quan trọng để tiếp tục

- `plugs/chess/chess.ts` — 2 code widget chính (`fenWidget`, `pgnWidget`) + `puzzleWidget`.
- `plugs/chess/engine/arasan_engine.ts` — gọi engine Arasan WASM thật (`evalPosition()`).
- `plugs/chess/engine/game_reviewer.ts` — `buildMoveList()` (đồng bộ) + `reviewGame()` (async,
  engine thật).
- `plugs/chess/chess.plug.yaml` — đăng ký syscall (`chess.engineEval`, `chess.reviewGame`,
  `chess.legalMoves`, `chess.applyMove`, `chess.applySan`).
- `server/ai-gateway/{router,quota_manager,prompts}.ts`, `plugs/chess/ai/index.ts` — AI Gateway
  (Giai đoạn 3, chưa làm, hiện là code chết/giả).
- `plugs/sync/dropbox_sync.ts` — Dropbox sync (Giai đoạn 4, chưa làm, mồ côi không ai gọi).
- `desktop/src-tauri/` — **KHÔNG ĐỘNG VÀO**, phiên song song đang làm dở.
- Build đầy đủ: `npm run build:plugs && npm run build:client && cargo build --release -p silverbullet`.
- Test: `npm run check` (tsc) + `npx vitest run` (toàn repo — hiện có đúng 1 lỗi không liên quan
  từ trước, `client/space_lua/lua.test.ts`, hệ thống Lua, không đụng tới `plugs/chess`).

## 7. Trạng thái server demo (nếu còn chạy)

Cuối phiên trước, một server release đang chạy tại `http://localhost:3939` để người dùng xem thử
(không gian test tại thư mục scratchpad của phiên cũ — sẽ mất khi máy khởi động lại hoặc phiên
đó dọn dẹp). Nếu phiên mới cần demo lại, tạo không gian mới hoặc hỏi người dùng có muốn dùng lại
đường dẫn cũ không; đừng giả định nó vẫn còn chạy.

## 8. Trạng thái git

- Nhánh `main`, không có gì đang stage ngoài các thay đổi hợp lệ đã liệt kê ở trên.
- `git status --short` tại thời điểm bàn giao chỉ còn:
  ```
   M Cargo.toml
   M desktop/src-tauri/Cargo.toml
   M desktop/src-tauri/tauri.conf.json
  ?? desktop/src-tauri/Cargo.lock
  ?? desktop/src-tauri/build.rs
  ?? desktop/src-tauri/icons/
  ?? desktop/src-tauri/src/
  ```
  Toàn bộ đều thuộc phiên song song (Desktop Tauri) — **không stage, không commit, không sửa**.
