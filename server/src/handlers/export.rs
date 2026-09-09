//! `/.export/pdf` — render a self-contained HTML string (already assembled by
//! the client: page content + inline CSS + static board images) to PDF via the
//! shared `PdfRenderer`. Mirrors `handlers::runtime`'s shape: a thin HTTP body
//! around a blocking backend call, since rendering may block on a browser.

use std::sync::Arc;
use std::time::Duration;

use axum::body::Bytes;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;

use crate::runtime::RuntimeError;
use crate::state::ServerState;

/// Upper bound on rendering one page to PDF. Generous: a large page with many
/// board diagrams still has to lay out and paginate before Chrome can print it.
const DEFAULT_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(serde::Deserialize)]
struct ExportPdfRequest {
    html: String,
}

fn not_enabled() -> Response {
    (
        StatusCode::SERVICE_UNAVAILABLE,
        Json(json!({ "error": "PDF export is not enabled" })),
    )
        .into_response()
}

fn render_error_response(e: RuntimeError) -> Response {
    let status = match e {
        RuntimeError::NotReady | RuntimeError::Transport(_) => StatusCode::SERVICE_UNAVAILABLE,
        RuntimeError::Timeout => StatusCode::GATEWAY_TIMEOUT,
        RuntimeError::Eval(_) => StatusCode::INTERNAL_SERVER_ERROR,
    };
    (status, Json(json!({ "error": e.to_string() }))).into_response()
}

pub async fn handle_export_pdf(
    State(state): State<Arc<ServerState>>,
    _headers: HeaderMap,
    body: Bytes,
) -> Response {
    let Some(renderer) = state.pdf_renderer.clone() else {
        return not_enabled();
    };
    if state.boot_config.read_only {
        return (
            StatusCode::METHOD_NOT_ALLOWED,
            Json(json!({ "error": "Read-only mode" })),
        )
            .into_response();
    }
    let request: ExportPdfRequest = match serde_json::from_slice(&body) {
        Ok(r) => r,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": format!("Invalid JSON: {e}") })),
            )
                .into_response()
        }
    };
    if request.html.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Request body's \"html\" field is required" })),
        )
            .into_response();
    }

    let result =
        tokio::task::spawn_blocking(move || renderer.render_pdf(request.html, DEFAULT_TIMEOUT))
            .await;

    match result {
        Ok(Ok(pdf_bytes)) => (
            StatusCode::OK,
            [(axum::http::header::CONTENT_TYPE, "application/pdf")],
            pdf_bytes,
        )
            .into_response(),
        Ok(Err(e)) => render_error_response(e),
        Err(join) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("pdf render task failed: {join}") })),
        )
            .into_response(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::test_state;
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use tower::ServiceExt;

    struct FakeRenderer(Result<Vec<u8>, RuntimeErrorKind>);
    #[derive(Clone)]
    enum RuntimeErrorKind {
        NotReady,
        Timeout,
    }
    impl crate::pdf::PdfRenderer for FakeRenderer {
        fn render_pdf(&self, _html: String, _timeout: Duration) -> Result<Vec<u8>, RuntimeError> {
            match &self.0 {
                Ok(bytes) => Ok(bytes.clone()),
                Err(RuntimeErrorKind::NotReady) => Err(RuntimeError::NotReady),
                Err(RuntimeErrorKind::Timeout) => Err(RuntimeError::Timeout),
            }
        }
    }

    fn state_with_renderer(renderer: Option<Box<dyn crate::pdf::PdfRenderer>>) -> Arc<ServerState> {
        let mut s = test_state();
        s.pdf_renderer = renderer.map(Arc::from);
        Arc::new(s)
    }

    async fn post_export(state: Arc<ServerState>, body: &str) -> (StatusCode, Vec<u8>) {
        let resp = crate::build_router(state)
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/.export/pdf")
                    .header("content-type", "application/json")
                    .body(Body::from(body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        let status = resp.status();
        let bytes = axum::body::to_bytes(resp.into_body(), usize::MAX)
            .await
            .unwrap();
        (status, bytes.to_vec())
    }

    #[tokio::test]
    async fn no_renderer_returns_503_not_enabled() {
        let (status, body) = post_export(state_with_renderer(None), r#"{"html":"<p>hi</p>"}"#).await;
        assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);
        assert!(String::from_utf8_lossy(&body).contains("not enabled"));
    }

    #[tokio::test]
    async fn success_returns_pdf_bytes_with_content_type() {
        let renderer = Box::new(FakeRenderer(Ok(b"%PDF-1.7 fake".to_vec())));
        let resp = crate::build_router(state_with_renderer(Some(renderer)))
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/.export/pdf")
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"html":"<p>hi</p>"}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        assert_eq!(
            resp.headers().get("content-type").unwrap(),
            "application/pdf"
        );
        let bytes = axum::body::to_bytes(resp.into_body(), usize::MAX)
            .await
            .unwrap();
        assert_eq!(&bytes[..], b"%PDF-1.7 fake");
    }

    #[tokio::test]
    async fn empty_html_is_400() {
        let renderer = Box::new(FakeRenderer(Ok(vec![])));
        let (status, _) = post_export(state_with_renderer(Some(renderer)), r#"{"html":""}"#).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn not_ready_maps_to_503() {
        let renderer = Box::new(FakeRenderer(Err(RuntimeErrorKind::NotReady)));
        let (status, _) =
            post_export(state_with_renderer(Some(renderer)), r#"{"html":"<p>hi</p>"}"#).await;
        assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);
    }

    #[tokio::test]
    async fn timeout_maps_to_504() {
        let renderer = Box::new(FakeRenderer(Err(RuntimeErrorKind::Timeout)));
        let (status, _) =
            post_export(state_with_renderer(Some(renderer)), r#"{"html":"<p>hi</p>"}"#).await;
        assert_eq!(status, StatusCode::GATEWAY_TIMEOUT);
    }

    #[tokio::test]
    async fn read_only_rejects_before_touching_the_renderer() {
        let renderer: Box<dyn crate::pdf::PdfRenderer> = Box::new(FakeRenderer(Ok(vec![])));
        let mut s = test_state();
        s.pdf_renderer = Some(Arc::from(renderer));
        s.boot_config.read_only = true;
        let (status, _) = post_export(Arc::new(s), r#"{"html":"<p>hi</p>"}"#).await;
        assert_eq!(status, StatusCode::METHOD_NOT_ALLOWED);
    }
}
