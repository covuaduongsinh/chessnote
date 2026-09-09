/**
 * Detects whether this client is running "standalone" — i.e. as a Capacitor
 * mobile shell or a Tauri desktop shell — with no real Rust server behind it
 * (static bundle + IndexedDB only). Used to pick space storage primitives
 * (see client.ts) and to answer `system.hasServerProxy` for plugs that need
 * to fetch external hosts without going through the server's `/.proxy/`.
 */
export function detectStandaloneEnv(): boolean {
  return (
    typeof (window as any).Capacitor !== "undefined" ||
    typeof (window as any).__TAURI__ !== "undefined" ||
    typeof (window as any).__TAURI_INTERNALS__ !== "undefined" ||
    typeof (window as any).__TAURI_METADATA__ !== "undefined" ||
    !!(window as any).silverbullet?.offlineOnly ||
    location.protocol === "tauri:" ||
    location.hostname === "tauri.localhost"
  );
}
