# AI phạm vi rộng — nhiều ghi chú (Giai đoạn A-E)

> **Ngày**: 2026-09-09
> **Trạng thái**: Cả 5 giai đoạn (A-E) đã triển khai, kiểm chứng qua trình duyệt thật, commit
> và push lên `origin/main`.
> **Commit**: `1bdea4d0` (A+B) → `8afb8b5b` (C) → `41f822b3` (D) → `bf9d8b14` (E).
> **Tiếp nối**: `05-phase-5-ai-agents-subscription.md` (hạ tầng `ai-sidecar`) và commit
> `375d86dc` ("AI Coach giải thích nước đi" + "AI Bình luận ván") — hai tính năng đó hoạt động
> **trong phạm vi 1 ghi chú**; tài liệu này ghi lại phần mở rộng AI ra **nhiều ghi chú cùng lúc**.

---

## 1. Bối cảnh & mục tiêu

Trước giai đoạn này, AI trong ChessNote chỉ "nhìn thấy" đúng 1 ván đang mở (AI Coach giải thích
nước đi / AI Bình luận ván). Người dùng muốn AI hoạt động trên **nhiều ghi chú cùng lúc**:
phân tích xu hướng nhiều ván, tự động gắn tag, gợi ý ván liên quan, và hỏi-đáp tự do trên toàn
bộ thư viện ván cờ.

**Phát hiện kiến trúc quyết định toàn bộ thiết kế**: SilverBullet có sẵn cơ chế "Object Index"
(mỗi plug emit object có `tag` khi 1 trang được index, lưu IndexedDB, truy vấn lại bằng Space
Lua/`index.queryLuaObjects`) — nhưng `plugs/chess/` trước đó **không emit object nào** cho khối
` ```pgn ` /` ```fen `, nghĩa là không có cách nào liệt kê "tất cả ván cờ trong Space". Đây là lỗ
hổng nền tảng bắt buộc phải vá trước (Giai đoạn A), vì mọi tính năng còn lại đều cần biết "ván
nào tồn tại, ở đâu".

Nguyên tắc chống hallucination của AI Coach cũ được **giữ nguyên và mở rộng** xuyên suốt: AI chỉ
được feed số liệu/metadata đã trích xuất/tính toán sẵn (engine thật, hoặc field cấu trúc), không
bao giờ tự đọc PGN thô trên diện rộng.

## 2. Tổng quan 5 giai đoạn

| GĐ | Tính năng | Cách dùng | AI? | File chính |
|---|---|---|---|---|
| A | Chess Game Indexer (nền tảng) | Ngầm, tự động khi lưu trang | Không | `plugs/chess/index.ts` |
| B | Phân tích xu hướng nhiều ván | Lệnh "Chess: Phân tích xu hướng" | Có | `plugs/chess/ai/trends.ts` |
| C | Gợi ý tag + tóm tắt cho 1 ván | Nút "🏷️ AI Gợi ý tag" trong widget | Có | `plugs/chess/ai/tagging.ts` |
| D | Gợi ý ván liên quan | Tự động hiện trong widget | Không | `plugs/chess/related_games.ts` |
| E | Hỏi-đáp trên các ván cờ | Lệnh "Chess: Hỏi AI" | Có | `plugs/chess/ai/qa.ts` |

Quy tắc xuyên suốt: **chỉ việc đắt tiền (gọi AI, chạy engine) mới cần người dùng chủ động bấm
nút/chạy lệnh** — Giai đoạn A (index thuần) và D (rule-based, không AI/engine) chạy tự động vì
rẻ; B, C, E cần hành động rõ ràng của người dùng vì tốn thời gian/quota AI.

---

## 3. Giai đoạn A — Chess Game Indexer

