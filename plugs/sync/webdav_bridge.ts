// Nối `webdav_sync.ts` (client WebDAV thuần) vào ChessNote: cấu hình, lưu
// credential, 3 Command (Đăng nhập/Đồng bộ/Đăng xuất). Thuật toán đồng bộ
// dùng chung với Dropbox ở `sync_engine.ts`.
import { clientStore, config, editor } from "@silverbulletmd/silverbullet/syscalls";
import type { WebDavAuth } from "./webdav_sync.ts";
import { WebDavSyncProvider } from "./webdav_provider.ts";
import {
  performSync,
  realSpaceOps,
  summarizeSyncErrorDetails,
  summarizeSyncReport,
  type SyncReport,
} from "./sync_engine.ts";
import { wrapProviderWithE2eeIfEnabled } from "./e2ee_bridge.ts";
import { notifyCredentialsChanged } from "./push_trigger.ts";

const CREDENTIALS_KEY = "webdavCredentials";
const LAST_SYNC_KEY = "webdavLastSync";

interface LastSyncInfo {
  at: number;
  error?: string;
}

async function getWebDavConfig(): Promise<{ url: string; folder: string }> {
  const url = (await config.get<string>("chess.webdav.url", "")).replace(/\/+$/, "");
  const folder = (await config.get<string>("chess.webdav.folder", "")).replace(/^\/+|\/+$/g, "");
  return { url, folder };
}

/** Init hook (editor:init) — đăng ký cấu hình WebDAV vào Configuration Manager. */
export async function initWebDavConfig() {
  await config.define("chess.webdav.url", {
    description:
      "URL gốc WebDAV, ví dụ Nextcloud: https://cloud.example.com/remote.php/dav/files/<user>/. " +
      'Chạy "Chess: Đăng nhập WebDAV" để nhập tên đăng nhập/mật khẩu (không lưu ở đây).',
    type: "string",
    default: "",
    ui: { category: "WebDAV Sync", label: "WebDAV URL", priority: 1 },
  });
  await config.define("chess.webdav.folder", {
    description:
      "Thư mục con bên trong WebDAV để đồng bộ (để trống = đồng bộ thẳng gốc URL trên với gốc Space này).",
    type: "string",
    default: "",
    ui: { category: "WebDAV Sync", label: "Thư mục WebDAV", priority: 2 },
  });
}

const NOT_CONFIGURED_HINT =
  'Chưa cấu hình WebDAV URL. Mở Configuration Manager, điền URL vào mục "WebDAV Sync".';

export async function webdavStatus() {
  const { url } = await getWebDavConfig();
  if (!url) return { ok: false, connected: false, error: NOT_CONFIGURED_HINT };
  const auth: WebDavAuth | undefined = await clientStore.get(CREDENTIALS_KEY);
  const last: LastSyncInfo | undefined = await clientStore.get(LAST_SYNC_KEY);
  return {
    ok: true,
    connected: Boolean(auth),
    lastSyncAt: last?.at,
    lastError: last?.error,
  };
}

/** Command "Chess: Đăng nhập WebDAV" — chỉ lưu credential (Basic Auth/app
 * password) cục bộ; KHÔNG có luồng OAuth như Dropbox vì WebDAV không có
 * chuẩn OAuth chung giữa các server. */
export async function commandWebDavLogin() {
  const { url } = await getWebDavConfig();
  if (!url) {
    await editor.flashNotification(NOT_CONFIGURED_HINT, "error");
    return;
  }
  const username = await editor.prompt("Tên đăng nhập WebDAV:");
  if (!username) return;
  const password = await editor.prompt("Mật khẩu / App password WebDAV:");
  if (!password) return;
  const auth: WebDavAuth = { baseUrl: url, username, password };
  await clientStore.set(CREDENTIALS_KEY, auth);
  await editor.flashNotification("Đã lưu thông tin đăng nhập WebDAV.", "info");
  // Có credential mới -- thử kết nối lại kênh push ngay, không chờ hết vòng
  // backoff của `push_trigger.ts` (chỉ có tác dụng nếu đã bật
  // chess.webdav.enableRealtimePush; tự bỏ qua êm nếu chưa bật).
  await notifyCredentialsChanged();
}

/** Command "Chess: Đăng xuất WebDAV". */
export async function commandWebDavLogout() {
  const confirmed = await editor.confirm(
    "Xoá thông tin đăng nhập WebDAV khỏi ChessNote? (chỉ xoá cục bộ, không ảnh hưởng server)",
  );
  if (!confirmed) return;
  await clientStore.del(CREDENTIALS_KEY);
  await editor.flashNotification("Đã xoá thông tin đăng nhập WebDAV.", "info");
  await notifyCredentialsChanged();
}

/**
 * Chạy đồng bộ WebDAV nếu đã cấu hình + đăng nhập; trả `null` (bỏ qua êm,
 * KHÔNG phải lỗi) nếu chưa cấu hình hoặc chưa đăng nhập. Dùng chung cho cả
 * Command thủ công và auto-trigger (`auto_trigger.ts`) — xem comment tương
 * ứng ở `dropbox_bridge.ts:runDropboxSync`.
 */
export async function runWebDavSync(): Promise<SyncReport | null> {
  const { url, folder } = await getWebDavConfig();
  if (!url) return null;
  const auth: WebDavAuth | undefined = await clientStore.get(CREDENTIALS_KEY);
  if (!auth) return null;

  try {
    const baseProvider = new WebDavSyncProvider(auth);
    const provider = await wrapProviderWithE2eeIfEnabled(baseProvider);
    const report = await performSync(provider, folder, realSpaceOps);
    await clientStore.set(LAST_SYNC_KEY, {
      at: Date.now(),
      error: report.errors.length ? summarizeSyncErrorDetails(report) : undefined,
    } satisfies LastSyncInfo);
    return report;
  } catch (e) {
    await clientStore.set(LAST_SYNC_KEY, {
      at: Date.now(),
      error: (e as Error).message,
    } satisfies LastSyncInfo);
    throw e;
  }
}

/** Command "Chess: Đồng bộ WebDAV". */
export async function commandWebDavSync() {
  const { url } = await getWebDavConfig();
  if (!url) {
    await editor.flashNotification(NOT_CONFIGURED_HINT, "error");
    return;
  }
  const auth: WebDavAuth | undefined = await clientStore.get(CREDENTIALS_KEY);
  if (!auth) {
    await editor.flashNotification('Chưa đăng nhập WebDAV. Chạy "Chess: Đăng nhập WebDAV" trước.', "error");
    return;
  }

  await editor.flashNotification("Đang đồng bộ WebDAV...", "info");
  try {
    const report = await runWebDavSync();
    if (!report) return; // đã kiểm tra url/auth ở trên, chỉ để TypeScript yên tâm
    const detail = report.errors.length ? ` — ${summarizeSyncErrorDetails(report)}` : "";
    await editor.flashNotification(
      `Đồng bộ WebDAV xong: ${summarizeSyncReport(report)}.${detail}`,
      report.errors.length ? "warning" : "info",
    );
  } catch (e) {
    await editor.flashNotification(`Đồng bộ WebDAV thất bại: ${(e as Error).message}`, "error");
  }
}
