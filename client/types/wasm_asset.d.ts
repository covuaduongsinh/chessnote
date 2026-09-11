// Ambient module for esbuild's `binary` loader (see build/build_client.ts),
// used to embed the SQLite WASM binary directly into the client bundle
// instead of fetching it separately at runtime (see client/data/chess_sql_store.ts).
declare module "*.wasm" {
  const bytes: Uint8Array;
  export default bytes;
}
