---
suggestedName: "Games/New Game Analysis"
description: "Mẫu phân tích ván đấu cờ vua chuyên sâu"
confirmName: true
tags: meta/template/page
frontmatter: |
  tags: "game"
  date: "${date.today()}"
  event: "Giải đấu / Luyện tập"
  round: 1
  white: "Kỳ thủ Trắng"
  black: "Kỳ thủ Đen"
  whiteElo: 1500
  blackElo: 1500
  result: "1-0"
  eco: "B90"
  opening: "Sicilian Defense: Najdorf"
---
# ♟️ ${page.name}

> **Giải đấu**: ${page.event} • **Vòng**: ${page.round} • **Ngày**: ${page.date}  
> **Trắng**: **${page.white}** (${page.whiteElo}) vs **Đen**: **${page.black}** (${page.blackElo})  
> **Kết quả**: **${page.result}** • **Khai cuộc**: ${page.opening} (${page.eco})

---

## 1. Biên Bản Ván Đấu & Cây Nước Đi (PGN)

```pgn
[Event "${page.event}"]
[Site "ChessNote"]
[Date "${page.date}"]
[Round "${page.round}"]
[White "${page.white}"]
[Black "${page.black}"]
[Result "${page.result}"]
[ECO "${page.eco}"]

1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 {Najdorf Variation} 6. Be3 e5 7. Nb3 Be6 8. Qd2 Nbd7 9. O-O-O Be7 *
```

---

## 2. Các Nước Đi Then Chốt & Bước Ngoặt (Key Turning Points)

### ⚪ Thế cờ then chốt 1 (Nước 15)
```fen
r1bq1rk1/1p2bppp/p1np4/4p3/4P3/1NN1B3/PPPQ1PPP/2KR1B1R w - - 0 10
| title: Giai đoạn triển khai quân trung cuộc
| arrows: d2-a5:green, c3-d5:red
| highlights: d5:red, d6:yellow
```
- **Kế hoạch của Trắng**: Kiểm soát ô yếu d5 và chuẩn bị đòn đẩy tốt f3 - g4 bão tốt cánh vua.
- **Kế hoạch của Đen**: Phản công cánh hậu qua cột c và nước d5 giải phóng trung tâm.

---

## 3. Đánh Giá & Bài Học Rút Ra (Post-Game Reflections)

- [ ] **Khai cuộc**: Nhớ chính xác thứ tự nước đi lý thuyết hay bị động cơ bắt bài?
- [ ] **Trung cuộc**: Tính toán đòn chiến thuật có bị sót nước đáp trả của đối thủ?
- [ ] **Quản lý thời gian**: Có bị rơi vào thế cờ vội vàng dẫn đến Blunder không?
- 💡 **Bài học kinh nghiệm**: 
