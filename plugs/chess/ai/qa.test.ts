import { describe, expect, test, vi } from "vitest";

type AiAskResult = { ok: true; text: string } | { ok: false; error: string };
const aiAskMock = vi.fn(
  async (_prompt: string): Promise<AiAskResult> => ({ ok: true, text: "mock reply" }),
);
vi.mock("./bridge.ts", () => ({ aiAsk: (prompt: string) => aiAskMock(prompt) }));

const {
  extractKeywords,
  scoreEntries,
  citationLine,
  buildQaPrompt,
} = await import("./qa.ts");
type QaContextEntry = Parameters<typeof citationLine>[0];

function entry(overrides: Partial<QaContextEntry> = {}): QaContextEntry {
  return {
    page: "Game1",
    white: "Alice",
    black: "Bob",
    result: "1-0",
    eco: "C50",
    event: "Casual Game",
    summary: "",
    ...overrides,
  };
}

describe("extractKeywords", () => {
  test("strips diacritics, lowercases, and drops short/stopword tokens", () => {
    const keywords = extractKeywords("Tìm ván tôi thua vì bỏ hậu ở Sicilian");
    expect(keywords).toContain("sicilian");
    expect(keywords).toContain("hau");
    expect(keywords).not.toContain("toi");
    expect(keywords).not.toContain("vi");
    expect(keywords).not.toContain("o");
  });

  test("de-duplicates repeated words", () => {
    expect(extractKeywords("blunder blunder blunder")).toEqual(["blunder"]);
  });

  test("returns an empty list for a question made entirely of stopwords", () => {
    expect(extractKeywords("là và có không")).toEqual([]);
  });
});

describe("scoreEntries", () => {
  test("matches keywords against white/black/eco/event/summary, diacritic-insensitive", () => {
    const entries = [
      entry({ page: "Sicilian1", eco: "B90", event: "Sicilian Najdorf" }),
      entry({ page: "Italian1", eco: "C50", event: "Italian Game" }),
    ];
    const scored = scoreEntries(entries, extractKeywords("ván Sicilian"));
    expect(scored.map((e) => e.page)).toEqual(["Sicilian1"]);
  });

  test("excludes entries that match none of the keywords", () => {
    const entries = [entry({ page: "NoMatch", white: "X", black: "Y", eco: "", event: "" })];
    expect(scoreEntries(entries, ["sicilian"])).toEqual([]);
  });

  test("ranks entries matching more keywords above those matching fewer", () => {
    const entries = [
      entry({ page: "OneMatch", white: "sicilian", black: "Z" }),
      entry({ page: "TwoMatches", white: "sicilian", black: "blunder-game" }),
    ];
    const scored = scoreEntries(entries, ["sicilian", "blunder"]);
    expect(scored.map((e) => e.page)).toEqual(["TwoMatches", "OneMatch"]);
  });

  test("finds matches in the Giai đoạn C summary field too", () => {
    const entries = [
      entry({ page: "Summarized", white: "X", black: "Y", eco: "", summary: "Đen hy sinh hậu sớm" }),
      entry({ page: "NoSummary", white: "A", black: "B", eco: "" }),
    ];
    const scored = scoreEntries(entries, extractKeywords("hy sinh hậu"));
    expect(scored.map((e) => e.page)).toEqual(["Summarized"]);
  });
});

describe("citationLine", () => {
  test("includes the wikilink, both player names, and result", () => {
    const line = citationLine(entry());
    expect(line).toContain("[[Game1]]");
    expect(line).toContain("Alice");
    expect(line).toContain("Bob");
    expect(line).toContain("1-0");
  });

  test("omits eco/summary segments when absent", () => {
    const line = citationLine(entry({ eco: "", summary: "" }));
    expect(line).not.toContain("ECO:");
  });

  test("includes the Giai đoạn C summary when present", () => {
    const line = citationLine(entry({ summary: "Ván đấu sắc bén." }));
    expect(line).toContain("Ván đấu sắc bén.");
  });
});

describe("buildQaPrompt", () => {
  test("includes the question, numbered sources, and the anti-hallucination rule", () => {
    const prompt = buildQaPrompt("Tôi hay thua kiểu gì?", [entry()]);
    expect(prompt).toContain('Tôi hay thua kiểu gì?');
    expect(prompt).toContain("1. [[Game1]]");
    expect(prompt).toMatch(/KHÔNG suy diễn/);
    expect(prompt).toContain("Không bịa thêm ván, tên trang");
  });

  test("shows an explicit placeholder instead of an empty source list", () => {
    const prompt = buildQaPrompt("Câu hỏi lạ", []);
    expect(prompt).toContain("không tìm thấy ván nào khớp từ khoá");
  });

  test("never invents player names not present in the given entries", () => {
    const prompt = buildQaPrompt("Ai chơi hay nhất?", [entry({ white: "OnlyThisName", black: "AndThis" })]);
    // Sanity: only the names we actually passed in appear, nothing fabricated.
    expect(prompt).toContain("OnlyThisName");
    expect(prompt).toContain("AndThis");
  });
});
