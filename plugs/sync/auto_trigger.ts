// Tự động chạy sync Dropbox/WebDAV theo chu kỳ (Giai đoạn A.3): bước 1 —
// interval; bước 2 — debounce theo page:saved; bước 3 — event
// "editor:activityResumed" (client.ts:registerActivityResumeListeners) khi
// app trở lại foreground (tab/window focus trên Web/Desktop, "resume" của
// Capacitor App trên Mobile — xem `sync.plug.yaml`).
import { config, editor } from "@silverbulletmd/silverbullet/syscalls";
import { dropboxStatus, runDropboxSync } from "./dropbox_bridge.ts";
import { runWebDavSync, webdavStatus } from "./webdav_bridge.ts";
import {
  summarizeSyncErrorDetails,
  summarizeSyncReport,
  syncReportIsNotable,
  type SyncReport,
} from "./sync_engine.ts";

// Lock riêng theo tên provider — chỉ chặn 2 lượt sync CHỒNG LẤP của CÙNG 1
// provider (ví dụ interval bắn lại trước khi lượt trước xong); KHÔNG chặn
// Dropbox và WebDAV chạy song song với nhau.
const providerLocks: Record<string, boolean> = {};

async function runOneQuiet(name: string, run: () => Promise<SyncReport | null>): Promise<void> {
  if (providerLocks[name]) return;
  providerLocks[name] = true;
  try {
    const report = await run();
    if (!report) return; // chưa cấu hình/chưa đăng nhập provider này -> bỏ qua êm
    if (syncReportIsNotable(report)) {
      const detail = report.errors.length ? ` — ${summarizeSyncErrorDetails(report)}` : "";
      await editor.flashNotification(
        `Đồng bộ ${name} tự động: ${summarizeSyncReport(report)}.${detail}`,
        report.errors.length ? "warning" : "info",
      );
    }
  } catch (e) {
    await editor.flashNotification(
      `Đồng bộ ${name} tự động thất bại: ${(e as Error).message}`,
      "error",
    );
  } finally {
    providerLocks[name] = false;
  }
}

/** Chạy tất cả provider đã cấu hình, mỗi provider có lock riêng — gọi từ
 * interval timer (dưới) và có thể gọi thêm từ debounce file-changed sau này. */
export async function runAllConfiguredSyncs(): Promise<void> {
  await Promise.all([
    runOneQuiet("Dropbox", runDropboxSync),
    runOneQuiet("WebDAV", runWebDavSync),
  ]);
}

let intervalHandle: ReturnType<typeof setInterval> | undefined;

/** Init hook (editor:init) — đăng ký cấu hình interval + khởi động timer.
 * Tự clear timer cũ trước khi tạo mới để tránh cộng dồn nếu hook này chạy lại
 * nhiều lần trong đời sống worker (an toàn khi gọi lại nhiều lần). */
export async function initAutoTrigger() {
  await config.define("chess.sync.autoIntervalMinutes", {
    description:
      "Tự động chạy 'Chess: Đồng bộ Dropbox/WebDAV' (với mọi provider đã cấu hình + đăng " +
      "nhập) theo chu kỳ này, tính bằng phút. Đặt 0 để tắt hẳn tự động, chỉ đồng bộ bằng " +
      "nút bấm/Command thủ công.",
    type: "number",
    default: 5,
    ui: { category: "Sync", label: "Tự động đồng bộ mỗi (phút)", priority: 1 },
  });

  if (intervalHandle !== undefined) {
    clearInterval(intervalHandle);
    intervalHandle = undefined;
  }

  const minutes = await config.get<number>("chess.sync.autoIntervalMinutes", 5);
  if (!minutes || minutes <= 0) return;

  intervalHandle = setInterval(() => {
    void runAllConfiguredSyncs();
  }, minutes * 60_000);
}

const DEBOUNCE_AFTER_SAVE_MS = 30_000;
let debounceHandle: ReturnType<typeof setTimeout> | undefined;

/**
 * Event hook "page:saved" — mỗi lần 1 trang .md được ghi (qua editor tự lưu
 * lúc gõ, HOẶC qua bất kỳ plug nào gọi `space.writeFile()`, kể cả CHÍNH sync
 * engine tự ghi file tải về/file xung đột — xem `client/spaces/evented_space_primitives.ts`)
 * thì debounce lại rồi mới chạy sync, để không bắn hàng loạt lượt sync khi
 * người dùng gõ liên tục nhiều trang.
 *
 * Chấp nhận: sync engine tự ghi file cũng kích lại 1 lượt debounce — vô hại
 * (lượt sync kế tiếp sẽ thấy không có gì thay đổi và tự dừng êm, không hiện
 * notification vì `syncReportIsNotable` trả false), không đáng để làm 1 cờ
 * "đang sync" phức tạp hơn chỉ để tránh đúng 1 lượt sync rỗng thừa.
 */
export function onPageSaved() {
  if (debounceHandle !== undefined) clearTimeout(debounceHandle);
  debounceHandle = setTimeout(() => {
    debounceHandle = undefined;
    void runAllConfiguredSyncs();
  }, DEBOUNCE_AFTER_SAVE_MS);
}

interface ProviderStatus {
  ok: boolean;
  connected: boolean;
  error?: string;
  lastSyncAt?: number;
  lastError?: string;
}

function formatStatusLine(name: string, status: ProviderStatus): string {
  if (!status.ok) return `${name}: chưa cấu hình`;
  if (!status.connected) return `${name}: đã cấu hình, chưa đăng nhập`;
  const lastPart = status.lastSyncAt
    ? `lần cuối ${new Date(status.lastSyncAt).toLocaleString("vi-VN")}`
    : "chưa đồng bộ lần nào";
  const errPart = status.lastError ? ` — lỗi gần nhất: ${status.lastError}` : "";
  return `${name}: đã đăng nhập, ${lastPart}${errPart}`;
}

/** Command "Chess: Trạng thái đồng bộ" — gộp trạng thái mọi provider vào 1
 * thông báo, không cần UI riêng (Configuration Manager thô đã đủ dùng cho
 * cấu hình — xem Giai đoạn A.4). */
export async function commandSyncStatus() {
  const [dropbox, webdav] = await Promise.all([dropboxStatus(), webdavStatus()]);
  const lines = [formatStatusLine("Dropbox", dropbox), formatStatusLine("WebDAV", webdav)];
  await editor.flashNotification(lines.join("  |  "), "info");
}
