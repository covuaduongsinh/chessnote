---
suggestedName: "Players/New Opponent"
description: "Mẫu hồ sơ trinh sát & chuẩn bị đối đầu kỳ thủ"
confirmName: true
tags: meta/template/page
frontmatter: |
  tags: "player"
  fullName: "Nguyen Van A"
  fideId: "12345678"
  fideRating: 1850
  title: "CM"
  club: "Hà Nội Chess Club"
  playStyle: "Tấn công mạo hiểm / Thích đổi quân sớm"
---
# 👤 Hồ Sơ Kỳ Thủ: ${page.fullName} (${page.title})

> **FIDE Rating**: **${page.fideRating}** • **FIDE ID**: ${page.fideId}  
> **CLB/Đội**: ${page.club} • **Phong cách**: ${page.playStyle}

---

## 1. Thống Kê Khai Cuộc Thường Gặp (Opening Tendencies)

| Khi Cầm Quân Trắng | Tần Suất | Nước Đáp Trả Chuẩn Bị Của Ta |
| :--- | :--- | :--- |
| 1. e4 (Ruy Lopez / Italian) | 70% | 1... c5 (Sicilian Dragon / Najdorf) |
| 1. d4 (Queen's Gambit) | 30% | 1... Nf6 2... e6 (Nimzo-Indian) |

| Khi Cầm Quân Đen | Tần Suất | Phương Án Tấn Công Của Ta |
| :--- | :--- | :--- |
| Đáp trả 1. e4 bằng 1... e5 | 60% | Chơi Italian Game biến c3-d4 |
| Đáp trả 1. e4 bằng 1... c5 | 40% | Chơi Open Sicilian |

---

## 2. Điểm Yếu & Thói Quen Cần Khai Thác (Scouting Notes)
- ⚠️ **Tàn cuộc**: Thường xử lý vội vàng trong tàn cuộc Tượng khác màu hoặc tàn cuộc Xe khi cạn giờ.
- ⚠️ **Tâm lý thi đấu**: Dễ mất bình tĩnh khi bị đưa vào các thế trận kín, đòi hỏi kiên nhẫn.
- 🎯 **Chiến lược đề xuất**: Kéo ván cờ vào trung cuộc phức tạp, né tránh các biến đổi quân đơn giản.

---

## 3. Danh Sách Các Ván Đấu Đối Đầu (Match History)

<!--#query table name, date, event, white, black, result
from index.tag "game"
where white = page.fullName or black = page.fullName
order by date desc
-->
