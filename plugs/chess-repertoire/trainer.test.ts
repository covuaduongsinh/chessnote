import { describe, expect, test } from "vitest";
import { gradeFromMistakes } from "./trainer.ts";

describe("gradeFromMistakes", () => {
  test("giving up mid-line always grades 'again', regardless of mistakes so far", () => {
    expect(gradeFromMistakes(0, true)).toBe("again");
    expect(gradeFromMistakes(3, true)).toBe("again");
  });

  test("zero mistakes and completed grades 'easy'", () => {
    expect(gradeFromMistakes(0, false)).toBe("easy");
  });

  test("exactly one mistake grades 'good'", () => {
    expect(gradeFromMistakes(1, false)).toBe("good");
  });

  test("two or more mistakes grades 'hard'", () => {
    expect(gradeFromMistakes(2, false)).toBe("hard");
    expect(gradeFromMistakes(5, false)).toBe("hard");
  });
});
