# Hướng dẫn Demo & Kiểm tra: DBMS SQLite WASM (Phase 1 → 5)

> Đi kèm `docs/plans/2026-09-11-dbms-sqlite-wasm-tich-hop.md`. Tài liệu này liệt kê từng
> tính năng theo phase, cách bật lên xem trực tiếp trong app, và cách kiểm tra dữ liệu SQL
> phía sau mà bình thường không có UI nào hiển thị.

---

## 0. Chuẩn bị môi trường (làm 1 lần)

### 0.1. Build

```powershell
npm run build          # build:plugs + build:client, đã chạy sẵn trong phiên vừa rồi
```

### 0.2. Chạy server

```powershell
cargo run my_space
```

Terminal sẽ in ra dòng dạng `Listening on http://127.0.0.1:<port>` — mở đúng địa chỉ đó
bằng trình duyệt (Chrome/Edge — cần DevTools ở bước kiểm tra nâng cao).

> Trên Windows, nếu định dùng tính năng PDF export (không liên quan tài liệu này) thì mới
> cần biến môi trường `SB_CHROME_DATA_DIR` — bỏ qua nếu chỉ test DBMS.

### 0.3. (Tuỳ chọn) Bật AI sidecar — chỉ cần cho phần có chữ "AI" thật

Một số bước demo dưới đây gọi AI thật (Claude qua CLI) — **không bắt buộc** để kiểm tra phần
lõi SQL của từng phase (đã ghi rõ "cần AI" / "không cần AI" ở mỗi mục). Nếu muốn thử phần AI:

```powershell
cd ai-sidecar
npm start   # cổng mặc định 3457
```

Rồi trong app chạy lệnh **"Chess: Đăng nhập AI"** một lần.

### 0.4. Dữ liệu demo đã có sẵn

Đã tạo sẵn 5 trang demo trong `my_space/Chess/DBMS Demo/` (xoá cả thư mục này sau khi test
xong nếu không muốn giữ):

| Trang | Mục đích |
|---|---|
| `Van 1 - Sicilian Najdorf.md` | Ván chính — có `WhiteElo/BlackElo/TimeControl/Opening/Variation`, comment PGN, và `chessSummary`/`tags` điền tay trong frontmatter |
| `Van 2 - Cung ECO voi Van 1.md` | Cùng mã ECO `B90` với Ván 1, khác người chơi — test "Ván liên quan" theo ECO |
| `Van 3 - Cung nguoi choi voi Van 1.md` | Cùng người chơi "Nguyễn Văn A", khác ECO — test "Ván liên quan" theo người chơi |
| `Van 4 - Tim theo comment PGN.md` | Từ khoá **"hy sinh hậu"** chỉ có trong comment PGN — test FTS5 thật sự tìm trong comment |
| `Repertoire Demo - Italian Game.md` | Trang `tags: repertoire`, 2 biến — test Phase 4 |

Mở app, vào không gian ghi chú, xác nhận thấy đủ 5 trang trên trong sidebar (hoặc tìm kiếm
`DBMS Demo`) — chờ vài giây để lần index đầu tiên chạy xong trước khi bắt đầu test.

---

## 1. Thống kê tính năng theo từng phase

