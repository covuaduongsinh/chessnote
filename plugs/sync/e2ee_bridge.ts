// Cấu hình + Command cho E2EE (Giai đoạn A.5, tuỳ chọn) — dùng CHUNG cho mọi
// provider (Dropbox/WebDAV), không phải cấu hình riêng theo provider.
import { clientStore, config, editor } from "@silverbulletmd/silverbullet/syscalls";
import { createLocalCheckValue, verifyLocalCheckValue } from "./e2ee.ts";
import { EncryptingSyncProvider } from "./e2ee.ts";
import type { SyncProvider } from "./sync_provider.ts";

const CHECK_VALUE_KEY = "e2eeLocalCheckValue";

// Key đã mở khoá — CHỈ sống trong bộ nhớ của phiên hiện tại (không lưu mật
// khẩu, không lưu key xuống đĩa). Mỗi lần mở lại app phải mở khoá lại bằng
// Command "Chess: Mở khoá mã hoá đồng bộ".
let unlockedKey: CryptoKey | undefined;

/** Init hook (editor:init) — đăng ký cấu hình E2EE vào Configuration Manager. */
export async function initE2eeConfig() {
  await config.define("chess.sync.e2ee.enabled", {
    description:
      "Mã hoá đầu cuối (E2EE) nội dung file TRƯỚC KHI upload lên Dropbox/WebDAV — tên file vẫn " +
      'để rõ, chỉ nội dung được mã hoá. Bật xong phải chạy "Chess: Mở khoá mã hoá đồng bộ" (mỗi ' +
      "lần mở app) để nhập mật khẩu — không lưu mật khẩu ở đâu cả. ⚠️ Đổi cờ này giữa chừng trên " +
      "dữ liệu cũ CHƯA mã hoá sẽ KHÔNG tự động mã hoá lại — phải xoá sync-state và đồng bộ lại từ đầu.",
    type: "boolean",
    default: false,
    ui: { category: "Sync", label: "Mã hoá đồng bộ (E2EE)", priority: 3 },
  });
}

/** Command "Chess: Mở khoá mã hoá đồng bộ". */
export async function commandE2eeUnlock() {
  const enabled = await config.get<boolean>("chess.sync.e2ee.enabled", false);
  if (!enabled) {
    await editor.flashNotification(
      'Chưa bật "Mã hoá đồng bộ (E2EE)" trong Configuration Manager.',
      "error",
    );
    return;
  }
  const password = await editor.prompt("Mật khẩu mã hoá đồng bộ:");
  if (!password) return;

  try {
    const storedCheck: string | undefined = await clientStore.get(CHECK_VALUE_KEY);
    if (storedCheck) {
      unlockedKey = await verifyLocalCheckValue(password, storedCheck);
    } else {
      // Lần đầu mở khoá trên MÁY NÀY — lưu check value cục bộ để lần sau báo
      // lỗi "sai mật khẩu" ngay, không cần chờ tới lúc giải mã file thật.
      const { key, checkValue } = await createLocalCheckValue(password);
      await clientStore.set(CHECK_VALUE_KEY, checkValue);
      unlockedKey = key;
    }
    await editor.flashNotification("Đã mở khoá mã hoá đồng bộ cho phiên này.", "info");
  } catch (e) {
    unlockedKey = undefined;
    await editor.flashNotification(`Mở khoá thất bại: ${(e as Error).message}`, "error");
  }
}

/** Command "Chess: Khoá lại mã hoá đồng bộ". */
export async function commandE2eeLock() {
  unlockedKey = undefined;
  await editor.flashNotification(
    "Đã khoá lại — cần mở khoá trước khi đồng bộ lần sau.",
    "info",
  );
}

/**
 * Bọc `provider` bằng lớp mã hoá NẾU config đã bật E2EE; trả nguyên `provider`
 * nếu chưa bật. Ném lỗi rõ ràng nếu đã bật nhưng CHƯA mở khoá trong phiên
 * này — fail-closed: không bao giờ âm thầm đồng bộ plaintext khi người dùng
 * đã bật E2EE (giống nguyên tắc `isEncryptionKeyMissing` của Super
 * Productivity).
 */
export async function wrapProviderWithE2eeIfEnabled(provider: SyncProvider): Promise<SyncProvider> {
  const enabled = await config.get<boolean>("chess.sync.e2ee.enabled", false);
  if (!enabled) return provider;
  if (!unlockedKey) {
    throw new Error(
      'Đã bật E2EE nhưng chưa mở khoá — chạy "Chess: Mở khoá mã hoá đồng bộ" trước.',
    );
  }
  return new EncryptingSyncProvider(provider, unlockedKey);
}
