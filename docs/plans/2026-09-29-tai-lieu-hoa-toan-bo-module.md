# Kế hoạch và nhật ký: tài liệu hoá toàn bộ module ChessNote

> **Ngày**: 2026-09-29
> **Commit nguồn được mô tả**: `383bab47be` (2026-09-13) — kèm thay đổi chưa commit ở `plugs/chess-pdf-export/` và `libraries/Library/Std/Infrastructure/Export.md`.
> **Yêu cầu của chủ dự án**: tạo/cập nhật các file `.md` quan trọng (`agents.md`, `claude.md`, `readme.md`, `skills.md`, `tech.md`, `memory.md`…) để thống kê, giới thiệu, mô tả chi tiết thuật toán và lưu lịch sử của mọi module/tính năng, làm cơ sở **rà soát, xây thêm module, nhân bản phần mềm**.

## 1. Quyết định phạm vi

* Ghi tài liệu **ngay trong repo** (`docs/modules/`, `docs/NHAN-BAN.md`, các file gốc), theo yêu cầu trực tiếp — không tách sang repo tài liệu riêng.
* Mỗi tài liệu module chia hai tầng: **Phần A — Chức năng** (người không lập trình đọc được) và **Phần B — Kỹ thuật**; kết thúc bằng *Điểm cần lưu ý và hạn chế* và *Đường dẫn tham chiếu nhanh*.
* Số liệu tra cứu (lệnh, syscall, sự kiện, khoá cấu hình, bảng SQL, số dòng, số test, lịch sử commit) **sinh bằng script** `scripts/gen_module_reference.py`, không chép tay.
* Điều nghi ngờ được ghi là nghi vấn; chỉ mục nào ghi "đã tái hiện" mới được chạy thử.

## 2. Sản phẩm

| Loại | File |
|---|---|
| Mới — module | `docs/modules/01-chess-core.md` … `11-nen-tang-va-trien-khai.md` (11 tài liệu) |
| Mới — mục lục | `docs/modules/README.md` (kèm bản đồ phụ thuộc và bảng tổng hợp phát hiện) |
| Mới — tự động | `docs/modules/TRA-CUU-TU-DONG.md`, `docs/modules/LICH-SU-COMMIT.md` |
| Mới — hướng dẫn | `docs/NHAN-BAN.md` |
| Mới — công cụ | `scripts/gen_module_reference.py` |
| Viết lại | `CLAUDE.md`, `AGENTS.md`, `TECH.md`, `SKILLS.md`, `docs/CHESS_MODULES.md` |
| Cập nhật | `README.md`, `MEMORY.md` |

## 3. Kiểm chứng đã làm

* `npx vitest run plugs/chess plugs/chess-ai plugs/chess-db plugs/chess-engine plugs/chess-pdf-export plugs/chess-repertoire plugs/chess-themes plugs/sync cloud-server ai-sidecar` → lúc viết tài liệu: 40 file, 382 test xanh; sau đợt xử lý (mục 5): 41 file, 394 test xanh (trạng thái working tree).
* Tái hiện bằng `node`: `normalize`/`extractKeywords` làm mất chữ `đ`.
* Tính lại: `winChance(0/300/1000)` = 50 / 75,11 / 97,54; tổng dòng mã và test cộng lại từ bảng của script.
* Các con số đọc từ mã (ngưỡng CPL, công thức accuracy, điểm ván liên quan, SM-2, hằng số sync/E2EE) được đối chiếu trực tiếp với hàm tương ứng.

## 4. Lỗi tài liệu cũ bắt được (đã sửa)

