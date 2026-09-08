// Nối `dropbox_sync.ts` (client Dropbox thuần) vào ChessNote: cấu hình, lưu
// token, 3 Command (Đăng nhập/Đồng bộ/Đăng xuất), và thuật toán đồng bộ hai
// chiều so sánh rev/lastModified — phát hiện xung đột thì sinh file
// `.conflict-<thời điểm>.md` thay vì ghi đè mù quáng (đúng yêu cầu Giai đoạn 4).
//
// Phạm vi CHƯA làm (ghi rõ, không giấu): nội dung file xung đột được decode
// như UTF-8 text (đúng cho .md/.pgn — nội dung chính của ChessNote); tài liệu
// nhị phân (ảnh...) xung đột sẽ bị decode sai — hiếm gặp với cách dùng cá
// nhân hiện tại nhưng là giới hạn thật, không phải bug ẩn.
import { clientStore, config, editor, space } from "@silverbulletmd/silverbullet/syscalls";
import type { FileMeta } from "@silverbulletmd/silverbullet/type/index";
import {
  type DropboxClientDeps,
  type DropboxEntry,
  type DropboxTokens,
  DropboxConflictError,
  buildAuthorizeUrl,
  deleteFile as dbxDeleteFile,
  downloadFile as dbxDownloadFile,
  exchangeCodeForTokens,
  generateCodeChallenge,
  generateCodeVerifier,
  listFolderRecursive,
  normalizeDropboxFolder,
  uploadFile as dbxUploadFile,
} from "./dropbox_sync.ts";

const TOKENS_KEY = "dropboxTokens";
const PENDING_VERIFIER_KEY = "dropboxPendingCodeVerifier";
const STATE_FILE_PATH = "_dropbox/sync-state.json";

interface SyncStateEntry {
  localMtime?: number;
  remoteRev?: string;
}
type SyncState = Record<string, SyncStateEntry>;

async function getAppKey(): Promise<string> {
  return config.get<string>("chess.dropbox.appKey", "");
}

async function getSyncFolder(): Promise<string> {
  const folder = await config.get<string>("chess.dropbox.folder", "");
  return folder.replace(/\/+$/, "");
}

function makeDeps(appKey: string): DropboxClientDeps {
  return {
    appKey,
    getTokens: () => clientStore.get(TOKENS_KEY),
    saveTokens: (tokens: DropboxTokens) => clientStore.set(TOKENS_KEY, tokens),
  };
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
  return { ok: true, connected: Boolean(tokens) };
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

// ---- Thuật toán đồng bộ ----
//
// `performSync` nhận `SpaceOps` qua tham số (không tự import syscall `space`)
// để test được bằng một implementation giả trong bộ nhớ — đây là logic rủi ro
// cao nhất (quyết định khi nào mất dữ liệu), đáng tách riêng để kiểm chứng
// bằng vitest thay vì chỉ tin vào đọc code.

export interface SpaceOps {
  listFiles(): Promise<FileMeta[]>;
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, data: Uint8Array): Promise<FileMeta>;
  deleteFile(path: string): Promise<void>;
}

const realSpaceOps: SpaceOps = {
  listFiles: () => space.listFiles(),
  readFile: (path) => space.readFile(path),
  writeFile: (path, data) => space.writeFile(path, data),
  deleteFile: (path) => space.deleteFile(path),
};

async function loadState(spaceOps: SpaceOps): Promise<SyncState> {
  try {
    const data = await spaceOps.readFile(STATE_FILE_PATH);
    return JSON.parse(new TextDecoder().decode(data));
  } catch {
    return {};
  }
}

async function saveState(spaceOps: SpaceOps, state: SyncState): Promise<void> {
  await spaceOps.writeFile(STATE_FILE_PATH, new TextEncoder().encode(JSON.stringify(state)));
}

/** Đường dẫn file xung đột: chèn `.conflict-<thời điểm UTC>` trước phần mở rộng
 * cuối cùng, luôn kết thúc bằng `.md` để mở được như một trang bình thường. */
export function conflictPath(path: string, now: Date = new Date()): string {
  const ts = now.toISOString().replace(/[:.]/g, "-");
  const dot = path.lastIndexOf(".");
  const base = dot > path.lastIndexOf("/") ? path.slice(0, dot) : path;
  return `${base}.conflict-${ts}.md`;
}

