// Chuẩn hoá & tách từ khoá tiếng Việt — dùng chung giữa nơi TÌM (ai/qa.ts xây từ
// khoá câu hỏi) và nơi INDEX (index.ts xây blob đưa vào FTS5, Phase 2 của
// docs/plans/2026-09-11-dbms-sqlite-wasm-tich-hop.md). Phải là cùng một cách chuẩn
// hoá ở cả hai đầu, nếu không nội dung đã index và từ khoá tìm sẽ lệch nhau.

export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

// Hư từ tiếng Việt phổ biến (đã bỏ dấu) — loại khỏi từ khoá để không so khớp
// những từ xuất hiện ở gần như mọi câu hỏi, vô nghĩa để lọc ván liên quan.
export const VI_STOPWORDS = new Set([
  "la",
  "va",
  "co",
  "khong",
  "cua",
  "the",
  "toi",
  "ban",
  "hay",
  "voi",
  "trong",
  "nhung",
  "mot",
  "nao",
  "gi",
  "vi",
  "sao",
  "nhu",
  "de",
  "cho",
  "o",
  "tren",
  "duoc",
  "ve",
  "da",
  "se",
  "lam",
  "nhieu",
  "it",
  "nay",
  "do",
  "kia",
  "ay",
  "tai",
  "tim",
  "cac",
]);

export function extractKeywords(question: string): string[] {
  const tokens = normalize(question)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);
  return [...new Set(tokens.filter((t) => !VI_STOPWORDS.has(t)))];
}
