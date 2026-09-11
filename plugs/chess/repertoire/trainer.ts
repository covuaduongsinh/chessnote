// Lệnh "Chess: Ôn tập khai cuộc" — Phase 4 của
// docs/plans/2026-09-11-dbms-sqlite-wasm-tich-hop.md.
//
// v1 CÓ CHỦ ĐÍCH dùng editor.prompt() theo từng nước (nhập SAN qua text) thay
// vì bàn cờ đồ hoạ kéo-thả như puzzleWidget: đây là phần rủi ro/ẩn số lớn
// nhất của Phase 4 theo đúng plan đã ghi, và không có cách nào tự kiểm chứng
// UI đồ hoạ trong phiên làm việc này (không mở được trình duyệt thật). Bản
// v1 này đổi lại có logic chấm điểm/lên lịch SRS kiểm chứng được đầy đủ qua
// test (gradeFromMistakes thuần) — bàn cờ đồ hoạ là việc làm thêm tự nhiên
// sau này, không phải sửa lại toàn bộ luồng dữ liệu.
import { chessSql, editor } from "@silverbulletmd/silverbullet/syscalls";
import { Chess } from "chess.js";

const LINES_PER_SESSION = 10;

type RepertoireLineRow = Awaited<
  ReturnType<typeof chessSql.getDueRepertoireLines>
>[number];

/** 0 lỗi = dễ (khoảng ôn lại dài hơn), 1 lỗi = tốt, ≥2 lỗi hoặc bỏ cuộc giữa chừng = khó/lại từ đầu. */
export function gradeFromMistakes(
  mistakes: number,
  gaveUp: boolean,
): "again" | "hard" | "good" | "easy" {
  if (gaveUp) return "again";
  if (mistakes === 0) return "easy";
  if (mistakes === 1) return "good";
  return "hard";
}

function lineLabel(line: RepertoireLineRow): string {
  const name = line.openingName || "(chưa đặt tên khai cuộc)";
  return line.variationName ? `${name} — ${line.variationName}` : name;
}

/** Đi từng nước của 1 biến, hỏi người dùng đoán nước tiếp theo. Trả về số lỗi và có bỏ cuộc giữa chừng không. */
async function trainLine(
  line: RepertoireLineRow,
): Promise<{ mistakes: number; gaveUp: boolean }> {
  const moves = line.movesSan.split(" ").filter(Boolean);
  const chess = new Chess();
  let mistakes = 0;

  for (let i = 0; i < moves.length; i++) {
    const expected = moves[i];
    const moveNum = Math.floor(i / 2) + 1;
    const sideLabel = i % 2 === 0 ? "Trắng" : "Đen";
    const moveOrdinal = i % 2 === 0 ? `${moveNum}.` : `${moveNum}...`;

    const guess = await editor.prompt(
      `[${lineLabel(line)}] ${moveOrdinal} (${sideLabel}) — FEN hiện tại: ${chess.fen()}\n` +
        `Nhập nước bạn nghĩ đúng (SAN, vd "Nf3"), để trống để dừng biến này:`,
    );
    if (!guess) {
      return { mistakes, gaveUp: true };
    }
    if (guess.trim().toLowerCase() !== expected.toLowerCase()) {
      mistakes++;
      await editor.flashNotification(
        `Chưa đúng — nước đúng trong sổ tay là "${expected}". Tiếp tục...`,
        "warning",
      );
    }
    // Luôn đi đúng nước ghi trong sổ tay để tiếp tục đúng biến, bất kể người
    // dùng đoán đúng hay sai — đây là bài kiểm tra trí nhớ về MỘT biến cụ
    // thể, không phải một ván cờ mở.
    chess.move(expected);
  }

  return { mistakes, gaveUp: false };
}

/** Command "Chess: Ôn tập khai cuộc". */
export async function commandRepertoireTrain() {
  const dueLines = await chessSql.getDueRepertoireLines(LINES_PER_SESSION);
  if (dueLines.length === 0) {
    await editor.flashNotification(
      "Không có biến khai cuộc nào đến hạn ôn tập.",
      "info",
    );
    return;
  }

  let completed = 0;
  for (const line of dueLines) {
    const proceed = await editor.confirm(
      `Ôn tập biến: ${lineLabel(line)} (còn ${dueLines.length - completed} biến trong phiên này)?`,
    );
    if (!proceed) break;

    const { mistakes, gaveUp } = await trainLine(line);
    const grade = gradeFromMistakes(mistakes, gaveUp);
    await chessSql.recordRepertoireReview(line.ref, grade);
    completed++;

    await editor.flashNotification(
      gaveUp
        ? "Đã dừng biến này giữa chừng — xếp lịch ôn lại sớm."
        : mistakes === 0
          ? "Hoàn hảo, không lỗi nào! Xếp lịch ôn lại sau lâu hơn."
          : `Xong biến này, ${mistakes} lỗi — xếp lịch ôn lại sớm hơn.`,
      "info",
    );
  }

  await editor.flashNotification(
    `Đã ôn tập ${completed}/${dueLines.length} biến khai cuộc trong phiên này.`,
    "info",
  );
}
