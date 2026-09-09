// AI: Hỏi-đáp trên các ván cờ trong không gian ghi chú (Giai đoạn E của kế hoạch
// "AI phạm vi rộng nhiều ghi chú" — phần cuối cùng, phụ thuộc nhiều nhất vào các
// giai đoạn trước).
//
// Phạm vi có chủ đích: các ghi chú CÓ VÁN CỜ (chess-game object, Giai đoạn A) —
// không phải "mọi ghi chú bất kỳ loại nào" trong Space. Toàn bộ hạ tầng cross-note
// đã xây (Giai đoạn A-D) xoay quanh chess-game; mở rộng ra nội dung ghi chú bất kỳ
// cần một tầng index đoạn văn riêng, không tận dụng được gì từ các giai đoạn trước.
//
// Retrieval KHÔNG dùng vector embedding (ai-sidecar chưa có endpoint embedding) và
// KHÔNG dùng plug-api/lib/fuzzy.ts's rank(): hàm đó khớp kiểu AND-mọi-từ trên field
// ngắn (tên trang/alias) — hợp cho page picker, nhưng loại sạch MỌI ứng viên ngay
// khi câu hỏi tự nhiên chứa 1 từ không khớp field nào ("tôi", "tại sao", "hay"...).
// Thay bằng so khớp từ khoá kiểu OR đơn giản (không phân biệt dấu) trên một đoạn
// văn bản gộp mỗi ván (metadata + tóm tắt AI của Giai đoạn C nếu đã có).
import { editor, index, markdown, space, system } from "@silverbulletmd/silverbullet/syscalls";
import type { ChessGameFields, ChessGameObject } from "../index.ts";
import { extractFrontMatter } from "../../index/frontmatter.ts";
import { ANTI_HALLUCINATION_RULE } from "./coach.ts";
import { aiAsk } from "./bridge.ts";

const MAX_CONTEXT_GAMES = 15;

