use std::sync::{Arc, OnceLock};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::Manager;

#[derive(Debug, Serialize, Deserialize)]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub os: String,
}

#[tauri::command]
fn get_app_info() -> AppInfo {
    AppInfo {
        name: "ChessNote".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        os: std::env::consts::OS.to_string(),
    }
}

/// Built once, on first use, and reused for every export afterwards — one
/// Chrome process for the app's whole lifetime, exactly like the server's
/// shared `ChromePool`. `Err` (no Chrome/Chromium found, or launch failure) is
/// cached too, so a machine without a browser fails fast on every subsequent
/// export rather than re-scanning `PATH` each time.
static CHROME_POOL: OnceLock<Result<Arc<silverbullet_server_runtime_chrome::ChromePool>, String>> =
    OnceLock::new();

fn chrome_pool() -> Result<Arc<silverbullet_server_runtime_chrome::ChromePool>, String> {
    CHROME_POOL
        .get_or_init(|| {
            // No per-space auth cookie is needed here (unlike the server's
            // runtime API): every export opens its own throwaway page and is
            // handed a self-contained HTML string directly, never a URL.
            // `.chrome-data` just needs *a* writable, stable directory for the
            // profile, so the OS temp dir is a reasonable stand-in for the
            // "server root" this config type was designed around.
            let root = std::env::temp_dir().join("chessnote-desktop-pdf-chrome");
            let _ = std::fs::create_dir_all(&root);
            let config = silverbullet_server_runtime_chrome::ChromeConfig::from_env(&root)
                .map_err(|e| format!("{e:?}"))?;
            silverbullet_server_runtime_chrome::ChromePool::new(config).map_err(|e| e.to_string())
        })
        .clone()
}

/// Desktop counterpart to the server's `POST /.export/pdf`: same
/// self-contained-HTML-in, PDF-bytes-out contract, same underlying
/// `ChromePool::print_to_pdf`, so a desktop export is pixel-identical to a
/// browser export. `print_to_pdf` blocks on its own owned Tokio runtime, so it
/// must run on a blocking thread here too — calling it directly from this
/// `async fn` would panic ("cannot start a runtime from within a runtime")
/// since Tauri's own async runtime is already active on this thread.
#[tauri::command]
async fn export_pdf(html: String) -> Result<Vec<u8>, String> {
    let pool = chrome_pool()?;
    tokio::task::spawn_blocking(move || pool.print_to_pdf(html, Duration::from_secs(60)))
        .await
        .map_err(|e| format!("pdf render task failed: {e}"))?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![get_app_info, export_pdf])
        .setup(|app| {
            let window = app.get_webview_window("main");
            if let Some(w) = window {
                let _ = w.show();
                let _ = w.set_focus();
                #[cfg(debug_assertions)]
                {
                    w.open_devtools();
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running ChessNote desktop application");
}
