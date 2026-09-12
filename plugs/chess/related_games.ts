// Gợi ý ván liên quan (Giai đoạn D của kế hoạch "AI phạm vi rộng nhiều ghi chú").
//
// MVP cố ý KHÔNG dùng AI, theo đúng quyết định trong kế hoạch: thuần rule-based
// trên dữ liệu đã có sẵn — cùng mã khai cuộc (ECO), cùng người chơi. Rẻ, tức
// thời, không cần gọi ai-sidecar/engine, nên tính ngay khi render widget (phía
// Worker, trong pgnWidget()) thay vì phải bấm nút như các tính năng AI thật
// (Giai đoạn B/C) — đúng nguyên tắc "chỉ việc đắt tiền (AI, engine) mới cần
// hành động rõ ràng của người dùng" đã áp dụng xuyên suốt các giai đoạn trước.
//
// Chưa làm vector embedding search: ai-sidecar hiện chỉ hỗ trợ sinh văn bản qua
// Claude CLI, không có endpoint embedding — quyết định có chủ đích, để dành làm
// sau nếu chất lượng rule-based này không đủ tốt.
//
// Chấm điểm/lọc/sắp xếp/giới hạn chuyển sang SQL từ Phase 3 của
// docs/plans/2026-09-11-dbms-sqlite-wasm-tich-hop.md (chessSql.queryRelatedGames)
// — trước đó là vòng lặp JS thuần trên TOÀN BỘ ván lấy qua
// index.queryLuaObjects mỗi lần render widget. Phần build text "reasons" vẫn
// thuần TS (buildRelatedGameReasons), test được qua vitest mà không đụng WASM.
import { queryRelatedGames } from "./external_syscalls.ts";

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
 * Rebuilds the human-readable "why this game is related" text purely from
 * (current, other)'s own fields — same logic the SQL scoring in
 * chess_sql_store.ts's queryRelatedGames() uses to compute the score, just
 * re-derived here in TS so it stays testable without touching WASM.
 */
export function buildRelatedGameReasons(
  current: { white: string; black: string; eco: string },
  other: { white: string; black: string; eco: string },
): string[] {
  const reasons: string[] = [];

  if (current.eco && other.eco && current.eco === other.eco) {
    reasons.push(`cùng mã khai cuộc ECO ${other.eco}`);
  }

  const currentNames = new Set(
    [current.white, current.black]
      .map(meaningfulName)
      .filter((n): n is string => n !== null)
      .map((n) => n.toLowerCase()),
  );
  const otherNames = [other.white, other.black]
    .map(meaningfulName)
    .filter((n): n is string => n !== null);
  const sharedNames = otherNames.filter((n) =>
    currentNames.has(n.toLowerCase()),
  );
  if (sharedNames.length > 0) {
    reasons.push(`cùng người chơi: ${[...new Set(sharedNames)].join(", ")}`);
  }

  return reasons;
}

/**
 * `current` chỉ cần page/white/black/eco (đã có sẵn ngay trong pgnWidget từ
 * header PGN, không cần tra lại Object Index/SQL). So khớp theo TRANG chứ
 * không theo `ref` — mỗi trang trong ChessNote thường chỉ chứa 1 ván (như Giai
 * đoạn C cũng giả định), nên loại trừ theo `page` là đủ mà không cần biết vị
 * trí chính xác của khối PGN đang xem trong trang.
 */
export async function findRelatedGames(
  current: { page: string; white: string; black: string; eco: string },
  limit = 5,
): Promise<RelatedGameMatch[]> {
  const rows = await queryRelatedGames({
    page: current.page,
    white: meaningfulName(current.white),
    black: meaningfulName(current.black),
    eco: current.eco,
    limit,
  });

  return rows.map((row) => ({
    page: row.page,
    white: row.white,
    black: row.black,
    result: row.result,
    eco: row.eco,
    score: row.score,
    reasons: buildRelatedGameReasons(current, row),
  }));
}
