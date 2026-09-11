# Tư vấn & Lộ trình bổ sung DBMS (SQLite WASM) cho ChessNote

> **Ngày lập**: 11/09/2026
> **Trạng thái**: Đã duyệt định hướng — sẵn sàng triển khai Phase 1
> **Bối cảnh yêu cầu**: Người dùng hỏi liệu bổ sung một hệ thống quản lý cơ sở dữ liệu (DBMS)
> có "gia tăng sức mạnh" cho ChessNote không, đặc biệt là cho việc tích hợp AI, và muốn có
> tư vấn + kế hoạch cụ thể.

---

## 1. Khảo sát hiện trạng (bằng chứng từ mã nguồn thật)

### 1.1. Kiến trúc lưu trữ hiện tại — chỉ là IndexedDB thô, không có DB thật

- `client/data/indexeddb_kv_primitives.ts`: một object store IndexedDB duy nhất, không có
  secondary index. Mọi truy vấn chỉ là **quét theo prefix key**.
- `plugs/index/` (Object Index — nơi lưu `chess-game`, `chess-game-review`): mọi truy vấn
  theo tag (`index.queryLuaObjects("chess-game", {})`) đều **nạp toàn bộ object của tag đó
  vào bộ nhớ rồi lọc bằng JS/Lua** — không có query planner, không compound index, không
  full-text search, không vector search.
- Server (Rust) hoàn toàn không có DB — chỉ là file phẳng trên đĩa
  (`server-common/src/space/disk.rs`). Mọi index/truy vấn diễn ra ở client, mỗi thiết bị tự
  xây lại từ file.
- Chính code cờ vua đã tự thừa nhận giới hạn này:
  - `plugs/chess/related_games.ts` có comment: "chưa làm vector embedding search... quyết
    định có chủ đích, để dành làm sau nếu chất lượng rule-based này không đủ tốt".
  - `plugs/chess/ai/qa.ts` dùng keyword-OR thô sơ (so khớp trên `white+black+result+eco+
    event+summary`) vì "ai-sidecar chưa có endpoint embedding"; kết quả bị chặn cứng ở
    `MAX_CONTEXT_GAMES = 15` vì không có cơ chế xếp hạng đáng tin cậy hơn.
  - `docs/plans/2026-09-09-ai-pham-vi-rong-nhieu-ghi-chu.md` §9 tự ghi: "Object Index: lưu
    IndexedDB trình duyệt, truy vấn theo tag là full-scan rồi lọc trong bộ nhớ... ổn với vài
    trăm-vài nghìn ván... chưa kiểm chứng ở quy mô lớn hơn."
- `plugs/chess/index.ts` (`ChessGameFields`) chỉ lưu `page, pgn, white, black, result, date
  (chuỗi thô), eco, event` — không có ngày đã parse, không có Elo/time control, không biết
  "người dùng cầm quân nào" → không thể trả lời được các câu hỏi kiểu "tỷ lệ thắng khi chơi
  Sicilian cầm Trắng trong 6 tháng qua".
- `docs/plans/00-master-plan-chessnote.md` Giai đoạn 3 đã có mục **"Sổ tay Khai cuộc
  (Repertoire Tree) & Luyện nhớ biến (SRS)"** trong roadmap nhưng chưa làm được — đây là bài
  toán SQL kinh điển (lịch ôn tập theo due-date/ease-factor), rất khó làm tốt trên Object
  Index full-scan.

### 1.2. Kết luận tư vấn

**Có, nên bổ sung — nhưng là một DB nhúng (embedded) chạy trên client, không phải server
DB**, để giữ nguyên triết lý offline-first + đồng bộ qua file hiện có (Dropbox/WebDAV/
ChessNote Cloud không cần đổi gì). File PGN/Markdown vẫn là nguồn sự thật duy nhất; DB chỉ là
một tầng cache/chỉ mục có thể xây lại được — đúng tinh thần Object Index hiện tại (ADR-002
trong `MEMORY.md`: cache tự xóa khi trang được lưu lại), chỉ là mạnh hơn nhiều.

**Công nghệ đã chọn: SQLite WASM** (gói chính chủ `@sqlite.org/sqlite-wasm`) — nhỏ gọn hơn
PGlite (Postgres WASM), có sẵn FTS5 (full-text search) built-in, hệ sinh thái cờ vua quen
thuộc với SQLite, có thể thêm vector search sau qua extension `sqlite-vec` nếu cần.

