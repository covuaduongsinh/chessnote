//! The `PdfRenderer` trait consumed by the `/.export/pdf` handler. Mirrors
//! `runtime::RuntimeBackend`'s shape deliberately: the router never knows *how*
//! a page is turned into a PDF (headless Chrome today), only that it can ask
//! for one and get bytes back or a `RuntimeError`.

use std::time::Duration;

use crate::runtime::RuntimeError;

/// Render a self-contained HTML string (no external resources — everything the
/// caller wants in the PDF must already be inlined) to PDF bytes.
pub trait PdfRenderer: Send + Sync {
    /// Blocking (the caller runs it via `spawn_blocking`), like
    /// `RuntimeBackend::eval_global`. Only infrastructure failures (no browser,
    /// launch failure, timeout) are `Err`; there is no "user-level" error case
    /// here the way a Lua exception is one for the runtime API.
    fn render_pdf(&self, html: String, timeout: Duration) -> Result<Vec<u8>, RuntimeError>;
}
