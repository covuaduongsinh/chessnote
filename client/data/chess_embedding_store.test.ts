import { describe, expect, test } from "vitest";
import {
  bytesToFloat32,
  cosineSimilarity,
  float32ToBytes,
} from "./chess_embedding_store.ts";

// embedText() itself needs a real (lazily downloaded) transformers.js model
// — not exercised here, same "SQL/WASM-adjacent logic verified manually"
// stance as the rest of this plan (see chess_pgn_date.ts's module comment).
// These are the pure, always-testable parts: the math and the byte encoding
// used to persist a vector as a SQLite BLOB.

describe("cosineSimilarity", () => {
  test("is 1 for identical vectors", () => {
    const v = new Float32Array([0.1, 0.2, 0.3, 0.4]);
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5);
  });

  test("is 0 for orthogonal vectors", () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([0, 1]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 5);
  });

  test("is -1 for opposite vectors", () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([-1, -2, -3]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1, 5);
  });

  test("is scale-invariant (magnitude doesn't affect the result)", () => {
    const a = new Float32Array([1, 2, 3]);
    const bScaled = new Float32Array([10, 20, 30]);
    expect(cosineSimilarity(a, bScaled)).toBeCloseTo(1, 5);
  });

  test("returns 0 for mismatched dimensions instead of throwing", () => {
    expect(
      cosineSimilarity(new Float32Array([1, 2]), new Float32Array([1, 2, 3])),
    ).toBe(0);
  });

  test("returns 0 for a zero vector instead of dividing by zero (NaN)", () => {
    const zero = new Float32Array([0, 0, 0]);
    const v = new Float32Array([1, 2, 3]);
    expect(cosineSimilarity(zero, v)).toBe(0);
  });
});

describe("float32ToBytes / bytesToFloat32 round-trip", () => {
  test("preserves values through a byte round-trip", () => {
    const original = new Float32Array([0.5, -1.25, 3.75, 0, -0.001]);
    const bytes = float32ToBytes(original);
    const restored = bytesToFloat32(bytes);
    expect(Array.from(restored)).toEqual(Array.from(original));
  });

  test("round-trips correctly even from a non-4-byte-aligned offset", () => {
    // Simulates what a BLOB column read back from sqlite-wasm might hand
    // back: a Uint8Array view that doesn't start at a 4-byte boundary.
    const original = new Float32Array([1, 2, 3]);
    const padded = new Uint8Array(1 + original.byteLength);
    padded.set(float32ToBytes(original), 1);
    const misaligned = padded.subarray(1);
    expect(() => bytesToFloat32(misaligned)).not.toThrow();
    expect(Array.from(bytesToFloat32(misaligned))).toEqual(
      Array.from(original),
    );
  });
});