function normalize(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

// Hư từ tiếng Việt phổ biến (đã bỏ dấu) — loại khỏi từ khoá để không so khớp
// những từ xuất hiện ở gần như mọi câu hỏi, vô nghĩa để lọc ván liên quan.
const VI_STOPWORDS = new Set([
  "la", "va", "co", "khong", "cua", "the", "toi", "ban", "hay", "voi", "trong",
  "nhung", "mot", "nao", "gi", "vi", "sao", "nhu", "de", "cho", "o", "tren",
  "duoc", "ve", "da", "se", "lam", "nhieu", "it", "nay", "do", "kia", "ay", "tai",
  "tim", "cac",
]);

export function extractKeywords(question: string): string[] {
  const tokens = normalize(question).split(/[^a-z0-9]+/).filter((t) => t.length >= 2);
  return [...new Set(tokens.filter((t) => !VI_STOPWORDS.has(t)))];
}

export interface QaContextEntry {
  page: string;
  white: string;
  black: string;
  result: string;
  eco: string;
  event: string;
  summary: string; // frontmatter chessSummary (Giai đoạn C), rỗng nếu chưa có
}

function entryBlob(e: QaContextEntry): string {
  return normalize([e.white, e.black, e.result, e.eco, e.event, e.summary].join(" "));
}

export function scoreEntries(
  entries: QaContextEntry[],
  keywords: string[],
): (QaContextEntry & { score: number })[] {
  return entries
    .map((e) => ({ ...e, score: keywords.filter((k) => entryBlob(e).includes(k)).length }))
    .filter((e) => e.score > 0)
    .sort((a, b) => b.score - a.score);
}

export function citationLine(e: QaContextEntry): string {
  const parts = [
    `[[${e.page}]]`,
    `Trắng: ${e.white || "?"}`,
    `Đen: ${e.black || "?"}`,
    `Kết quả: ${e.result || "*"}`,
  ];
  if (e.eco) parts.push(`ECO: ${e.eco}`);
  if (e.summary) parts.push(e.summary);
  return parts.join(" — ");
}

export function buildQaPrompt(question: string, matches: QaContextEntry[]): string {
  const sourceLines = matches.length
    ? matches.map((m, i) => `${i + 1}. ${citationLine(m)}`)
    : ["(không tìm thấy ván nào khớp từ khoá trong câu hỏi)"];

  const lines = [
    "Bạn là trợ lý tra cứu ghi chú cờ vua cho người dùng ChessNote.",
    `Câu hỏi: "${question}"`,
    "",
    `Danh sách ván có thể liên quan (đã lọc bằng từ khoá, tối đa ${MAX_CONTEXT_GAMES} ván — ` +
      "KHÔNG PHẢI toàn bộ ván trong không gian ghi chú):",
    ...sourceLines,
    "",
    "Trả lời câu hỏi (tiếng Việt, ngắn gọn) CHỈ dựa trên danh sách trên. Với mỗi ván bạn nhắc " +
      "tới, PHẢI trích dẫn đúng dạng [[TênTrang]] đã cho ở trên, không tự đặt tên trang khác. " +
      "Nếu danh sách trống hoặc không đủ thông tin để trả lời, nói rõ là không tìm thấy dữ liệu " +
      "phù hợp thay vì cố trả lời. Không chào hỏi, đi thẳng vào câu trả lời.",
    "",
    ANTI_HALLUCINATION_RULE + " Không bịa thêm ván, tên trang, hay chi tiết nào ngoài danh sách trên.",
  ];
  return lines.join("\n");
}

/** Đọc frontmatter `chessSummary` (Giai đoạn C) nếu có — rỗng nếu chưa từng gợi ý tag cho ván này, không coi là lỗi. */
async function readSummary(page: string): Promise<string> {
  try {
    const text = await space.readPage(page);
    const tree = await markdown.parseMarkdown(text);
    const frontmatter = extractFrontMatter(tree);
    const summary = (frontmatter as Record<string, unknown>).chessSummary;
    return typeof summary === "string" ? summary : "";
  } catch {
    return "";
  }
}

export async function buildContextEntry(game: ChessGameObject): Promise<QaContextEntry> {
  return {
    page: game.page,
    white: game.white,
    black: game.black,
    result: game.result,
    eco: game.eco,
    event: game.event,
    summary: await readSummary(game.page),
  };
}

/** Command "Chess: Hỏi AI". */
export async function commandAskAi() {
  if (await system.isCapacitor()) {
    await editor.flashNotification(
      "Tính năng AI cần bản Web hoặc Desktop, chưa hỗ trợ trên Mobile.",
      "error",
    );
    return;
  }

  const question = await editor.prompt("Hỏi AI về các ván cờ trong không gian ghi chú:");
  if (!question) return;

  const games = await index.queryLuaObjects<ChessGameFields>("chess-game", {});
  if (games.length === 0) {
    await editor.flashNotification(
      "Không tìm thấy ván cờ nào (khối ```pgn```) trong không gian ghi chú.",
      "info",
    );
    return;
  }

  const entries = await Promise.all(games.map((g) => buildContextEntry(g as ChessGameObject)));
  const keywords = extractKeywords(question);
  const matches = scoreEntries(entries, keywords).slice(0, MAX_CONTEXT_GAMES);

  const ai = await aiAsk(buildQaPrompt(question, matches));

  const pad = (n: number) => String(n).padStart(2, "0");
  const d = new Date();
  const reportName =
    `Chess/Hỏi AI/${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;

  const sourcesMd = matches.length
    ? matches.map((m) => `- ${citationLine(m)}`).join("\n")
    : "_(không có ván nào khớp từ khoá trong câu hỏi)_";

  const markdownReport = `# Hỏi AI: ${question}

## Trả lời

${ai.ok ? ai.text : `_(AI chưa trả lời được: ${ai.error || "lỗi không rõ"})_`}

## Nguồn đã dùng (tối đa ${MAX_CONTEXT_GAMES} ván, lọc bằng từ khoá)

${sourcesMd}
`;

  await space.writePage(reportName, markdownReport);
  await editor.navigate(reportName);

  if (!ai.ok) {
    await editor.flashNotification(`AI không trả lời được: ${ai.error || "lỗi không rõ"}`, "warning");
  }
}
