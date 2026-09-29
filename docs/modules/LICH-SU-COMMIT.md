# Lịch sử commit theo ngày (sinh từ git log)

> **Không sửa tay.** Sinh bằng `python scripts/gen_module_reference.py` tại commit `383bab47be`. Chỉ liệt kê commit từ **2026-09-06** (các giai đoạn ChessNote); lịch sử trước đó là của SilverBullet gốc. Tổng: **53** commit.


## 2026-09-07

- `00183eaa` feat(mobile): complete standalone offline Capacitor mobile app for ChessNote
- `183b84f0` fix(chess): Giai đoạn 0 - vá lỗi/rủi ro cấp bách sau audit ChessNote
- `8d1c6166` fix(chess): Giai đoạn 1 - bàn cờ chơi được thật + vá 2 lỗi nghiêm trọng mới
- `33f954bd` feat(chess): Giai đoạn 2 - nối engine Arasan WASM thật vào Engine Eval
- `0cb2a3c2` feat(chess): Giai đoạn 2 (tiếp) - nối pgnWidget và game_reviewer vào engine Arasan thật

## 2026-09-08

- `0bd0b9a0` feat(chess): Giai đoạn 3 - hạ tầng AI cá nhân qua subscription-bridge (ai-sidecar)
- `bcb312cb` docs(chess): thêm tài liệu bàn giao phiên Giai đoạn 0-2
- `bbb5178a` feat(sync): Giai đoạn 4 - Dropbox Sync thật (OAuth2 PKCE, xử lý xung đột, wiring UI)
- `64b8bb85` feat(desktop): implement ChessNote desktop app with Tauri v2 and offline-first storage
- `375d86dc` feat(chess): ứng dụng AI - "AI Coach giải thích nước đi" + "AI Bình luận ván"

## 2026-09-09

- `1bdea4d0` feat(chess): Giai đoạn A+B - AI phạm vi rộng nhiều ghi chú (Chess Game Indexer + Phân tích xu hướng)
- `8afb8b5b` feat(chess): Giai đoạn C - AI gợi ý tag & tóm tắt cho từng ván
- `41f822b3` feat(chess): Giai đoạn D - gợi ý ván liên quan (rule-based, không AI)
- `bf9d8b14` feat(chess): Giai đoạn E - AI hỏi-đáp trên các ván cờ (hoàn tất kế hoạch AI phạm vi rộng)
- `c49bd670` docs(chess): tổng kết Giai đoạn A-E - AI phạm vi rộng nhiều ghi chú
- `419aacaa` feat(chess): xuất PDF ván cờ - bàn cờ tĩnh, cấu hình cột/kích thước, chọn nước đi hiển thị
- `e61ccc4c` feat(chess): ẩn tính năng cần server trên bản mobile, bump version desktop/android

## 2026-09-10

- `4000e900` feat(sync): đồng bộ đa nền tảng qua Dropbox/WebDAV + ChessNote Cloud tự host (Phase 0, A, B)
- `472c59f2` feat(deploy): add multi-stage Dockerfile and dokploy compose config
- `80582037` fix(docker): copy version.json from frontend-builder stage
- `7cd6b23e` fix(docker): optimize healthcheck to use explicit loopback IPv4 127.0.0.1:3000
- `52a0b8a6` fix(pdf): enforce 1:1 aspect ratio and strict page break avoidance for chessboards
- `35e11172` fix(docker): isolate Chrome data dir to /tmp and clean stale singleton locks on boot

## 2026-09-11

- `94b1d684` feat(ui): add document tab bar and tab navigation shortcuts (Phase 1)
- `1534a8e1` feat(deploy): them bo file cau hinh Docker VPS va Dokploy cho chessnote.dsc.edu.vn
- `f30be5a7` fix(deploy): sua cu phap Traefik v3 backticks Host(\domain\) va router priority cho sync endpoint
- `9adc6045` feat(chess): add authentic piece sets, board themes and global default settings
- `d1dfaeb2` feat(desktop,android): bump versions and wire Android release signing

## 2026-09-12

- `c24fcdd8` feat(chess): add SQLite WASM DBMS layer with FTS5, repertoire SRS, and semantic search
- `0ea5f34b` chore(desktop): bump version to 1.3.0
- `11d3bc10` chore(android): bump version to 1.3
- `fa1d1be2` refactor(chess): split the monolithic chess plug into 6 independent plugs
- `620761a9` docs: record ADR-005 for the chess plug split + GitHub mirror repos
- `738b2ade` refactor(chess): make all 7 chess plugs installable on vanilla SilverBullet
- `044bac56` docs: record ADR-006 for the full-portability chess plug refactor
- `49a784a3` fix(chess): render kingless FEN diagrams instead of an error banner
- `76303fe0` fix(sync): exclude read-only baked-in Library/Std paths from Dropbox/WebDAV sync
- `37f769c2` fix(deploy): use wget instead of curl for chessnote-sync healthcheck
- `32400b3e` test(sync): confirm performSync converges after resolving a real conflict
- `fc156485` feat(sync): add a read-only Dropbox sync diagnostic command

## 2026-09-13

- `350e7dc4` feat(sync): surface Dropbox 429 rate-limit backoff instead of silence
- `39f86fef` fix(sync): checkpoint sync state incrementally, add fetch timeouts
- `20fb23cf` feat(chess): add a free-form board editor mode to the FEN widget
- `194f5b23` fix(sync): exclude Library/Repositories by path prefix, not just perm
- `b013f65e` fix(sync): batch state checkpoints and reuse Dropbox delta cursor
- `98c85d37` fix(sync): debounce realtime push signal, coalesce broadcasts
- `b8472c11` feat(ai-sidecar): limit concurrent claude CLI processes
- `f980257f` perf(chess): cache compiled WASM module for Arasan engine
- `36c0144b` fix(nav): cap tree view children per folder to avoid unbounded DOM growth
- `5e3ebede` fix(nav): keep syncing widget iframe height for its whole lifetime
- `0d884883` fix(chess): fix board-editor TDZ crash, add castling/en-passant editing
- `e958c1d7` feat(chess): add "Lưu vào trang" to save board-editor changes back into page
- `383bab47` feat(chess): add drag-and-drop piece editing to the board editor
