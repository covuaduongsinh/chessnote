# ♟️ KẾ HOẠCH CHI TIẾT - GIAI ĐOẠN 3: SPACE LIBRARY & WORKFLOW TEMPLATES
> **Mục tiêu**: Xây dựng Thư viện Space (`libraries/Library/Chess/`) gồm các bộ mẫu giáo án cờ vua, sổ tay khai cuộc Repertoire, hồ sơ kỳ thủ, và các phím tắt Slash Commands.  
> **Giấy phép**: 100% MIT.

---

## 1. MỤC TIÊU VÀ ĐẦU RA (DELIVERABLES)
1. **Bộ Mẫu Ghi Chép Chuyên Nghiệp (Page Templates)**:
   - `Template: Game Analysis`: Mẫu phân tích ván đấu (Thông tin kỳ thủ, giải đấu, thời gian, biểu đồ thế trận, ghi chú tâm lý từng nước đi).
   - `Template: Opening Repertoire`: Sổ tay cây khai cuộc cho Trắng hoặc Đen, chia theo từng biến thể (ECO), kế hoạch trung cuộc và ván cờ mẫu.
   - `Template: Lesson Plan`: Mẫu soạn bài giảng dành cho Giáo viên/Huấn luyện viên (Mục tiêu bài học, lý thuyết, sơ đồ ví dụ, bài tập thực hành).
   - `Template: Tactics Study`: Bộ sưu tập bài tập theo chủ đề chiến thuật (Ghim quân, Bắt đôi, Đòn chiếu rút,...).
   - `Template: Opponent Dossier`: Hồ sơ phân tích đối thủ (Phong cách thi đấu, điểm yếu khai cuộc, thống kê kết quả).
2. **Bộ Slash Commands Gõ Nhanh (Fast Insertion)**:
   - `/fen`: Chèn nhanh khung bàn cờ thế cờ mới.
   - `/pgn`: Chèn khung phân tích ván đấu PGN.
   - `/puzzle`: Chèn bài tập thế cờ tương tác.
   - `/game-analysis`: Tạo nhanh trang phân tích ván cờ mới từ template.
   - `/repertoire-tree`: Khởi tạo cây biến thế khai cuộc.
3. **Sổ Tay Khai Cuộc & Luyện Nhớ Biến (SRS Trainer)**:
   - Thuật toán Lặp lại ngắt quãng (Spaced Repetition) lưu lịch sử ôn tập.
   - Chế độ "Luyện Khai cuộc": Bàn cờ che nước đi, yêu cầu người dùng đi đúng nước trong sổ tay.
4. **Kịch bản Space Lua Thống Kê & Truy Vấn (SLIQ Queries)**:
   - Bảng tổng hợp các ván đấu đã lưu theo kỳ thủ, ngày tháng, kết quả.
   - Thống kê tỷ lệ Thắng / Hòa / Thua theo từng hệ thống khai cuộc.

---

## 2. CẤU TRÚC THƯ MỤC THƯ VIỆN (`libraries/Library/Chess/`)

```
libraries/
  └── Library/
      └── Chess/
          ├── README.md                     # Hướng dẫn sử dụng thư viện cờ vua
          ├── Templates/
          │   ├── Game_Analysis.md          # Mẫu phân tích ván cờ chuyên sâu
          │   ├── Opening_Repertoire.md     # Mẫu sổ tay khai cuộc Trắng / Đen
          │   ├── Lesson_Plan.md            # Mẫu giáo án giảng dạy
          │   ├── Tactics_Puzzle_Set.md     # Mẫu tập hợp bài tập chiến thuật
          │   └── Opponent_Scouting.md      # Mẫu hồ sơ trinh sát đối thủ
          ├── Slash_Commands/
          │   ├── Insert_FEN.md             # Slash command /fen
          │   ├── Insert_PGN.md             # Slash command /pgn
          │   ├── Insert_Puzzle.md          # Slash command /puzzle
          │   └── New_Game.md               # Slash command /new-game
          ├── Scripts/
          │   ├── opening_stats.lua         # Script Space Lua tính toán tỷ lệ thắng thua
          │   ├── repertoire_srs.lua        # Script quản lý chu kỳ ôn tập Spaced Repetition
          │   └── pgn_importer.lua          # Script hỗ trợ bóc tách PGN vào trang mới
          └── Styles/
              └── chess_theme.css           # CSS tùy biến giao diện cờ vua sang trọng
```

---

## 3. VÍ DỤ CÂU LỆNH TRUY VẤN SPACE LUA (SLIQ QUERIES)

### Thống kê tất cả ván đấu cầm quân Trắng:
```markdown
<!--#query table name, date, event, opponent, result, eco
from index.tag "game"
where color = "White"
order by date desc
-->
```

### Thống kê hiệu suất theo khai cuộc:
```markdown
<!--#lua
local games = index.tag("game")
local stats = {}
for _, g in ipairs(games) do
  local opening = g.opening or "Unknown"
  stats[opening] = (stats[opening] or 0) + 1
end
return widget.markdown(render_opening_table(stats))
-->
```

---

## 4. KẾ HOẠCH KIỂM THỬ & XÁC MINH (VERIFICATION)

1. **Kiểm tra Slash Commands**:
   - Gõ `/` trong bất kỳ trang ghi chú nào -> Hiển thị đầy đủ menu cờ vua.
   - Chọn `/game-analysis` -> Sinh ra trang mới đúng format, các thẻ tags metadata tự động được index.
2. **Kiểm tra Luyện Khai cuộc (SRS)**:
   - Tạo sổ tay khai cuộc Sicilian Najdorf -> Chạy chế độ test -> Kiểm tra bàn cờ nhận diện đúng nước đi và tính điểm.
3. **Kiểm tra Truy vấn SLIQ**:
   - Thêm 5 ván cờ mẫu -> Kiểm tra bảng thống kê tự động cập nhật số lượng và tỷ lệ kết quả.