export function isUtf8Decodable(bytes: Uint8Array): string | null {
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    return decoder.decode(bytes);
  } catch {
    return null;
  }
}

export interface SyncReport {
  uploaded: string[];
  downloaded: string[];
  deletedLocal: string[];
  deletedRemote: string[];
  conflicts: string[];
  errors: { path: string; error: string }[];
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
    const folder = await getSyncFolder();
    const report = await performSync(makeDeps(appKey), folder, realSpaceOps);
    const parts = [
      report.uploaded.length ? `↑${report.uploaded.length}` : "",
      report.downloaded.length ? `↓${report.downloaded.length}` : "",
      report.deletedLocal.length + report.deletedRemote.length
        ? `xoá ${report.deletedLocal.length + report.deletedRemote.length}`
        : "",
      report.conflicts.length ? `⚠ ${report.conflicts.length} xung đột` : "",
      report.errors.length ? `${report.errors.length} lỗi` : "",
    ].filter(Boolean);
    const summary = parts.length ? parts.join(", ") : "không có gì thay đổi";
    await editor.flashNotification(
      `Đồng bộ Dropbox xong: ${summary}.`,
      report.errors.length ? "warning" : "info",
    );
  } catch (e) {
    await editor.flashNotification(`Đồng bộ Dropbox thất bại: ${(e as Error).message}`, "error");
  }
}