* `docs/CHESS_MODULES.md`: ngưỡng CPL (75/150 thay vì 85/180), công thức accuracy (hàm mũ thay vì `100 − trung bình winLoss × 2,2`), điểm ván liên quan (50/20/30/10, top 3 thay vì 3+2, lấy 5), giai đoạn ván (1–15/16–40 thay vì ≤10/≤25), công thức mate, mô tả xuất PDF, mô tả `turning point`, cấu trúc thư mục trước khi tách plug.
* `SKILLS.md`: khoá manifest `code:` (đúng là `path:`), widget qua `events: widget:…` (đúng là `codeWidget:`), endpoint sidecar `/api/status` (đúng là `/healthz`, `/auth/status`), đường dẫn nguồn template.
* `AGENTS.md`, `TECH.md`, `README.md`: cấu trúc `plugs/chess/{ai,engine}/` đã lỗi thời; liên kết `file:///D:/...` tuyệt đối thay bằng đường dẫn tương đối.

## 5. Đợt xử lý phát hiện (cùng ngày, sau khi có tài liệu)

Theo yêu cầu "xử lý triệt để việc còn dở", đã sửa mã thật:

| Việc | Thay đổi | Kiểm |
|---|---|---|
| Chữ `đ` | `plugs/chess/text_normalize.ts`: `đ→d`, `Đ→D` trước `NFD` | +3 test |
| Lịch SRS mất khi tải lại | mới `plugs/chess-db/srs_persist.ts`; `applyRepertoireState` + `getRepertoireLinesForPage` (`sqlite_store.ts`); nối vào `syncRepertoireLinesForPage`/`recordRepertoireReview` (`index.ts`); file `_chess/repertoire-srs.json` | +7 test phần thuần; phần WASM chưa thử trên trình duyệt |
| Sync ghi đè lần đầu | `plugs/sync/sync_engine.ts`: nhánh không `prior` (so byte; giống → ghi state, khác → `.conflict`), tách `resolveConflict`, `bytesEqual` | +2 test; sửa kỳ vọng 1 test cũ |
| Mật khẩu mặc định | `docker-compose.*.yml` → `${VAR:?}`; `.env.vps.example` placeholder; `deploy-vps.sh` từ chối placeholder | đọc lại file |
| Sidecar cổng/host | `ai-sidecar/src/server.ts`: `AI_SIDECAR_PORT`, `AI_SIDECAR_HOST` | test hiện có xanh |
| Comment ngưỡng CPL | `plugs/chess-engine/game_reviewer.ts` | chỉ comment |
| Tham chiếu file kế hoạch không tồn tại | ghi chú trong `MEMORY.md` | — |

Kết quả kiểm: `tsc --noEmit` sạch; **41 file / 394 test xanh**; `npm run build:plugs` thành công; kiểm liên kết và số dòng bằng `wc -l` khớp.

**Cố ý không làm** (cần quyết định của chủ dự án hoặc ngoài phạm vi an toàn): module phân trang PDF (thay đổi chưa commit của bạn); bền hoá embedding; mã hoá API key; bỏ `AGENTS.md` khỏi `.gitignore`; đổi mật khẩu cũ / đặt `SYNC_USERS` trên Dokploy (thao tác hạ tầng); giấy phép quân cờ (pháp lý); `diagnoseSync` trường hợp không `prior`.

## 6. Việc còn mở (cần chủ dự án quyết)

Xem cột *Trạng thái* ở `docs/modules/README.md` và roadmap cuối `MEMORY.md`. Nổi bật: thử tay các bản sửa trên trình duyệt; đặt `SYNC_USERS` trên Dokploy và đổi mật khẩu cũ; embedding chưa bền; thay đổi chưa commit ở module PDF; `great` chưa được gán.

## 7. Chưa làm / giới hạn của đợt này

* Chưa chạy `npm run build`, E2E, benchmark, cũng như chưa chạy ứng dụng trên trình duyệt thật.
* Chưa đọc chi tiết: `Dockerfile`, `Dockerfile.runtime-api`, `Dockerfile.website`, `scripts/release.sh`, `e2e/`, `bench/`, mã Rust ngoài `proxy.rs`/`router.rs`.
* Chưa rà soát giấy phép quân cờ SVG, Arasan, NNUE.
* Tài liệu SilverBullet gốc (`docs/Architecture/`, `docs/Features/`…) không viết lại; chỉ trỏ tới.
