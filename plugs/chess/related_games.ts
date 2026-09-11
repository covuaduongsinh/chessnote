// Gợi ý ván liên quan (Giai đoạn D của kế hoạch "AI phạm vi rộng nhiều ghi chú").
//
// MVP cố ý KHÔNG dùng AI, theo đúng quyết định trong kế hoạch: thuần rule-based
// trên dữ liệu đã có sẵn từ Giai đoạn A (chess-game Object Index) — cùng mã khai
// cuộc (ECO), cùng người chơi. Rẻ, tức thời, không cần gọi ai-sidecar/engine, nên
// tính ngay khi render widget (phía Worker, trong pgnWidget()) thay vì phải bấm
// nút như các tính năng AI thật (Giai đoạn B/C) — đúng nguyên tắc "chỉ việc đắt
// tiền (AI, engine) mới cần hành động rõ ràng của người dùng" đã áp dụng xuyên
// suốt các giai đoạn trước.
//
// Chưa làm vector embedding search: ai-sidecar hiện chỉ hỗ trợ sinh văn bản qua
// Claude CLI, không có endpoint embedding — quyết định có chủ đích, để dành làm
// sau nếu chất lượng rule-based này không đủ tốt.
import type { ChessGameObject } from "./index.ts";

export interface RelatedGameMatch {
  page: string;
  white: string;
  black: string;
  result: string;
  eco: string;
  score: number;
  reasons: string[];
}

const PLACEHOLDER_NAMES = new Set(["", "white", "black"]);

function meaningfulName(name: string): string | null {
  const trimmed = name.trim();
  return PLACEHOLDER_NAMES.has(trimmed.toLowerCase()) ? null : trimmed;
}

/**
 * `current` chỉ cần page/white/black/eco (đã có sẵn ngay trong pgnWidget từ
 * header PGN, không cần tra lại Object Index). So khớp theo TRANG chứ không theo
 * `ref` của object — mỗi trang trong ChessNote thường chỉ chứa 1 ván (như Giai
 * đoạn C cũng giả định), nên loại trừ theo `page` là đủ mà không cần biết vị trí
 * chính xác của khối PGN đang xem trong trang.
 */
export function findRelatedGames(
  current: { page: string; white: string; black: string; eco: string },
  candidates: ChessGameObject[],
  limit = 5,
): RelatedGameMatch[] {
  const currentNames = new Set(
    [current.white, current.black]
      .map(meaningfulName)
      .filter((n): n is string => n !== null)
      .map((n) => n.toLowerCase()),
  );

  const results: RelatedGameMatch[] = [];
  for (const other of candidates) {
    if (other.page === current.page) continue;

    let score = 0;
    const reasons: string[] = [];

    if (current.eco && other.eco && current.eco === other.eco) {
      score += 3;
      reasons.push(`cùng mã khai cuộc ECO ${other.eco}`);
    }

    const otherNames = [other.white, other.black]
      .map(meaningfulName)
      .filter((n): n is string => n !== null);
    const sharedNames = otherNames.filter((n) =>
      currentNames.has(n.toLowerCase()),
    );
    if (sharedNames.length > 0) {
      score += 2;
      reasons.push(`cùng người chơi: ${[...new Set(sharedNames)].join(", ")}`);
    }

    if (score > 0) {
      results.push({
        page: other.page,
        white: other.white,
        black: other.black,
        result: other.result,
        eco: other.eco,
        score,
        reasons,
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}
