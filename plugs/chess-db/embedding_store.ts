// Client-side text embeddings via transformers.js — Phase 5 (stretch) of
// docs/plans/2026-09-11-dbms-sqlite-wasm-tich-hop.md. Per the user's choice
// of architecture (embedding computed in the browser, not ai-sidecar — keeps
// ai-sidecar's "zero runtime dependency" stance intact).
//
// Confirmed by inspecting the published package before writing this: unlike
// @sqlite.org/sqlite-wasm, @huggingface/transformers' browser entry
// (dist/transformers.web.js) is a pre-bundled, Node-native-free ESM file —
// no esbuild loader tricks needed here, a plain dynamic `import()` is
// enough. What IS confirmed heavy: the ONNX Runtime Web WASM binary alone is
// 13-26MB (onnxruntime-web's dist/*.wasm, several variants), before even
// counting model weights (commonly 50-120MB quantized for a small
// multilingual embedding model) — never bundled into client.js, always
// fetched lazily (on first actual use) from HuggingFace's/jsDelivr's CDN via
// transformers.js's own default `env` config, and cached by the browser
// after that. This is the biggest unverified-in-this-session part of the
// whole DBMS plan — no live browser was available to confirm the model
// actually downloads/runs; verify this first before relying on it.
//
// Runs directly inside this plug's own Web Worker sandbox (see
// sqlite_store.ts's module comment for why that's fine) — exposed to other
// plugs via the `chessEmbedding` syscall this plug's own manifest
// (chess-db.plug.yaml) declares.

/** Xenova's community ONNX port of intfloat/multilingual-e5-small — chosen for Vietnamese-language support at a comparatively small (quantized) download size. Verify this model id still resolves on the Hub before relying on it; swap here if not. */
export const EMBEDDING_MODEL_ID = "Xenova/multilingual-e5-small";

// deno-lint-ignore no-explicit-any
type Embedder = (text: string, opts: Record<string, unknown>) => Promise<any>;
let embedderPromise: Promise<Embedder> | null = null;

async function getEmbedder(): Promise<Embedder> {
  if (!embedderPromise) {
    embedderPromise = (async () => {
      const { pipeline } = await import("@huggingface/transformers");
      return (await pipeline("feature-extraction", EMBEDDING_MODEL_ID, {
        dtype: "q8",
      })) as unknown as Embedder;
    })();
  }
  return embedderPromise;
}

/** Computes a normalized embedding vector for a piece of text. First call in a session triggers the lazy model download (see module comment) — can take a while, callers should show progress UI. */
export async function embedText(text: string): Promise<Float32Array> {
  const embed = await getEmbedder();
  const output = await embed(text, { pooling: "mean", normalize: true });
  const data: ArrayLike<number> = output.data ?? output;
  return Float32Array.from(data);
}

/** Cosine similarity, written out in full (not just a dot product) so it stays correct even if the `normalize: true` pipeline option above is ever removed. */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

/** Serializes an embedding for storage as a SQLite BLOB (sqlite_store.ts's game_embeddings table) — a plain little-endian float32 byte dump, no framing needed since the dimension is fixed per model. */
export function float32ToBytes(vec: Float32Array): Uint8Array {
  return new Uint8Array(vec.buffer, vec.byteOffset, vec.byteLength);
}

export function bytesToFloat32(bytes: Uint8Array): Float32Array {
  // Copy into a fresh, aligned buffer — `bytes` as read back from sqlite-wasm
  // isn't guaranteed to start at a 4-byte-aligned offset, which
  // `Float32Array`'s view constructor requires.
  const copy = bytes.slice().buffer;
  return new Float32Array(copy);
}
