import { describe, expect, test } from "vitest";
import { extractKeywords, normalize } from "./text_normalize.ts";

describe("normalize", () => {
  test("strips Vietnamese diacritics and lowercases", () => {
    expect(normalize("Phòng Thủ Sicilian")).toBe("phong thu sicilian");
  });

  test("maps đ/Đ to d (they are not combining marks, so NFD alone keeps them)", () => {
    expect(normalize("Đen đối thủ")).toBe("den doi thu");
  });

  test("leaves already-plain text untouched aside from casing", () => {
    expect(normalize("Sicilian Najdorf")).toBe("sicilian najdorf");
  });
});

describe("extractKeywords", () => {
  test("splits on non-alphanumeric characters", () => {
    expect(extractKeywords("Sicilian, Najdorf!")).toEqual([
      "sicilian",
      "najdorf",
    ]);
  });

  test("drops Vietnamese stopwords", () => {
    expect(extractKeywords("tôi hay chơi Sicilian không")).toEqual([
      "choi",
      "sicilian",
    ]);
  });

  test("keeps the leading đ of a word instead of dropping it", () => {
    expect(extractKeywords("Đen thắng ván Sicilian")).toEqual([
      "den",
      "thang",
      "van",
      "sicilian",
    ]);
  });

  test("now drops stopwords that start with đ (đã, để, được, đó)", () => {
    expect(extractKeywords("đã để được đó Sicilian")).toEqual(["sicilian"]);
  });

  test("drops single-character tokens", () => {
    expect(extractKeywords("x y e4 z")).toEqual(["e4"]);
  });

  test("deduplicates keywords", () => {
    expect(extractKeywords("Sicilian sicilian SICILIAN")).toEqual(["sicilian"]);
  });

  test("returns an empty array for an all-stopword question", () => {
    expect(extractKeywords("là và có không của thế")).toEqual([]);
  });
});