**Làm gì**: `plugs/chess/index.ts` đăng ký `events: [page:index]` trong `chess.plug.yaml`, độc
lập với pipeline `indexPage()` của plug `index` (an toàn: `queue.ts` gọi `index.clearFileIndex()`
1 lần trước khi dispatch `page:index`, và `index.indexObjects()` chỉ upsert chứ không xoá object
của handler khác). Mỗi khối ` ```pgn ` trên bất kỳ trang nào → 1 object tag `chess-game`
(`page, pgn, white, black, result, date, eco, event`), truy vấn qua
`index.queryLuaObjects("chess-game", {})` hoặc `${query[[from g = index.objects("chess-game")...]]}`.

**Bug phát hiện & vá trong lúc kiểm chứng**: các trang template có sẵn của sản phẩm
(`Library/Chess/Templates/*`, `Library/Chess/Slash_Templates/*`) dùng placeholder Space Lua kiểu
`${page.white}` trong header PGN — đọc trực tiếp (ngoài luồng instantiate-from-template) làm các
placeholder này bay hơi thành chuỗi lỗi Lua ("attempt to index a nil value"), lẫn vào dữ liệu ván
cờ. Đã thêm `isTemplatePage()` loại mọi trang gắn tag `meta/template*` khỏi index.

**File**: `plugs/chess/index.ts`, `plugs/chess/index.test.ts` (4 test).

---

## 4. Giai đoạn B — Phân tích xu hướng nhiều ván

**Làm gì**: Lệnh "Chess: Phân tích xu hướng" (`plugs/chess/ai/trends.ts`) gom mọi `chess-game`,
chạy `chess.reviewGame` (engine Arasan thật) cho ván chưa có cache, gộp số liệu thuần code (độ
chính xác, phân loại nước đi, lỗi theo giai đoạn ván, lỗi theo ECO), rồi feed **số liệu đã gộp**
(không PGN thô) cho AI để nhận xét xu hướng. Ghi kết quả thành trang báo cáo mới
(`Chess/Trends/<ngày giờ>`), tự mở.

**Lệch khỏi kế hoạch gốc**: dự định cache kết quả review từng ván vào **frontmatter**, nhưng
`plug-api/lib/yaml.ts` (bộ vá YAML thủ công của dự án) tự nhận trong comment là "không xử lý tốt
cấu trúc lồng nhau" — dữ liệu cache (whiteStats/turningPoints) là dữ liệu lồng nhau thật, rủi ro
làm hỏng file ghi chú không đáng. Chuyển sang cache qua **Object Index riêng** (tag
`chess-game-review`, cùng `ref` với `chess-game`) — an toàn hơn, và "được thêm miễn phí": sửa
trang nào thì cache của đúng ván đó tự bị xoá (tái dùng `clearFileIndex` có sẵn), không cần tự
viết logic phát hiện "PGN đã đổi".

**Kiểm chứng qua trình duyệt thật**: chạy lần 1 → "2 ván mới phân tích", engine cho ra đúng
98.5%/98.3% độ chính xác; chạy lại lần 2 → "0 ván mới phân tích, 2 ván lấy từ cache", chỉ vài
giây — xác nhận cache hoạt động đúng.

**File**: `plugs/chess/ai/trends.ts`, `plugs/chess/ai/trends.test.ts` (14 test).

---

## 5. Giai đoạn C — Gợi ý tag & tóm tắt cho 1 ván

**Làm gì**: Nút "🏷️ AI Gợi ý tag" trong `pgnWidget` (`plugs/chess/ai/tagging.ts`), đúng khuôn
"AI Giải thích"/"AI Bình luận ván" đã có. Gửi metadata + vài nước mở đầu (không toàn bộ PGN) cho
AI, **parse nghiêm ngặt** định dạng `TAGS: ...` / `TOMTAT: ...` (trả lỗi rõ ràng thay vì đoán mò
nếu AI không theo khuôn). Người dùng bấm "✅ Áp dụng vào ghi chú" mới thật sự gộp tag vào
frontmatter (không xoá tag cũ nào) + ghi `chessSummary`.

**Lệch khỏi kế hoạch gốc**: dự định "tự động chạy khi lưu trang" (`page:saved`), nhưng autosave
của SilverBullet debounce chỉ **1 giây** (`client/content_manager.ts: autoSaveInterval`) — nghĩa
là `page:saved` bắn liên tục lúc đang gõ, kể cả khi chỉ sửa văn bản xung quanh không đụng PGN. Tự
động gọi AI mỗi lần vậy sẽ vừa tốn quota vừa gián đoạn việc gõ phím. Chuyển thành **nút bấm chủ
động**, nhất quán với các nút AI khác.

**File**: `plugs/chess/ai/tagging.ts`, `plugs/chess/ai/tagging.test.ts` (12 test). Sửa thêm
`plugs/chess/chess.ts` (thêm nút/panel) và export vài hằng số/hàm dùng chung từ `ai/coach.ts`
(`CLASSIFICATION_VI`, `ANTI_HALLUCINATION_RULE`, `pickTurningPoints`).

---

## 6. Giai đoạn D — Gợi ý ván liên quan

**Làm gì**: Khối "🔗 Ván liên quan" **tự động hiện** trong `pgnWidget` (không nút, không AI) —
thuần rule-based trên `chess-game` Object Index: cùng mã khai cuộc (ECO, +3 điểm), cùng người
chơi (+2 điểm, bỏ qua tên placeholder "White"/"Black"/rỗng), xếp hạng theo tổng điểm, tối đa 5
ván, mỗi kết quả kèm lý do + link `target="_top"` nhảy sang ván đó (iframe widget không có
`sandbox` attribute nên top-navigation hoạt động bình thường).

**Quyết định có chủ đích**: chưa làm vector embedding/semantic search bằng AI — `ai-sidecar`
hiện chỉ hỗ trợ sinh văn bản qua Claude CLI, không có endpoint embedding. Để dành làm sau nếu
chất lượng rule-based không đủ tốt.

**Kiểm chứng qua trình duyệt thật**: 2 ván cùng ECO C50 + cùng người chơi "Alice" → gợi ý hiện
đúng cả hai chiều (đối xứng), link điều hướng đúng.

**File**: `plugs/chess/related_games.ts`, `plugs/chess/related_games.test.ts` (7 test).

---

## 7. Giai đoạn E — Hỏi-đáp trên các ván cờ

**Làm gì**: Lệnh "Chess: Hỏi AI" (`plugs/chess/ai/qa.ts`) — hỏi tự nhiên qua `editor.prompt`, lọc
ván liên quan bằng **so khớp từ khoá kiểu OR** (không phân biệt dấu, bỏ hư từ tiếng Việt) trên
metadata + tóm tắt Giai đoạn C (nếu có), build 1 prompt duy nhất kèm danh sách nguồn đã lọc (tối
đa 15 ván) → AI trả lời, **bắt buộc trích dẫn** `[[TênTrang]]` đúng danh sách đã cho, không được
bịa ván/trang khác. Ghi thành trang báo cáo mới (`Chess/Hỏi AI/<ngày giờ>`), tự mở.

**Quyết định kỹ thuật quan trọng**: KHÔNG dùng `plug-api/lib/fuzzy.ts`'s `rank()` dù có sẵn — hàm
đó khớp kiểu **AND-mọi-từ** trên field ngắn (tên trang/alias), hợp cho page picker nhưng loại
sạch mọi ứng viên ngay khi câu hỏi tự nhiên chứa 1 từ không khớp field nào ("tôi", "tại sao",
"hay"...). Viết lại so khớp OR đơn giản, phù hợp hơn cho câu hỏi tự do.

**Phạm vi có chủ đích**: các ghi chú CÓ VÁN CỜ (`chess-game` object), không phải mọi loại ghi chú
bất kỳ trong Space — mở rộng ra nội dung ghi chú bất kỳ cần một tầng index đoạn văn riêng, không
tận dụng được gì từ 4 giai đoạn trước.

**Kiểm chứng qua trình duyệt thật**: câu hỏi "Alice thắng ván nào?" → tìm đúng chính xác 2 ván có
Alice, loại đúng ván không liên quan (Ding Liren vs Gukesh), wikilink nguồn hiển thị đúng, AI thất
bại an toàn khi sidecar offline (không crash, báo lỗi rõ ràng).

**File**: `plugs/chess/ai/qa.ts`, `plugs/chess/ai/qa.test.ts` (13 test).

---

## 8. Kiểm chứng tổng thể

- `npm run check` sạch sau mỗi giai đoạn.
- `npx vitest run`: từ 177 file/2477 test (trước Giai đoạn A) lên **181 file/2523 test xanh**
  (50 test mới cho 5 giai đoạn), không có test nào bị phá.
- Mỗi giai đoạn đều kiểm chứng **qua trình duyệt thật** (server debug + `claude-in-chrome`),
  không chỉ tin build/test xanh — đúng bài học đã ghi trong
  `2026-09-07-danh-gia-va-ke-hoach-hoan-thien-chessnote.md` mục 4 ("build xanh ≠ tính năng chạy").

## 9. Hạn chế hiện tại & hướng mở rộng sau này

- **Giai đoạn B/E** giả định mỗi trang chỉ chứa 1 ván (`chess-game` đầu tiên/toàn bộ theo trang)
  — trang có nhiều khối ` ```pgn ` vẫn được Giai đoạn A index đủ, nhưng Giai đoạn C hiện chỉ gợi ý
  tag cho pgnWidget đang mở (đúng ván đang xem), không có vấn đề; Giai đoạn D/E coi mỗi trang là 1
  đơn vị khi loại trừ/gộp — trường hợp nhiều ván/trang là biên hiếm, chưa tối ưu riêng.
- **Không có khái niệm "màu nào là người dùng"** — Trắng/Đen chỉ là nhãn 2 bên trong từng ván;
  Giai đoạn B gộp số liệu chung cả 2 màu, không tách theo "ván của tôi" cụ thể.
- **Chưa có vector embedding/semantic search** (Giai đoạn D, E) — quyết định có chủ đích do
  `ai-sidecar` chưa hỗ trợ endpoint embedding; rule-based/từ-khoá là đủ tốt cho quy mô cá nhân
  hiện tại, để dành nâng cấp sau nếu cần.
- **Giai đoạn E** giới hạn cứng 15 ván ngữ cảnh mỗi câu hỏi — chưa cấu hình được qua UI (hardcode
  `MAX_CONTEXT_GAMES` trong `qa.ts`).
- Quy mô Object Index: lưu IndexedDB trình duyệt, truy vấn theo tag là full-scan rồi lọc trong bộ
  nhớ (xem `docs/Concepts/Object Index.md`) — ổn với vài trăm-vài nghìn ván (dùng cá nhân), chưa
  kiểm chứng ở quy mô lớn hơn.
