// Nối `dropbox_sync.ts` (client Dropbox thuần) vào ChessNote: cấu hình, lưu
// token, 3 Command (Đăng nhập/Đồng bộ/Đăng xuất). Thuật toán đồng bộ hai
// chiều dùng chung với các provider khác nằm ở `sync_engine.ts` (Giai đoạn A —
// tổng quát hoá khi thêm WebDAV).
import { clientStore, config, editor } from "@silverbulletmd/silverbullet/syscalls";
import {
  type DropboxTokens,
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  generateCodeChallenge,
  generateCodeVerifier,
} from "./dropbox_sync.ts";
import { DropboxSyncProvider } from "./dropbox_provider.ts";
import {
  diagnoseSync,
  performSync,
  realSpaceOps,
  summarizeSyncErrorDetails,
  summarizeSyncReport,
  type SyncReport,
} from "./sync_engine.ts";
import { wrapProviderWithE2eeIfEnabled } from "./e2ee_bridge.ts";

const TOKENS_KEY = "dropboxTokens";
const PENDING_VERIFIER_KEY = "dropboxPendingCodeVerifier";
const LAST_SYNC_KEY = "dropboxLastSync";

interface LastSyncInfo {
  at: number;
  error?: string;
}

async function getAppKey(): Promise<string> {
  return config.get<string>("chess.dropbox.appKey", "");
}

async function getSyncFolder(): Promise<string> {
  const folder = await config.get<string>("chess.dropbox.folder", "");
  return folder.replace(/\/+$/, "");
}

/** Init hook (editor:init) — đăng ký cấu hình Dropbox vào Configuration Manager. */
export async function initDropboxConfig() {
  await config.define("chess.dropbox.appKey", {
    description:
      "App key của một Dropbox App tự tạo tại dropbox.com/developers/apps (loại quyền " +
      "khuyến nghị: 'App folder' — Dropbox chỉ cấp quyền vào đúng một thư mục riêng, không " +
      "phải toàn bộ Dropbox của bạn). Không cần App secret vì dùng luồng PKCE công khai.",
    type: "string",
    default: "",
    ui: { category: "Dropbox Sync", label: "Dropbox App key", priority: 1 },
  });
  await config.define("chess.dropbox.folder", {
    description:
      "Thư mục con bên trong Dropbox App folder để đồng bộ (để trống = đồng bộ thẳng gốc " +
      "App folder với gốc Space này).",
    type: "string",
    default: "",
    ui: { category: "Dropbox Sync", label: "Thư mục Dropbox", priority: 2 },
  });
}

const NOT_CONFIGURED_HINT =
  'Chưa cấu hình Dropbox App key. Mở Configuration Manager, tạo App key tại ' +
  "dropbox.com/developers/apps rồi điền vào mục \"Dropbox Sync\".";

export async function dropboxStatus() {
  const appKey = await getAppKey();
  if (!appKey) return { ok: false, connected: false, error: NOT_CONFIGURED_HINT };
  const tokens: DropboxTokens | undefined = await clientStore.get(TOKENS_KEY);
  const last: LastSyncInfo | undefined = await clientStore.get(LAST_SYNC_KEY);
  return {
    ok: true,
    connected: Boolean(tokens),
    lastSyncAt: last?.at,
    lastError: last?.error,
  };
}

/** Command "Chess: Đăng nhập Dropbox". */
export async function commandDropboxLogin() {
  const appKey = await getAppKey();
  if (!appKey) {
    await editor.flashNotification(NOT_CONFIGURED_HINT, "error");
    return;
  }
  const existing: DropboxTokens | undefined = await clientStore.get(TOKENS_KEY);
  if (existing) {
    await editor.flashNotification("Đã đăng nhập Dropbox rồi.", "info");
    return;
  }

  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  await clientStore.set(PENDING_VERIFIER_KEY, verifier);

  await editor.openUrl(buildAuthorizeUrl(appKey, challenge), false);
  const code = await editor.prompt(
    "Đã mở trang đăng nhập Dropbox trong tab mới. Đăng nhập & cho phép quyền xong, dán mã xác thực vào đây:",
  );
  if (!code) {
    await clientStore.del(PENDING_VERIFIER_KEY);
    await editor.flashNotification("Đã huỷ đăng nhập Dropbox.", "info");
    return;
  }

  try {
    const tokens = await exchangeCodeForTokens(appKey, code, verifier);
    await clientStore.set(TOKENS_KEY, tokens);
    await editor.flashNotification("Đăng nhập Dropbox thành công.", "info");
  } catch (e) {
    await editor.flashNotification(`Đăng nhập Dropbox thất bại: ${(e as Error).message}`, "error");
  } finally {
    await clientStore.del(PENDING_VERIFIER_KEY);
  }
}

/** Command "Chess: Đăng xuất Dropbox". */
export async function commandDropboxLogout() {
  const confirmed = await editor.confirm(
    "Ngắt kết nối Dropbox khỏi ChessNote? (chỉ xoá token cục bộ, không xoá gì trên Dropbox)",
  );
  if (!confirmed) return;
  await clientStore.del(TOKENS_KEY);
  await editor.flashNotification("Đã ngắt kết nối Dropbox.", "info");
}