export async function performSync(
  deps: DropboxClientDeps,
  folder: string,
  spaceOps: SpaceOps,
): Promise<SyncReport> {
  const state = await loadState(spaceOps);

  const [localFiles, remoteEntries] = await Promise.all([
    spaceOps.listFiles(),
    listFolderRecursive(deps, folder),
  ]);

  const localMap = new Map(
    localFiles.filter((f) => f.name !== STATE_FILE_PATH).map((f) => [f.name, f]),
  );
  const remoteMap = new Map<string, DropboxEntry>();
  for (const e of remoteEntries) {
    if (!e.deleted) remoteMap.set(e.path, e);
  }
  // Đường dẫn từng có mặt (local, remote hiện tại, hoặc trong state cũ).
  const allPaths = new Set<string>([...localMap.keys(), ...remoteMap.keys(), ...Object.keys(state)]);

  const report: SyncReport = {
    uploaded: [],
    downloaded: [],
    deletedLocal: [],
    deletedRemote: [],
    conflicts: [],
    errors: [],
  };
  const nextState: SyncState = {};
  const { prefix } = normalizeDropboxFolder(folder);
  const dropboxPathOf = (p: string) => `${prefix}${p}`;

  for (const path of allPaths) {
    try {
      const local = localMap.get(path);
      const remote = remoteMap.get(path);
      const prior = state[path];

      const localChanged = !prior ? Boolean(local) : local?.lastModified !== prior.localMtime;
      const remoteChanged = !prior ? Boolean(remote) : remote?.rev !== prior.remoteRev;

      if (!local && !remote) {
        continue; // đã biến mất cả hai bên, không giữ trong state nữa
      }

      // `prior` (nếu có) luôn được ghi kèm CẢ HAI field cùng lúc (xem các nhánh
      // dưới) — nên "prior tồn tại" nghĩa là ở lần đồng bộ trước, file có mặt
      // ở CẢ hai bên. Vì vậy khi một bên vắng mặt bây giờ, đó chắc chắn là một
      // lượt xoá (không cần/không nên so sánh remoteChanged||localChanged để
      // "phát hiện" điều hiển nhiên này — làm vậy từng gây bug thật: remote
      // biến mất luôn khiến remoteChanged=true, vô tình khoá luôn nhánh xoá).
      if (local && !remote) {
        if (!prior) {
          // Chưa từng đồng bộ, chỉ có ở local -> file mới, đẩy lên.
          const data = await spaceOps.readFile(path);
          const result = await dbxUploadFile(deps, dropboxPathOf(path), data, { tag: "add" });
          report.uploaded.push(path);
          nextState[path] = { localMtime: local.lastModified, remoteRev: result.rev };
        } else if (!localChanged) {
          // Remote đã bị xoá, local không đổi kể từ lần đồng bộ trước -> lan truyền xoá.
          await spaceOps.deleteFile(path);
          report.deletedLocal.push(path);
        } else {
          // Remote bị xoá NHƯNG local đã sửa từ đó -> ưu tiên không mất chỉnh sửa, tái tạo trên Dropbox.
          const data = await spaceOps.readFile(path);
          const result = await dbxUploadFile(deps, dropboxPathOf(path), data, { tag: "add" });
          report.uploaded.push(path);
          nextState[path] = { localMtime: local.lastModified, remoteRev: result.rev };
        }
        continue;
      }

      if (!local && remote) {
        if (!prior) {
          // Chưa từng đồng bộ, chỉ có trên Dropbox -> file mới, tải về.
          const dl = await dbxDownloadFile(deps, dropboxPathOf(path));
          const meta = await spaceOps.writeFile(path, dl.data);
          report.downloaded.push(path);
          nextState[path] = { localMtime: meta.lastModified, remoteRev: dl.rev };
        } else if (!remoteChanged) {
          // Local đã bị xoá, remote không đổi kể từ lần đồng bộ trước -> lan truyền xoá.
          await dbxDeleteFile(deps, dropboxPathOf(path));
          report.deletedRemote.push(path);
        } else {
          // Local bị xoá NHƯNG remote đã sửa từ đó -> ưu tiên không mất chỉnh sửa, tải lại về local.
          const dl = await dbxDownloadFile(deps, dropboxPathOf(path));
          const meta = await spaceOps.writeFile(path, dl.data);
          report.downloaded.push(path);
          nextState[path] = { localMtime: meta.lastModified, remoteRev: dl.rev };
        }
        continue;
      }

      if (local && remote) {
        if (localChanged && remoteChanged && prior) {
          // Xung đột thật: cả hai đổi kể từ lần đồng bộ trước.
          const dl = await dbxDownloadFile(deps, dropboxPathOf(path));
          const text = isUtf8Decodable(dl.data);
          const cPath = conflictPath(path);
          const body =
            `# Xung đột đồng bộ Dropbox: ${path}\n\n` +
            `Phiên bản trên Dropbox khác với bản cục bộ tại thời điểm đồng bộ này. ` +
            `Bản cục bộ được GIỮ NGUYÊN ở \`${path}\` (và đã đẩy đè lên Dropbox); ` +
            `nội dung bản Dropbox (bị thay thế) được lưu lại bên dưới để bạn đối chiếu:\n\n---\n\n` +
            (text ?? "*(nội dung nhị phân, không hiển thị được dạng văn bản)*");
          await spaceOps.writeFile(cPath, new TextEncoder().encode(body));
          report.conflicts.push(path);

          const localData = await spaceOps.readFile(path);
          const result = await dbxUploadFile(deps, dropboxPathOf(path), localData, {
            tag: "update",
            rev: remote.rev,
          });
          nextState[path] = { localMtime: local.lastModified, remoteRev: result.rev };
          continue;
        }
        if (localChanged) {
          const data = await spaceOps.readFile(path);
          const result = await dbxUploadFile(deps, dropboxPathOf(path), data, {
            tag: remote ? "update" : "add",
            rev: remote?.rev ?? "",
          });
          report.uploaded.push(path);
          nextState[path] = { localMtime: local.lastModified, remoteRev: result.rev };
          continue;
        }
        if (remoteChanged) {
          const dl = await dbxDownloadFile(deps, dropboxPathOf(path));
          const meta = await spaceOps.writeFile(path, dl.data);
          report.downloaded.push(path);
          nextState[path] = { localMtime: meta.lastModified, remoteRev: dl.rev };
          continue;
        }
        // Không đổi bên nào — giữ nguyên state.
        nextState[path] = prior;
      }
    } catch (e) {
      if (e instanceof DropboxConflictError) {
        // Dropbox tự phát hiện race lúc ghi (rev/add đã lệch giữa chừng) — bỏ qua
        // vòng này, lần đồng bộ sau sẽ nhìn thấy trạng thái mới và xử lý lại.
        report.conflicts.push(path);
        continue;
      }
      report.errors.push({ path, error: (e as Error).message });
    }
  }

  await saveState(spaceOps, nextState);
  return report;
}
