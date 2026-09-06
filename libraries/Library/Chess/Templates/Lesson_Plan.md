---
suggestedName: "Lessons/New Lesson"
description: "Mẫu giáo án bài giảng cờ vua dành cho Giáo viên & HLV"
confirmName: true
tags: meta/template/page
frontmatter: |
  tags: "lesson"
  topic: "Đòn Thí Tượng Phá Thành (Greek Gift Sacrifice)"
  level: "Trung cấp (1200 - 1600)"
  duration: "60 phút"
  coach: "Huấn Luyện Viên"
---
# 🎓 Giáo Án: ${page.topic}

> **Chủ đề**: ${page.topic}  
> **Cấp độ**: ${page.level} • **Thời lượng**: ${page.duration} • **Giáo viên**: ${page.coach}

---

## 1. Mục Tiêu Bài Học (Learning Objectives)
1. **Nhận biết dấu hiệu**: Vua đối phương đã nhập thành cánh vua, ô h7 không có quân phòng thủ ngoài Vua, tốt Trắng đã lên e5 đẩy lùi Mã f6.
2. **Nắm vững thứ tự đòn**: `1. Bxh7+ Kxh7 2. Ng5+ Kg8 (hoặc Kh6/Kg6) 3. Qh5` kết hợp Hậu và Mã tấn công dứt điểm.
3. **Thực hành thành thạo**: Giải chính xác 4 bài tập thế cờ áp dụng trong các biến thể khác nhau.

---

## 2. Lý Thuyết & Ván Cờ Minh Họa (Theory & Illustration)

```fen
r1bq1rk1/ppp2ppp/2n1pn2/3p4/2PP4/2PB1N2/P1P2PPP/R1BQK2R w KQ - 0 8
| title: Điều kiện vàng để thực hiện đòn Greek Gift
| arrows: d3-h7:red, f3-g5:green, d1-h5:green
| highlights: h7:red, e5:yellow
```

### Các bước tính toán cụ thể:
1. **Nước 1**: `Bxh7+! Kxh7` -> Ép Vua Đen rời khỏi nơi trú ẩn.
2. **Nước 2**: `Ng5+` với 3 phương án di chuyển của Vua Đen:
   - Nếu `2... Kg8`: `3. Qh5 Re8 4. Qxf7+ Kh8 5. Qh5+ Kg8 6. Qh7+ Kf8 7. Qh8+ Ke7 8. Qxg7#` (Chiếu hết).
   - Nếu `2... Kg6`: `3. h4!` đe dọa `4. h5+ Kh6 5. Nxe6+` (Bắt Hậu).
   - Nếu `2... Kh6`: `3. Nxe6+` bắt Hậu ngay lập tức nhờ đòn chiếu rút.

---

## 3. Bài Tập Thực Hành Tại Lớp (Practice Puzzles)

### Bài tập 1: Tìm nước đi thắng cuộc
```puzzle
fen: r1bq1rk1/pp2bppp/2n1p3/2ppP3/3P4/2PB1N2/P1P2PPP/R1BQK2R w KQ - 0 9
turn: white
solution: Bxh7+ Kxh7 Ng5+ Kg8 Qh5
hint: Tượng nhắm thẳng ô h7 khi tốt e5 đã kiểm soát f6
themes: Greek Gift, King Hunt
rating: 1400
```

---

## 4. Bài Tập Về Nhà (Homework)
- [ ] Xem lại ván đấu mẫu [[Games/Edgard Colle vs John O'Hanlon 1930]]
- [ ] Tự soạn 2 thế cờ tương tự từ ván đấu cá nhân
