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
fen: r1bqk2r/pp2bppp/2n1p3/2ppP3/3P4/2PB1N2/P1P2PPP/R1BQK2R w KQkq - 0 8
turn: white
solution: Bxh7+ Kxh7 Ng5+ Kg8 Qh5
hint: Đòn thí Tượng kinh điển phá thành (Greek Gift Sacrifice)
themes: Sacrifice, Kingside Attack
rating: 1650
```