| Phase | Tính năng | Lệnh / nơi bật | Cần AI sidecar? |
|---|---|---|---|
| **1** | Bảng `chess_games` trong SQLite, đồng bộ mỗi lần lưu trang | (nền, tự động) | Không |
| **1** | Thống kê khai cuộc theo người chơi (SQL `GROUP BY`) | Lệnh **"Chess: Thống kê khai cuộc"** | Không |
| **2** | Chỉ mục toàn văn FTS5 (metadata + tag + tóm tắt AI + comment PGN) | (nền, tự động) | Không |
| **2** | Hỏi AI trên ván cờ, tìm bằng FTS5 | Lệnh **"Chess: Hỏi AI"** | Có (để AI trả lời câu hỏi) — **phần tìm nguồn thì không** |
| **3** | Cột `white_elo/black_elo/time_control/opening/variation` trong `chess_games` | (nền, tự động) | Không |
| **3** | "Ván liên quan" (cùng ECO / cùng người chơi) tính bằng SQL | Tự hiện trong widget PGN, mục "🔗 Ván liên quan" | Không |
| **4** | Bảng `repertoire_lines` — mỗi biến khai cuộc 1 dòng | (nền, tự động, chỉ với trang `tags: repertoire`) | Không |
| **4** | Lịch ôn tập SRS (thuật toán SM-2) | Lệnh **"Chess: Ôn tập khai cuộc"** | Không |
| **5b** | Bảng `ai_annotations`/`ai_annotation_tags` — đồng bộ từ frontmatter mỗi lần lưu | (nền, tự động) | Không (đồng bộ) / Có (để AI tự sinh) |
| **5b** | Gán tag + tóm tắt bằng AI thật (ghi cả frontmatter lẫn SQL kèm model đã dùng) | Nút **"🏷️ AI Gợi ý tag"** trong widget PGN | Có |
| **5** | Bảng `game_embeddings` — vector ngữ nghĩa từng ván | Lệnh **"Chess: Tính embedding ngữ nghĩa"** | Không (dùng model tải riêng, không qua ai-sidecar) — **cần Internet lần đầu** |
| **5** | "Hỏi AI" ưu tiên tìm ngữ nghĩa nếu đã có embedding | Tự động trong **"Chess: Hỏi AI"** | Có (để AI trả lời) |
| *(mới thêm)* | Xem toàn bộ dữ liệu 4 bảng SQL trên 1 trang | Lệnh **"Chess: Kiểm tra dữ liệu SQLite (debug)"** | Không |

---

## 2. Công cụ kiểm tra dùng chung cho mọi phase

### 2.1. Lệnh debug dump (khuyến nghị — dễ nhất)

Mở Command Palette (`Ctrl+/` hoặc `Ctrl+Shift+P` tuỳ cấu hình phím) → gõ **"Chess: Kiểm tra
dữ liệu SQLite (debug)"** → Enter. App sẽ tạo và mở 1 trang mới (`Chess/Debug SQL/<thời
gian>`) liệt kê **toàn bộ 4 bảng** (`chess_games`, `ai_annotations`, `repertoire_lines`,
`game_embeddings`) dưới dạng bảng markdown, kèm dòng "FTS5 khả dụng: ✅/❌" ở đầu.

Chạy lại lệnh này sau MỖI bước demo bên dưới để xem dữ liệu vừa thay đổi thế nào — đây là
cách xác nhận chắc chắn nhất rằng dữ liệu thật sự có trong SQLite, không chỉ hiện trên UI.

### 2.2. DevTools console (nâng cao, khi cần đào sâu hơn)

Mở DevTools (F12) → tab Console. Toàn bộ instance client được để ở `window.client`, có thể
gọi thẳng bất kỳ hàm nào đã viết:

```js
// Toàn bộ ván đã index
await client.clientSystem.chessSqlStore.debugDump()

// Tìm FTS5 thủ công
await client.clientSystem.chessSqlStore.searchGames({ keywords: ["hy", "sinh", "hau"], limit: 5 })

// Thống kê khai cuộc thủ công
await client.clientSystem.chessSqlStore.queryOpeningStats({ playerName: "Nguyễn Văn A" })

// Ván liên quan thủ công
await client.clientSystem.chessSqlStore.queryRelatedGames({ page: "Chess/DBMS Demo/Van 1 - Sicilian Najdorf", white: "Nguyễn Văn A", black: "Trần Thị B", eco: "B90", limit: 5 })

// Danh sách biến khai cuộc đến hạn ôn tập
await client.clientSystem.chessSqlStore.getDueRepertoireLines(10)