### 1.3. Ràng buộc kiến trúc quan trọng

Theo `CLAUDE.md`: mọi mã trong `plugs/chess/` chạy trong **Web Worker Plug Sandbox**, không
được gọi thẳng DOM/IndexedDB/WASM ngoài luồng — phải qua Syscalls (giống cách `index`,
`datastore` hiện có, đăng ký tại `client/client_system.ts` dòng ~215-239 qua
`system.registerSyscalls([], ...)`). Vì vậy engine SQLite phải sống ở **client chính**
(`client/`), expose ra plug qua một syscall mới — không nhúng trực tiếp vào Worker của plug.

Về độ bền dữ liệu: SQLite WASM cần OPFS để lưu bền vững qua các lần tải lại; hỗ trợ OPFS khác
nhau giữa 3 nền tảng (Chrome web, WebView2 desktop, WebView Android). **Phase 1 chọn phương
án an toàn nhất**: coi SQL DB như cache có thể xây lại hoàn toàn từ file nguồn (in-memory nếu
OPFS không có sẵn, không mất dữ liệu thật vì file PGN vẫn còn) — y hệt triết lý Object Index
đang dùng. Việc bền hóa qua OPFS để lại làm Phase sau, chỉ khi số ván đủ lớn để việc
build-lại-mỗi-lần-mở-app trở nên chậm rõ rệt.

---

## 2. Danh sách tính năng được bổ sung, và ích lợi cho AI

Đây là câu trả lời trực tiếp cho câu hỏi "có tốt cho tích hợp AI không": **có, và đây mới là
lý do chính đáng nhất để làm** — lợi ích lớn nhất không phải tốc độ, mà là khả năng mở rộng
các tính năng AI hiện có.

**Nguyên tắc chống hallucination hiện tại của ChessNote** (xem `plugs/chess/ai/trends.ts`,
`coach.ts`): AI chỉ được thấy **số liệu đã gộp/xác thực** từ engine thật, không bao giờ tự
đọc PGN thô để tự suy luận. Nguyên tắc này rất tốt nhưng hiện phải viết tay logic JS riêng
cho mỗi câu hỏi thống kê mới; có SQL thì mỗi câu hỏi mới chỉ là một câu query.

| Phase | Tính năng | Ích lợi cho AI |
|---|---|---|
| **Phase 1** (làm ngay) | Lệnh "Thống kê khai cuộc" — lọc theo tên người chơi + khoảng ngày, gộp thắng/thua/hòa theo ECO bằng `GROUP BY` SQL thật | Nền tảng — chứng minh SQL hoạt động, không trực tiếp AI |
| **Phase 2** | Full-text search thật (SQLite FTS5) trên PGN comments, tóm tắt AI, tag | **Quan trọng nhất**: nâng cấp `ai/qa.ts` từ keyword-OR thô (giới hạn 15 ván) lên tìm kiếm có xếp hạng thật, tăng chất lượng RAG |
| **Phase 3** | Mở rộng schema (Elo, time control, tên đầy đủ khai cuộc), migrate `related_games.ts` sang SQL có điều kiện | Cho AI coach ngữ cảnh đầy đủ hơn (blitz vs cờ chậm, theo trình độ) — hiện các trường này không tồn tại |
| **Phase 4** | Sổ tay Khai cuộc (Repertoire) + SRS — bảng `repertoire_lines(due_date, ease_factor, review_count)` | AI đề xuất/phê bình biến khai cuộc, DB lưu lịch ôn tập đáng tin cậy qua transaction — AI+DB cộng hưởng trực tiếp |
| **Phase 5 (stretch)** | Semantic/vector search (`sqlite-vec` + embedding cục bộ qua WASM model như transformers.js) | **Mạnh nhất**: biến `ai/qa.ts` thành RAG ngữ nghĩa thật (tìm được cả khi câu hỏi không trùng từ khóa), mở khóa "tìm ván có motif/sai lầm tương tự" mà `related_games.ts` hiện là rule-based tạm thời |
| **Phase 5b** | Lưu trữ có cấu trúc cho output AI (tag/tóm tắt/độ tin cậy/phiên bản model) thay YAML frontmatter chắp vá (ADR-002) | Truy vấn "mọi ván AI gắn tag X với độ tin cậy > 0.8", re-chạy annotation cũ khi nâng cấp model mà không đụng ván đã ổn định |
| *Ngoài phạm vi* | DB phía server (ChessNote Cloud) cho truy vấn đa người dùng/đa thiết bị (dashboard huấn luyện viên) | Kiến trúc lớn hơn nhiều, chỉ cân nhắc nếu có nhu cầu multi-user thật sự |

