---
suggestedName: "Openings/New Repertoire"
description: "Mẫu sổ tay hệ thống khai cuộc White/Black Repertoire"
confirmName: true
tags: meta/template/page
frontmatter: |
  tags: "repertoire"
  side: "White"
  openingName: "Italian Game (Giuoco Piano)"
  eco: "C50"
  targetRating: "1500-2200"
---
# 📖 Sổ Tay Khai Cuộc: ${page.openingName}

> **Phe**: **${page.side}** • **Mã ECO**: **${page.eco}** • **Trình độ mục tiêu**: ${page.targetRating}

---

## 1. Cấu Trúc Khai Cuộc & Thế Cờ Cốt Lõi (Tabiya)

```fen
r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4
| title: Thế cờ Tabiya của Italian Game
| orientation: white
| arrows: c4-f7:red, d2-d4:green, c2-c3:green
| highlights: f7:red, d4:green
```

### Ý tưởng chiến lược chính:
1. **Kiểm soát trung tâm**: Chuẩn bị đẩy tốt `c3` hỗ trợ `d4` chiếm lĩnh ô trung tâm `d4` và `e5`.
2. **Áp lực lên điểm yếu f7**: Tượng c4 nhắm thẳng vào ô f7 yếu nhất của Đen khi Vua chưa nhập thành.
3. **An toàn Vua**: Nhập thành nhanh chóng đưa Vua về cánh an toàn và kết nối xe.

---

## 2. Cây Biến Thể Chi Tiết (Variation Tree)

```pgn
[Event "Italian Game Repertoire"]
[ECO "C53"]
[White "Repertoire Master"]
[Black "Opponent"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d3 d6 6. O-O O-O 7. h3 a6 8. Bb3 Ba7 9. Re1 h6 10. Nbd2 *
```

---

## 3. Các Phương Án Đáp Trả Của Đối Thủ (Opponent Responses)

### Biến 1: Đen chơi 4... Nf6 (Main Line)
- **Kế hoạch**: 5. d3 d6 6. O-O O-O 7. a4 h6 8. Re1 -> Đưa Mã từ d2 lên f1 sang g3/e3 kiểm soát ô d5.

### Biến 2: Đen chơi 4... Qe7 (Phòng thủ vững chắc)
- **Kế hoạch**: 5. d4 Bb6 6. O-O d6 7. a4 a6 8. h3 -> Giữ ưu thế không gian ở trung tâm.

---

## 4. Ván Cờ Mẫu Của Đại Kiện Tướng (Model Games)
- [[Games/Kasparov vs Anand 1995]]
- [[Games/Carlsen vs So 2021]]
