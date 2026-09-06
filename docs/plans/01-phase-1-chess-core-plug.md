# ♟️ KẾ HOẠCH CHI TIẾT - GIAI ĐOẠN 1: CORE CHESS PLUG
> **Mục tiêu**: Xây dựng Plug Cờ vua Cốt lõi (`plugs/chess/`) hiển thị bàn cờ FEN, PGN Move Tree và Puzzle tương tác trực tiếp trong ghi chú Markdown.  
> **Giấy phép**: 100% MIT / BSD-2-Clause.

---

## 1. MỤC TIÊU VÀ ĐẦU RA (DELIVERABLES)
1. **Khối Bàn cờ FEN (` ```fen ... ``` `)**:
   - Hiển thị thế cờ từ chuỗi FEN.
   - Bàn cờ SVG sắc nét (`cm-chessboard`), kéo thả quân mượt mà.
   - Nút công cụ: `Flip Board` (Lật bàn cờ), `Reset Position`, `Copy FEN`, `Copy Link Lichess`.
   - Hỗ trợ vẽ mũi tên và tô ô cờ (Arrows & Highlights) phục vụ ghi chú giảng dạy.
2. **Khối Ván đấu PGN (` ```pgn ... ``` `)**:
   - Parse toàn bộ PGN (Header, Moves, Sublines/Variations, Comments, NAGs).
   - Bàn cờ tương tác đồng bộ với danh sách nước đi: Bấm vào nước nào, bàn cờ nhảy tới nước đó.
   - Điều khiển bàn phím: Mũi tên Trái/Phải (tiến/lùi), Lên/Xuống (chuyển biến), `F` (Lật bàn cờ).
3. **Khối Bài tập Thế cờ (` ```puzzle ... ``` `)**:
   - Đọc cấu hình FEN, phe đi trước (turn), chuỗi nước đi giải (solution), gợi ý (hint).
   - Tự động ẩn lời giải; kiểm tra tương tác kéo thả của người học (Đúng -> Đi tiếp; Sai -> Thông báo thử lại).
   - Nút `Xem Lời Giải` và `Hiện Gợi Ý`.

---

## 2. KIẾN TRÚC MÃ NGUỒN & MODULES (`plugs/chess/`)

```
plugs/chess/
  ├── chess.plug.yaml               # Khai báo plug, đăng ký CodeWidgets: fen, pgn, puzzle
  ├── package.json                  # Dependencies: cm-chessboard (MIT), chess.js (BSD)
  ├── tsconfig.json                 # TypeScript configuration
  ├── src/
  │   ├── index.ts                  # Entry point đăng ký widget handlers
  │   ├── widgets/
  │   │   ├── fen_widget.ts         # Logic render khối FEN
  │   │   ├── pgn_widget.ts         # Logic render khối PGN & Move Tree
  │   │   └── puzzle_widget.ts      # Logic render khối Puzzle bài tập
  │   ├── components/
  │   │   ├── board_view.ts         # Wrapper quản lý khởi tạo cm-chessboard
  │   │   ├── move_tree_view.ts     # Component hiển thị danh sách nước đi & biến thể
  │   │   └── control_bar.ts        # Thanh nút bấm điều khiển (Prev, Next, Flip,...)
  │   ├── utils/
  │   │   ├── pgn_parser.ts         # Parser PGN sang cây dữ liệu MoveNode
  │   │   ├── fen_validator.ts      # Kiểm tra tính hợp lệ của chuỗi FEN
  │   │   └── arrow_drawer.ts       # Vẽ mũi tên và ô sáng màu trên bàn cờ
  │   └── styles/
  │       ├── chess_board.css       # Style bàn cờ (Wood, Dark, Modern, Classic)
  │       └── pgn_tree.css          # Style danh sách nước đi, biến thế, bình luận
```

---

## 3. ĐẶC TẢ KỸ THUẬT & CÚ PHÁP MARKDOWN

### A. Khối FEN
````markdown
```fen
r1bqkb1r/pppp1ppp/2n5/4p3/2B1n3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4
| orientation: white
| arrows: c4-f7:red, f3-e5:green
| highlights: f7:red, e5:green
```
````

### B. Khối PGN
````markdown
```pgn
[Event "FIDE World Championship 2024"]
[Site "Singapore"]
[Date "2024.12.12"]
[White "Ding, Liren"]
[Black "Gukesh, D"]
[Result "0-1"]

1. d4 Nf6 2. c4 e6 3. Nc3 Bb4 {Nimzo-Indian Defense} 4. Qc2 O-O (4... d5 5. a3 Bxc3+) 5. a3 Bxc3+ 6. Qxc3 d5 0-1
```
````

### C. Khối Puzzle
````markdown
```puzzle
fen: r1bqk2r/pp2bppp/2n1p3/2ppP3/3P4/2PB1N2/P1P2PPP/R1BQK2R w KQkq - 0 8
turn: white
solution: Bxh7+ Kxh7 Ng5+ Kg8 Qh5
hint: Đòn thí Tượng kinh điển phá thành (Greek Gift Sacrifice)
themes: Sacrifice, Attacking King
```
````

---

## 4. KẾ HOẠCH KIỂM THỬ & XÁC MINH (VERIFICATION)

1. **Unit Test**:
   - Parse FEN hợp lệ / không hợp lệ.
   - Parse PGN đầy đủ biến nhánh lồng nhau và ký hiệu NAG (`$1`, `$2`, `$4`).
   - Kiểm tra logic bài tập Puzzle (thế cờ kết thúc, nước đi sai).
2. **Integration Test trong Editor**:
   - Chèn các khối `fen`, `pgn`, `puzzle` vào trang Markdown trong chế độ Live Preview.
   - Kiểm tra không xảy ra layout shift, cuộn trang mượt mà, phím tắt không xung đột với phím gõ văn bản của CodeMirror.