// Đã có embedding nào chưa
await client.clientSystem.chessSqlStore.hasAnyEmbeddings()
```

Mọi lỗi JS trong lúc index cũng in ra console với tiền tố `[chess-sql]`/`[chess semantic_index]`
— nếu nghi ngờ 1 trang không được index đúng, mở console trước khi lưu trang lại.

---

## 3. Phase 1 — Thống kê khai cuộc

**Demo:**
1. Mở lệnh **"Chess: Thống kê khai cuộc"**.
2. Nhập tên người chơi: `Nguyễn Văn A` (đúng tên trong Ván 1 và Ván 3).
3. Để trống ô "chỉ tính từ ngày" → Enter.
4. App tạo trang `Chess/Thống kê khai cuộc/<thời gian>` với bảng: ECO `B90` (1 ván, thắng)
   và `C50` (1 ván, hoà) — đúng 2 ván có "Nguyễn Văn A" cầm quân (Ván 1 + Ván 3).

**Kiểm tra:** chạy debug dump, xem bảng `chess_games` — 6 dòng (4 ván lẻ + 2 dòng repertoire
KHÔNG xuất hiện ở đây vì repertoire bị loại — xem Phase 4), cột `white`/`black`/`result`/`eco`
khớp đúng nội dung PGN đã gõ.

---

## 4. Phase 2 — FTS5 tìm kiếm toàn văn

**Demo (không cần AI — kiểm tra riêng phần tìm nguồn):**
1. Mở lệnh **"Chess: Hỏi AI"**.
2. Gõ câu hỏi: `Ván nào có hy sinh hậu?`
3. Enter. App tạo trang `Chess/Hỏi AI/<thời gian>`.
4. Xem mục **"Nguồn đã dùng"** ở cuối trang — phải thấy `[[Chess/DBMS Demo/Van 4 - Tim theo
   comment PGN]]` được liệt kê **dù cụm "hy sinh hậu" không nằm ở tên người chơi/ECO/sự
   kiện** — chứng minh tìm được trong comment PGN thật, không chỉ khớp metadata.
5. Nếu chưa đăng nhập AI, mục "Trả lời" sẽ báo lỗi kiểu "AI chưa trả lời được" — **không
   sao**, mục "Nguồn đã dùng" vẫn đúng vì phần tìm kiếm (FTS5) chạy độc lập với phần gọi AI.

**Thử thêm:** hỏi `Ván nào Trắng thắng bằng khai cuộc Najdorf?` — phải tìm ra Ván 1 (nhờ
`chessSummary` đã điền tay được đưa vào chỉ mục FTS5 luôn, không chỉ PGN).

**Kiểm tra:** debug dump → cột đầu `FTS5 khả dụng: ✅ có`. Nếu hiện `❌ không`, bản dựng
`@sqlite.org/sqlite-wasm` đang dùng không có FTS5 — xem console lúc mở app có log
`[chess-sql] Bản dựng SQLite WASM này không có FTS5` hay không.

---

## 5. Phase 3 — Elo/TimeControl/Opening + Ván liên quan

**Demo — cột dữ liệu mới (không có UI riêng, xem qua debug dump):**
1. Chạy debug dump → bảng `chess_games`, tìm dòng `page = Chess/DBMS Demo/Van 1 ...`.
2. Xác nhận: `white_elo = 1850`, `black_elo = 1790`, `time_control = 180+2`,
   `opening = Sicilian Defense`, `variation = Najdorf Variation` — đúng y hệt header PGN đã gõ.

**Demo — Ván liên quan (có UI trực tiếp):**
1. Mở trang `Van 1 - Sicilian Najdorf.md`.
2. Cuộn widget bàn cờ xuống dưới cây nước đi — mục **"🔗 Ván liên quan"** phải hiện:
   - `Lê Văn C vs Phạm Thị D (0-1)` — lý do `cùng mã khai cuộc ECO B90` (Ván 2).
   - `Nguyễn Văn A vs Hoàng Văn E (1/2-1/2)` — lý do `cùng người chơi: Nguyễn Văn A` (Ván 3).
3. Bấm vào 1 dòng để xác nhận điều hướng đúng sang trang ván đó.

**Lưu ý:** mục "Ván liên quan" chỉ hiện khi có ít nhất 1 ván liên quan — nếu mở 1 trang không
liên quan tới ván nào khác (vd `Van 4`), mục này sẽ không xuất hiện, không phải lỗi.

---

## 6. Phase 5b — Lưu trữ có cấu trúc cho output AI

**Demo A — đồng bộ từ frontmatter, KHÔNG cần AI (đã có sẵn từ lúc mở app):**
1. Chạy debug dump → bảng `ai_annotations`, tìm dòng `page = Chess/DBMS Demo/Van 1 ...`.
2. Xác nhận `summary` = đúng câu đã gõ tay trong `chessSummary`, `tags` = `sicilian,
   najdorf`, còn `confidence`/`model_version`/`generated_at` đều **rỗng** (vì chưa có AI thật
   nào sinh ra dữ liệu này, chỉ mới đồng bộ từ frontmatter).
3. Mở lại `Van 1 - Sicilian Najdorf.md`, sửa `chessSummary` thành 1 câu khác, lưu trang.
4. Debug dump lại — `summary` trong SQL đã đổi theo, nhưng vẫn không có confidence/model
   (đúng thiết kế: đồng bộ frontmatter không được phép tự bịa ra confidence/model).

**Demo B — ghi đầy đủ kèm model, CẦN AI sidecar đã đăng nhập:**
1. Mở `Van 4 - Tim theo comment PGN.md` (trang chưa có `chessSummary`).
2. Trong widget PGN, bấm **"🏷️ AI Gợi ý tag"** → chờ AI trả lời → bấm **"✅ Áp dụng vào ghi
   chú"**.
3. Debug dump lại → dòng `ai_annotations` của Ván 4 giờ có `confidence` (hiện tại luôn rỗng —
   xem ghi chú trong `tagging.ts` vì chưa có tín hiệu để tính, đây KHÔNG phải lỗi) và
   `model_version` = đúng tên model đang cấu hình ở "chess.ai.model" (mặc định
   `claude-haiku-4-5`), `generated_at` = thời điểm vừa bấm áp dụng.
4. Mở lại frontmatter của Ván 4 — `tags`/`chessSummary` cũng đã được ghi, song song với SQL.

---

## 7. Phase 4 — Sổ tay Khai cuộc (Repertoire) + SRS

**Demo — xác nhận KHÔNG lẫn vào ván cờ thường:**
1. Debug dump → bảng `chess_games` KHÔNG được có dòng nào `page` chứa "Repertoire Demo".
2. Cùng debug dump → bảng `repertoire_lines` phải có **2 dòng**, cả hai `page = Chess/DBMS
   Demo/Repertoire Demo - Italian Game`, `opening_name = Italian Game (Giuoco Piano)`,
   `variation_name` lần lượt là `Main Line` và `Qe7 Defense`, `due_date` = rỗng (chưa ôn lần
   nào), `ease_factor = 2.5`.

**Demo — ôn tập (chạy lệnh, không cần AI):**
1. Mở lệnh **"Chess: Ôn tập khai cuộc"**.
2. App hỏi xác nhận "Ôn tập biến: Italian Game (Giuoco Piano) — Main Line (còn 2 biến trong
   phiên này)?" → Yes.
3. App hỏi từng nước một, hiện FEN hiện tại — thử 2 kịch bản:
   - **Đi đúng cả 10 nước** (`e4, e5, Nf3, Nc6, Bc4, Bc5, c3, Nf6, d3, d6`) → xong biến,
     thông báo "Hoàn hảo! Xếp lịch ôn lại sau lâu hơn."
   - Ở biến thứ 2, **cố tình gõ sai 1 nước** rồi tiếp tục đến hết → thông báo "Xong biến
     này, 1 lỗi — xếp lịch ôn lại sớm hơn."
   - Hoặc **để trống 1 ô nhập** để dừng giữa chừng → "Đã dừng biến này giữa chừng — xếp
     lịch ôn lại sớm."
4. Debug dump lại → bảng `repertoire_lines`: dòng đi đúng hết có `due_date` = ngày mai,
   `review_count = 1`, `last_grade = easy`; dòng sai 1 nước có `due_date` gần hơn,
   `last_grade = good`.
5. Chạy lại lệnh "Chess: Ôn tập khai cuộc" ngay lập tức → app báo "Không có biến khai cuộc
   nào đến hạn ôn tập" (đúng, vì `due_date` vừa dời sang tương lai).

**Thử SRS nhiều vòng (cùng 1 ngày, không cần chờ):** lệnh "Chess: Ôn tập khai cuộc" chỉ lấy
biến đã tới hạn (`due_date`), nên chạy lại lệnh ngay trong ngày sẽ không thấy gì. Để xem
`interval_days` tăng dần qua nhiều vòng mà không phải chờ nhiều ngày, gọi thẳng
`recordRepertoireReview` qua DevTools console (bỏ qua điều kiện "đến hạn"):

```js
// 1. Lấy đúng `ref` của 1 biến (copy từ kết quả debugDump() hoặc getDueRepertoireLines())
const { repertoireLines } = await client.clientSystem.chessSqlStore.debugDump();
const ref = repertoireLines.find((l) => l.variationName === "Main Line").ref;

