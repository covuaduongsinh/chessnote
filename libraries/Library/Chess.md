---
name: Library/Chess
tags: meta/library
description: "ChessNote - Hệ thống Quản lý Tri thức & Nghiên cứu Cờ Vua Chuyên sâu"
files:
- Chess.plug.js
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
- **Bàn cờ FEN tương tác (` ```fen `)**: Lật bàn cờ, thử nghiệm nước đi, vẽ mũi tên, tô màu ô, phân tích thế cờ Arasan.
- **Ván đấu PGN tương tác (` ```pgn `)**: Đồng bộ cây nước đi, phím tắt `Trái/Phải/F`, thanh điểm số **Eval Bar** và tính năng **Game Review** tự động chấm điểm độ chính xác.
- **Bài tập thế cờ chiến thuật (` ```puzzle `)**: Tự luyện tập, ẩn lời giải, gợi ý Hint và hiện đáp án.

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
