---
name: Library/Chess
tags: meta/library
description: "ChessNote - Hệ thống Quản lý Tri thức & Nghiên cứu Cờ Vua Chuyên sâu"
files:
- Demo.md
- arasan.wasm
- arasanv8-20260906.nnue
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

- **Bàn cờ FEN (` ```fen `)**: click-to-move thật (chess.js), vẽ mũi tên, tô màu ô. Nút
  "⚡ Engine Eval" gọi engine **Arasan thật** (NNUE, biên dịch WebAssembly) — file
  `arasan.wasm`/`arasanv8-20260906.nnue` (~26MB) được nạp sẵn trong chính binary ChessNote
  (xem `plugs/chess/engine/arasan_engine.ts`), không cần cài thêm gì.
- **Ván đấu PGN (` ```pgn `)**: đồng bộ cây nước đi, phím tắt `Trái/Phải/F`, thanh điểm số
  **Eval Bar** và **Game Review** tự chấm độ chính xác — ⚠️ hiện vẫn dùng heuristic (chưa nối
  engine Arasan thật cho luồng phân tích hàng loạt nước đi này).
- **Bài tập thế cờ chiến thuật (` ```puzzle `)**: hiện thế cờ, gợi ý Hint, tự chấm đúng/sai
  bằng chess.js khi người dùng thử nước đi.

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
