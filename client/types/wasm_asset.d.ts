// Ambient module for esbuild's `binary` loader (see build/build_client.ts
// and client/plugos/plug_compile.ts), used to embed a WASM binary directly
// into a bundle (client or plug) instead of fetching it separately at
// runtime — see plugs/chess-db/sqlite_store.ts.
declare module "*.wasm" {
  const bytes: Uint8Array;
  export default bytes;
}
