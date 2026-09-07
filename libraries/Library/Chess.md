---
name: Library/Chess
tags: meta/library
description: "ChessNote - Hệ thống Quản lý Tri thức & Nghiên cứu Cờ Vua Chuyên sâu"
files:
- Demo.md
- Templates/Game_Analysis.md
- Templates/Opening_Repertoire.md
- Templates/Lesson_Plan.md
- Templates/Tactics_Puzzle_Set.md
- Templates/Opponent_Scouting.md
- Slash_Templates/insert-fen.md
- Slash_Templates/insert-pgn.md
- Slash_Templates/insert-puzzle.md
---
# ♟️ ChessNote Library

Hệ thống thư viện cờ vua toàn diện cho SilverBullet / ChessNote.

## 1. Tính năng cốt lõi (Core Features)

> Các khối `fen`/`pgn`/`puzzle` được cung cấp bởi plug `chess` tích hợp sẵn trong build chuẩn
> (`plugs/chess/`, đăng ký qua `plugs/builtin_plugs.ts`) — không cần file `.plug.js` riêng
> trong Library này nữa (đã gỡ bản đóng băng để tránh lệch bản, xem
> `docs/plans/2026-09-07-danh-gia-va-ke-hoach-hoan-thien-chessnote.md`, mục 1.7 và Giai đoạn 0).

- **Bàn cờ FEN (` ```fen `)**: lật bàn cờ, vẽ mũi tên, tô màu ô. ⚠️ Chưa hỗ trợ click-to-move
  thật, chưa có phân tích engine thật (hiện chỉ là đánh giá heuristic).
- **Ván đấu PGN (` ```pgn `)**: đồng bộ cây nước đi, phím tắt `Trái/Phải/F`, thanh điểm số
  **Eval Bar** (heuristic) và **Game Review** tự chấm độ chính xác (heuristic, chưa dùng engine
  thật).
- **Bài tập thế cờ chiến thuật (` ```puzzle `)**: hiện thế cờ, gợi ý Hint và hiện đáp án. ⚠️ Chưa
  tự chấm đúng/sai khi người dùng thử nước đi.

## 2. Các mẫu giáo án & sổ tay (Templates)
- [[Library/Chess/Templates/Game_Analysis|Mẫu Phân Tích Ván Đấu]]
- [[Library/Chess/Templates/Opening_Repertoire|Mẫu Sổ Tay Khai Cuộc]]
- [[Library/Chess/Templates/Lesson_Plan|Mẫu Giáo Án Giảng Dạy]]
- [[Library/Chess/Templates/Tactics_Puzzle_Set|Mẫu Bài Tập Thế Cờ]]
- [[Library/Chess/Templates/Opponent_Scouting|Mẫu Hồ Sơ Đối Thủ]]

## 3. Phím tắt Slash Commands
- `/fen` : Chèn khung FEN
- `/pgn` : Chèn khung PGN
- `/puzzle` : Chèn khung Puzzle