---

## 3. Phase 1 — Kế hoạch triển khai chi tiết (proof of concept)

Đã điều chỉnh nhỏ so với ý tưởng ban đầu: bottleneck thật của `commandAnalyzeTrends` là chạy
engine Arasan (10-40s/ván), không phải bước tổng hợp số liệu (đã nhanh sẵn). Chuyển bước đó
sang SQL sẽ không tạo khác biệt người dùng cảm nhận được. Để chứng minh sức mạnh SQL thật sự
(điều kiện lọc + GROUP BY mà Object Index không làm được), Phase 1 **giữ nguyên
`trends.ts`/engine review**, và thêm một **lệnh mới** chạy tức thời, không cần engine.

### Các bước

1. **Thêm dependency**: `@sqlite.org/sqlite-wasm` vào `package.json`.
2. **`client/data/chess_sql_store.ts`** (mới): khởi tạo DB SQLite (thử OPFS, fallback
   in-memory), bảng:
   ```sql
   CREATE TABLE chess_games (
     ref TEXT PRIMARY KEY,
     page TEXT NOT NULL,
     white TEXT, black TEXT, result TEXT,
     date_raw TEXT, date_parsed TEXT,   -- ISO 8601, NULL nếu không parse được
     eco TEXT, event TEXT
   );
   CREATE INDEX idx_chess_games_page ON chess_games(page);
   CREATE INDEX idx_chess_games_eco ON chess_games(eco);
   ```
   Hàm: `upsertGames(games)`, `deleteGamesForPage(page)`, `queryOpeningStats({ playerName,
   sinceDate })` (SQL `GROUP BY eco` tính thắng/hòa/thua/tổng số theo đúng màu quân của
   `playerName`).
3. **Syscall mới**: `client/plugos/syscalls/chess_sql.ts`, đăng ký trong
   `client/client_system.ts` cạnh `indexSyscalls(...)` (dòng ~227) theo đúng pattern
   `registerSyscalls([], chessSqlSyscalls(...))` đã có trong file.
4. **`plugs/chess/index.ts`**: trong `indexChessGames()`, sau khi `index.indexObjects(...)`
   như cũ, gọi thêm `chessSql.upsertGames(games)` — dùng lại đúng event `page:index` đã có,
   không cần cơ chế trigger mới. Khi trang bị xóa/reindex sạch, gọi
   `chessSql.deleteGamesForPage(name)` (đối chiếu cơ chế `clearFileIndex` hiện có của Object
   Index để đồng bộ vòng đời).
5. **Lệnh mới** `plugs/chess/ai/opening_stats.ts`: `commandOpeningStats()` — hỏi tên người
   chơi (mặc định đọc từ `system.getConfig("chess.playerName")`, có tùy chọn lưu làm mặc
   định toàn cục, theo đúng pattern piece-set/theme đã làm gần đây), hỏi khoảng thời gian,
   gọi `chessSql.queryOpeningStats(...)`, render trang báo cáo Markdown (tái dùng
   `space.writePage` + `editor.navigate` như `trends.ts`). Đăng ký lệnh trong
   `plugs/chess/chess.plug.yaml`.
6. Chạy `npm run check`, `npm test`, build thử `npm run build:client` và kiểm tra chênh lệch
   kích thước bundle do thêm SQLite WASM (~1-2MB).

### Xác minh

- `npm run check` không lỗi type.
- Mở app (web dev hoặc `cargo run`), tạo/sửa một trang có khối ` ```pgn``` `, xác nhận
  `chess_games` có dữ liệu tương ứng (log tạm hoặc DevTools).
- Chạy lệnh "Chess: Thống kê khai cuộc" trên không gian có sẵn nhiều ván (`docs/` hoặc space
  test), kiểm tra số liệu GROUP BY theo ECO khớp với đếm tay trên vài ván mẫu.
- Đo kích thước bundle trước/sau (`npm run build:client`) để biết chi phí thực tế của SQLite
  WASM.
