// Thuật toán đồng bộ hai chiều dùng CHUNG cho mọi `SyncProvider` (Dropbox,
// WebDAV...) — tách ra từ `dropbox_bridge.ts` (Giai đoạn 4) khi tổng quát hoá
// thêm provider thứ hai. Giữ nguyên 100% thuật toán 4-case + phát hiện xung
// đột + sinh file `.conflict-<thời điểm>.md` đã có, chỉ đổi type tham số từ
// `DropboxClientDeps` cụ thể sang `SyncProvider` tổng quát.
//
// Phạm vi CHƯA làm (ghi rõ, không giấu): nội dung file xung đột được decode
// như UTF-8 text (đúng cho .md/.pgn — nội dung chính của ChessNote); tài liệu
// nhị phân (ảnh...) xung đột sẽ bị decode sai — hiếm gặp với cách dùng cá
// nhân hiện tại nhưng là giới hạn thật, không phải bug ẩn.
import { space } from "@silverbulletmd/silverbullet/syscalls";
import type { FileMeta } from "@silverbulletmd/silverbullet/type/index";
import { RemoteConflictError, type RemoteFileEntry, type SyncProvider } from "./sync_provider.ts";

interface SyncStateEntry {
  localMtime?: number;
  remoteRev?: string;
}
type SyncState = Record<string, SyncStateEntry>;

export interface SpaceOps {
  listFiles(): Promise<FileMeta[]>;
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, data: Uint8Array): Promise<FileMeta>;
  deleteFile(path: string): Promise<void>;
}

export const realSpaceOps: SpaceOps = {
  listFiles: () => space.listFiles(),
  readFile: (path) => space.readFile(path),
  writeFile: (path, data) => space.writeFile(path, data),
  deleteFile: (path) => space.deleteFile(path),
};

/**
 * Mỗi provider giữ file trạng thái riêng — QUAN TRỌNG khi có >1 provider cấu
 * hình cùng lúc trên cùng Space (Dropbox + WebDAV): dùng chung 1 file sẽ làm
 * provider này ghi đè state của provider kia, khiến `localChanged`/
 * `remoteChanged` tính sai và có thể mất dữ liệu. Dropbox giữ nguyên đường
 * dẫn cũ `_dropbox/sync-state.json` (không ép người dùng hiện tại re-sync
 * toàn bộ khi lên bản có WebDAV); provider mới dùng `_sync/<tên>-state.json`.
 */
function stateFilePathFor(provider: SyncProvider): string {
  if (provider.name === "Dropbox") return "_dropbox/sync-state.json";
  const slug = provider.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `_sync/${slug}-state.json`;
}

async function loadState(spaceOps: SpaceOps, stateFilePath: string): Promise<SyncState> {
  try {
    const data = await spaceOps.readFile(stateFilePath);
    return JSON.parse(new TextDecoder().decode(data));
  } catch {
    return {};
  }
}