/**
 * Chạy đồng bộ Dropbox nếu đã cấu hình + đăng nhập; trả `null` (bỏ qua êm,
 * KHÔNG phải lỗi) nếu chưa cấu hình hoặc chưa đăng nhập. Dùng chung cho cả
 * Command thủ công (`commandDropboxSync`, bọc thêm flashNotification) và
 * auto-trigger (`auto_trigger.ts`, Giai đoạn A.3 — chạy êm, chỉ thông báo khi
 * có gì đáng chú ý).
 */
export async function runDropboxSync(): Promise<SyncReport | null> {
  const appKey = await getAppKey();
  if (!appKey) return null;
  const tokens: DropboxTokens | undefined = await clientStore.get(TOKENS_KEY);
  if (!tokens) return null;

  const folder = await getSyncFolder();
  try {
    const baseProvider = new DropboxSyncProvider({
      appKey,
      getTokens: () => clientStore.get(TOKENS_KEY),
      saveTokens: (t: DropboxTokens) => clientStore.set(TOKENS_KEY, t),
    });
    const provider = await wrapProviderWithE2eeIfEnabled(baseProvider);
    const report = await performSync(provider, folder, realSpaceOps);
    await clientStore.set(LAST_SYNC_KEY, {
      at: Date.now(),
      // performSync KHÔNG throw cho lỗi từng file riêng lẻ (report.errors) —
      // vẫn cần ghi lại ở đây, không thì "Chess: Trạng thái đồng bộ" sẽ báo
      // "không có lỗi" dù rõ ràng có 1 file lỗi trong report.
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

/** Command "Chess: Đồng bộ Dropbox". */
export async function commandDropboxSync() {
  const appKey = await getAppKey();
  if (!appKey) {
    await editor.flashNotification(NOT_CONFIGURED_HINT, "error");
    return;
  }
  const tokens: DropboxTokens | undefined = await clientStore.get(TOKENS_KEY);
  if (!tokens) {
    await editor.flashNotification('Chưa đăng nhập Dropbox. Chạy "Chess: Đăng nhập Dropbox" trước.', "error");
    return;
  }

  await editor.flashNotification("Đang đồng bộ Dropbox...", "info");
  try {
    const report = await runDropboxSync();
    if (!report) return; // đã kiểm tra appKey/tokens ở trên, chỉ để TypeScript yên tâm
    const detail = report.errors.length ? ` — ${summarizeSyncErrorDetails(report)}` : "";
    await editor.flashNotification(
      `Đồng bộ Dropbox xong: ${summarizeSyncReport(report)}.${detail}`,
      report.errors.length ? "warning" : "info",
    );
  } catch (e) {
    await editor.flashNotification(`Đồng bộ Dropbox thất bại: ${(e as Error).message}`, "error");
  }
}

/**
 * Command "Chess: Chẩn đoán đồng bộ Dropbox (không ghi gì)" — điều tra sự cố
 * xung đột lặp lại (2026-09-12: CONFIG.md/index.md cứ vài phút lại xung đột
 * dù không ai chỉnh sửa) mà KHÔNG rủi ro làm nó tệ thêm: chỉ gọi
 * `listEntries`/`listFiles` (đọc), không upload/download/ghi file conflict/
 * lưu state. An toàn để chạy nhiều lần khi đang tìm nguyên nhân gốc.
 */
export async function commandDropboxDiagnose() {
  const appKey = await getAppKey();
  if (!appKey) {
    await editor.flashNotification(NOT_CONFIGURED_HINT, "error");
    return;
  }
  const tokens: DropboxTokens | undefined = await clientStore.get(TOKENS_KEY);
  if (!tokens) {
    await editor.flashNotification('Chưa đăng nhập Dropbox. Chạy "Chess: Đăng nhập Dropbox" trước.', "error");
    return;
  }

  const folder = await getSyncFolder();
  try {
    const provider = new DropboxSyncProvider({
      appKey,
      getTokens: () => clientStore.get(TOKENS_KEY),
      saveTokens: (t: DropboxTokens) => clientStore.set(TOKENS_KEY, t),
    });
    const diffs = await diagnoseSync(provider, folder, realSpaceOps);
    if (diffs.length === 0) {
      await editor.flashNotification(
        "Chẩn đoán (không ghi gì): không có file nào đang xung đột thật ngay lúc này.",
        "info",
      );
      return;
    }
    const lines = diffs.map(
      (d) =>
        `${d.path} — local mtime ${d.priorLocalMtime}→${d.localMtime}, ` +
        `remote rev ${JSON.stringify(d.priorRemoteRev)}→${JSON.stringify(d.remoteRev)}`,
    );
    await editor.flashNotification(`CHẨN ĐOÁN XUNG ĐỘT (không ghi gì): ${lines.join(" || ")}`, "warning");
  } catch (e) {
    await editor.flashNotification(`Chẩn đoán thất bại: ${(e as Error).message}`, "error");
  }
}
