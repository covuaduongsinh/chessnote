import { WidgetType } from "@codemirror/view";
import type { Client } from "../client.ts";
import { createWidgetSandboxIFrame } from "../components/widget_sandbox_iframe.ts";
import { findFencedCodeBodyRange } from "./fenced_code_body_range.ts";
import type {
  CodeWidgetCallback,
  CodeWidgetContent,
} from "@silverbulletmd/silverbullet/type/client";

export class IFrameWidget extends WidgetType {
  iframe?: HTMLIFrameElement;

  constructor(
    readonly client: Client,
    readonly bodyText: string,
    readonly codeWidgetCallback: CodeWidgetCallback,
  ) {
    super();
    // Eagerly kick off the callback so the result is in flight before
    // CodeMirror mounts the widget. Idempotent on bodyText.
    this.client.widgetCache
      .prewarmResult(this.bodyText, () =>
        this.codeWidgetCallback(this.bodyText, this.client.currentName()),
      )
      .catch(() => {
        // renderContent / iframe message handler will surface errors.
      });
  }

  override get estimatedHeight(): number {
    const cachedHeight = this.client.widgetCache.getCachedWidgetHeight(
      this.bodyText,
    );
    // console.log("Calling estimated height", this.bodyText, cachedHeight);
    return cachedHeight > 0 ? cachedHeight : 150;
  }

  toDOM(): HTMLElement {
    const iframe = createWidgetSandboxIFrame(
      this.client,
      this.bodyText,
      this.client.widgetCache.prewarmResult(this.bodyText, () =>
        this.codeWidgetCallback(this.bodyText, this.client.currentName()),
      ),
      (message) => {
        switch (message.type) {
          case "blur": {
            const pos = this.client.editorView.posAtDOM(iframe, 0);
            this.client.editorView.dispatch({
              selection: { anchor: pos },
            });
            this.client.focus();

            break;
          }
          case "reload":
            // Force-refresh: drop any prewarmed result and re-run.
            this.client.widgetCache.invalidatePrewarm(this.bodyText);
            void this.codeWidgetCallback(
              this.bodyText,
              this.client.currentName(),
            ).then((widgetContent: CodeWidgetContent | null) => {
              if (widgetContent === null) {
                iframe.contentWindow!.postMessage({
                  type: "html",
                  html: "",
                  theme: document.getElementsByTagName("html")[0].dataset.theme,
                });
              } else {
                iframe.contentWindow!.postMessage({
                  type: "html",
                  html: widgetContent.html,
                  script: widgetContent.script,
                  theme: document.getElementsByTagName("html")[0].dataset.theme,
                });
              }
            });
            break;
          case "replaceBody": {
            // A widget asking to write its own (possibly edited) content
            // back into the page's source -- see findFencedCodeBodyRange
            // above for why this re-resolves the range fresh rather than
            // trusting a position captured when the widget was built.
            const { id, oldText, newText } = message;
            const respond = (result: unknown, error?: string) =>
              iframe.contentWindow?.postMessage({
                type: "replaceBody-response",
                id,
                result,
                error,
              });
            try {
              const pos = this.client.editorView.posAtDOM(iframe, 0);
              const range = findFencedCodeBodyRange(
                this.client.editorView.state,
                pos,
              );
              if (!range) {
                respond(
                  undefined,
                  "Không tìm thấy khối code chứa widget này trong trang.",
                );
                break;
              }
              const current = this.client.editorView.state.sliceDoc(
                range.from,
                range.to,
              );
              if (current !== oldText) {
                respond(
                  undefined,
                  "Nội dung trang đã thay đổi kể từ khi widget này được tải -- tải lại trang rồi lưu lại.",
                );
                break;
              }
              this.client.editorView.dispatch({
                changes: { from: range.from, to: range.to, insert: newText },
              });
              respond(true);
            } catch (e) {
              respond(undefined, (e as Error).message);
            }
            break;
          }
        }
      },
    );

    const estimatedHeight = this.estimatedHeight;
    iframe.style.height = `${estimatedHeight}px`;

    return iframe;
  }

  override eq(other: WidgetType): boolean {
    return other instanceof IFrameWidget && other.bodyText === this.bodyText;
  }
}