// 2. Gọi lặp lại, luôn chấm "easy" — quan sát easeFactor/intervalDays/dueDate tăng dần
await client.clientSystem.chessSqlStore.recordRepertoireReview(ref, "easy");
await client.clientSystem.chessSqlStore.recordRepertoireReview(ref, "easy");
await client.clientSystem.chessSqlStore.recordRepertoireReview(ref, "easy");
```

Kỳ vọng theo thuật toán SM-2 (`client/data/srs_sm2.ts`, đã tính tay để đối chiếu): 3 lần
chấm "easy" liên tiếp từ trạng thái mặc định (`easeFactor=2.5`) cho `intervalDays` đi
`4 → 14 → 51` (mỗi lần `easeFactor` tăng thêm `0.15`: `2.5 → 2.65 → 2.8`). Thử xen kẽ
`"again"` giữa chừng để thấy `reviewCount`/`intervalDays` reset về `0`/`1`.

---

## 8. Phase 5 — Tìm kiếm ngữ nghĩa (embedding)

> Phần rủi ro/ẩn số nhất trong cả 5 phase — cần Internet để tải model lần đầu, chưa được xác
> minh chạy thật trong trình duyệt ở phiên trước đó.

**Demo:**
1. Mở lệnh **"Chess: Tính embedding ngữ nghĩa"**.
2. App hỏi xác nhận (nêu rõ lần đầu sẽ tải model, vài chục MB) → Yes.
3. **Theo dõi kỹ:** mở DevTools → Network, lọc theo `wasm` hoặc `onnx` — phải thấy các
   request tải về (`ort-wasm-*.wasm`, file model `.onnx`) — đây là bằng chứng model
   thực sự đang tải. Nếu không thấy request nào hoặc báo lỗi mạng, xem Console để đọc
   thông báo lỗi cụ thể (rất có thể do model id `Xenova/multilingual-e5-small` đã đổi trên
   HuggingFace Hub — xem ghi chú trong `client/data/chess_embedding_store.ts`).
4. Nếu thành công: thông báo "Đã tính xong embedding ngữ nghĩa cho N ván."
5. Debug dump → bảng `game_embeddings` phải có đủ dòng cho mỗi ván thường (không tính 2
   dòng repertoire), `model_id = Xenova/multilingual-e5-small`.

**Demo — Hỏi AI ưu tiên ngữ nghĩa:**
1. Sau khi có embedding, chạy lại **"Chess: Hỏi AI"** với câu hỏi diễn đạt khác hẳn từ khoá
   gốc, ví dụ: `Có ván nào bên Trắng dồn ép đối phương chưa kịp nhập thành không?` (không
   trùng từ nào với PGN/comment — chỉ FTS5 thì sẽ KHÔNG tìm ra, nhưng embedding hiểu ngữ
   nghĩa thì có thể tìm đúng Ván 4 nhờ nội dung "hy sinh Hậu để dồn ép Vua Đen").
2. Xem mục "Nguồn đã dùng" — dòng tiêu đề phải đổi thành `(tối đa 15 ván, tìm kiếm ngữ nghĩa
   (embedding))` thay vì `FTS5`, xác nhận nhánh embedding-first đã được dùng.

**Nếu bước 2-3 thất bại (không tải được model):** đây là kết quả hợp lệ để báo lại — cho tôi
biết thông báo lỗi chính xác trong Console, tôi sẽ điều chỉnh (đổi model, thêm xử lý lỗi rõ
hơn, hoặc điều chỉnh cấu hình tải).

---

## 9. Dọn dẹp sau khi test

Xoá toàn bộ:
- Thư mục `my_space/Chess/DBMS Demo/` (5 trang demo).
- Các trang báo cáo được tạo ra trong lúc test: `Chess/Thống kê khai cuộc/…`,
  `Chess/Hỏi AI/…`, `Chess/Debug SQL/…`.

Dữ liệu SQLite tự mất khi tải lại trang (chỉ là cache trong bộ nhớ, đúng triết lý Phase 1) —
không cần dọn riêng.