async function saveState(
  spaceOps: SpaceOps,
  stateFilePath: string,
  state: SyncState,
): Promise<void> {
  await spaceOps.writeFile(stateFilePath, new TextEncoder().encode(JSON.stringify(state)));
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

/** Tóm tắt 1 dòng cho thông báo — dùng chung giữa Command thủ công
 * ("Chess: Đồng bộ Dropbox/WebDAV") và auto-trigger (`auto_trigger.ts`). */
export function summarizeSyncReport(report: SyncReport): string {
  const parts = [
    report.uploaded.length ? `↑${report.uploaded.length}` : "",
    report.downloaded.length ? `↓${report.downloaded.length}` : "",
    report.deletedLocal.length + report.deletedRemote.length
      ? `xoá ${report.deletedLocal.length + report.deletedRemote.length}`
      : "",
    report.conflicts.length ? `⚠ ${report.conflicts.length} xung đột` : "",
    report.errors.length ? `${report.errors.length} lỗi` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "không có gì thay đổi";
}

/**
 * Chi tiết từng lỗi (path + lý do thật) — TRƯỚC ĐÂY cả Command thủ công lẫn
 * auto-trigger chỉ hiện `summarizeSyncReport()` (chỉ có số lượng "1 lỗi",
 * không có lý do), khiến người dùng không tự chẩn đoán được gì. Giới hạn số
 * lỗi hiện ra để không tràn 1 thông báo toast quá dài khi nhiều file lỗi
 * cùng lúc.
 */
export function summarizeSyncErrorDetails(report: SyncReport, max = 3): string {
  if (report.errors.length === 0) return "";
  const shown = report.errors.slice(0, max).map((e) => `${e.path}: ${e.error}`);
  const more = report.errors.length > max ? ` (và ${report.errors.length - max} lỗi khác)` : "";
  return shown.join(" | ") + more;
}

/** true nếu có gì đáng thông báo (khác "không có gì thay đổi") — auto-trigger
 * dùng để chạy êm, chỉ hiện notification khi thật sự có việc xảy ra. */
export function syncReportIsNotable(report: SyncReport): boolean {
  return (
    report.uploaded.length > 0 ||
    report.downloaded.length > 0 ||
    report.deletedLocal.length > 0 ||
    report.deletedRemote.length > 0 ||
    report.conflicts.length > 0 ||
    report.errors.length > 0
  );
}

export async function performSync(
  provider: SyncProvider,
  folder: string,
  spaceOps: SpaceOps,
): Promise<SyncReport> {
  const stateFilePath = stateFilePathFor(provider);
  const state = await loadState(spaceOps, stateFilePath);

  const [localFiles, remoteEntries] = await Promise.all([
    spaceOps.listFiles(),
    provider.listEntries(folder),
  ]);

  // `space.listFiles()` returns the Fallthrough-merged listing (real Space
  // files + the server's read-only baked-in Library/Std, perm: "ro" — see
  // server-common/src/space/embed.rs) — not just this Space's own content.
  // Those paths aren't ours to sync: excluded entirely (not just from
  // localMap) so they're never uploaded, downloaded, reported as a conflict,
  // or hit the server's write-guard for fallback-only paths. Same `perm`
  // check already used by plugs/configuration-manager/libraries.ts's
  // roguePlugs filter.
  const readOnlyPaths = new Set(
    localFiles.filter((f) => f.perm === "ro").map((f) => f.name),
  );

  const localMap = new Map(
    localFiles
      .filter((f) => f.name !== stateFilePath && !readOnlyPaths.has(f.name))
      .map((f) => [f.name, f]),
  );
  const remoteMap = new Map<string, RemoteFileEntry>();
  for (const e of remoteEntries) {
    if (!e.deleted) remoteMap.set(e.path, e);
  }
  // Đường dẫn từng có mặt (local, remote hiện tại, hoặc trong state cũ).
  const allPaths = new Set<string>(
    [...localMap.keys(), ...remoteMap.keys(), ...Object.keys(state)].filter(
      (p) => !readOnlyPaths.has(p),
    ),
  );

  const report: SyncReport = {
    uploaded: [],
    downloaded: [],
    deletedLocal: [],
    deletedRemote: [],
    conflicts: [],
    errors: [],
  };
  const nextState: SyncState = {};

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
          const result = await provider.upload(folder, path, data, { tag: "add" });
          report.uploaded.push(path);
          nextState[path] = { localMtime: local.lastModified, remoteRev: result.rev };
        } else if (!localChanged) {
          // Remote đã bị xoá, local không đổi kể từ lần đồng bộ trước -> lan truyền xoá.
          await spaceOps.deleteFile(path);
          report.deletedLocal.push(path);
        } else {
          // Remote bị xoá NHƯNG local đã sửa từ đó -> ưu tiên không mất chỉnh sửa, tái tạo trên remote.
          const data = await spaceOps.readFile(path);
          const result = await provider.upload(folder, path, data, { tag: "add" });
          report.uploaded.push(path);
          nextState[path] = { localMtime: local.lastModified, remoteRev: result.rev };
        }
        continue;
      }

      if (!local && remote) {
        if (!prior) {
          // Chưa từng đồng bộ, chỉ có trên remote -> file mới, tải về.
          const dl = await provider.download(folder, path);
          const meta = await spaceOps.writeFile(path, dl.data);
          report.downloaded.push(path);
          nextState[path] = { localMtime: meta.lastModified, remoteRev: dl.rev };
        } else if (!remoteChanged) {
          // Local đã bị xoá, remote không đổi kể từ lần đồng bộ trước -> lan truyền xoá.
          await provider.delete(folder, path);
          report.deletedRemote.push(path);
        } else {
          // Local bị xoá NHƯNG remote đã sửa từ đó -> ưu tiên không mất chỉnh sửa, tải lại về local.
          const dl = await provider.download(folder, path);
          const meta = await spaceOps.writeFile(path, dl.data);
          report.downloaded.push(path);
          nextState[path] = { localMtime: meta.lastModified, remoteRev: dl.rev };
        }
        continue;
      }

      if (local && remote) {
        if (localChanged && remoteChanged && prior) {
          // Xung đột thật: cả hai đổi kể từ lần đồng bộ trước.
          const dl = await provider.download(folder, path);
          const text = isUtf8Decodable(dl.data);
          const cPath = conflictPath(path);
          const body =
            `# Xung đột đồng bộ ${provider.name}: ${path}\n\n` +
            `Phiên bản trên ${provider.name} khác với bản cục bộ tại thời điểm đồng bộ này. ` +
            `Bản cục bộ được GIỮ NGUYÊN ở \`${path}\` (và đã đẩy đè lên ${provider.name}); ` +
            `nội dung bản ${provider.name} (bị thay thế) được lưu lại bên dưới để bạn đối chiếu:\n\n---\n\n` +
            (text ?? "*(nội dung nhị phân, không hiển thị được dạng văn bản)*");
          await spaceOps.writeFile(cPath, new TextEncoder().encode(body));
          report.conflicts.push(path);

          const localData = await spaceOps.readFile(path);
          const result = await provider.upload(folder, path, localData, {
            tag: "update",
            rev: remote.rev,
          });
          nextState[path] = { localMtime: local.lastModified, remoteRev: result.rev };
          continue;
        }
        if (localChanged) {
          const data = await spaceOps.readFile(path);
          const result = await provider.upload(folder, path, data, {
            tag: remote ? "update" : "add",
            rev: remote?.rev ?? "",
          });
          report.uploaded.push(path);
          nextState[path] = { localMtime: local.lastModified, remoteRev: result.rev };
          continue;
        }
        if (remoteChanged) {
          const dl = await provider.download(folder, path);
          const meta = await spaceOps.writeFile(path, dl.data);
          report.downloaded.push(path);
          nextState[path] = { localMtime: meta.lastModified, remoteRev: dl.rev };
          continue;
        }
        // Không đổi bên nào — giữ nguyên state.
        nextState[path] = prior;
      }
    } catch (e) {
      if (e instanceof RemoteConflictError) {
        // Provider tự phát hiện race lúc ghi (rev/add đã lệch giữa chừng) — bỏ
        // qua vòng này, lần đồng bộ sau sẽ nhìn thấy trạng thái mới và xử lý lại.
        report.conflicts.push(path);
        continue;
      }
      report.errors.push({ path, error: (e as Error).message });
    }
  }

  await saveState(spaceOps, stateFilePath, nextState);
  return report;
}
