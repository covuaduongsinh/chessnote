# ♟️ Hướng Dẫn & Ví Dụ Về Khối Cờ Vua ChessNote

Chào mừng bạn đến với **ChessNote**! Dưới đây là các ví dụ minh họa về các khối cờ vua tương tác có sẵn trong hệ thống:

---

## 1. Khối Thế Trận FEN Tương Tác (` ```fen `)
Dùng để hiển thị thế cờ từ chuỗi FEN. Bạn có thể bấm **Flip Board** để lật bàn cờ, **Copy FEN**, hoặc mở trực tiếp trên **Lichess Analysis**.

```fen
r1bqkb1r/pppp1ppp/2n5/4p3/2B1n3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4
| title: Italian Game: Traxler Counterattack
| orientation: white
| arrows: c4-f7:red, f3-e5:green
| highlights: f7:red, e5:green
```

---

## 2. Khối Ván Đấu PGN Tương Tác (` ```pgn `)
Dùng để phân tích biên bản ván đấu hoàn chỉnh. Bấm vào bất kỳ nước đi nào trong danh sách hoặc dùng phím mũi tên `Trái` / `Phải` trên bàn phím để tua nước đi.

```pgn
[Event "FIDE World Championship 2024"]
[Site "Singapore"]
[Date "2024.12.12"]
[White "Ding, Liren"]
[Black "Gukesh, D"]
[Result "0-1"]
[ECO "E20"]

1. d4 Nf6 2. c4 e6 3. Nc3 Bb4 4. Qc2 O-O 5. a3 Bxc3+ 6. Qxc3 d5 7. Nf3 dxc4 8. Qxc4 b6 9. Bg5 Ba6 10. Qa4 Bb7 0-1
```

---

## 3. Khối Bài Tập Thế Cờ (` ```puzzle `)
Dùng để tự luyện tập hoặc soạn bài tập chiến thuật cho học viên. Người giải có thể xem gợi ý và xem đáp án khi cần.

```puzzle
fen: 5rk1/5ppp/8/8/8/3B1N2/8/3QKR2 w - - 0 1
turn: white
solution: Bxh7+ Kxh7 Ng5+ Kg8 Qh5
hint: Đòn thí Tượng kinh điển phá thành (Greek Gift Sacrifice)
themes: Sacrifice, Kingside Attack
rating: 1650
```

> **Lưu ý (2026-09-07)**: FEN gốc trước đây (vua đen còn ở e8, chưa nhập thành) không khớp
> với chuỗi đáp án — `Kxh7` không hợp lệ về luật cờ trên vị trí đó. Đã thay bằng vị trí có
> vua đen đã nhập thành cánh vua, kiểm chứng toàn bộ 5 nước hợp lệ bằng chess.js trước khi
> đưa vào. Xem `docs/plans/2026-09-07-danh-gia-va-ke-hoach-hoan-thien-chessnote.md`.
