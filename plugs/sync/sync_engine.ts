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
 * `client_bundle/base_fs/` has exactly two top-level directories --
 * `Library/` and `Repositories/` -- and BOTH are entirely the server's
 * baked-in read-only content (served through the Fallthrough merge with
 * this Space's real files). No genuine user file should ever live at a
 * path starting with either prefix.
 *
 * Excluded unconditionally by path prefix, NOT just when `perm === "ro"`:
 * sự cố 2026-09-13 (bản vá `perm`-only ngày 2026-09-12 dừng được vòng lặp
 * cho `Library/Std/Plugs/*.plug.js`, nhưng vài trang tài liệu/mẫu cụ thể
 * khác dưới `Library/` -- `Library/Std`, `Library/Std/APIs/Action Button`,
 * `Library/Chess/Templates/Opening_Repertoire` -- vẫn tiếp tục bị coi là
 * "xung đột" lặp lại dù không có file thật nào trên đĩa (`find` xác nhận
 * `Library/Std` hoàn toàn trống ngoài các file `.conflict-*.md` do chính
 * lỗi này tạo ra) -- nguyên nhân chính xác vì sao `perm` không nhất quán
 * "ro" cho đúng những path này chưa xác định được dứt điểm; loại trừ theo
 * tiền tố đường dẫn là lớp phòng thủ độc lập, không phụ thuộc vào việc
 * server báo `perm` đúng hay không cho từng file nhúng cứng.
 */
const BAKED_IN_PREFIXES = ["Library/", "Repositories/"];
function isBakedIn(path: string): boolean {
  return BAKED_IN_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/**
 * Bộ phạm vi đồng bộ dùng chung giữa `performSync()` và `diagnoseSync()` --
 * trước đây mỗi hàm tự xây riêng `readOnlyPaths`/`localMap`/`allPaths`
 * (trùng lặp logic, dễ để 2 bản lệch nhau khi sửa 1 chỗ quên chỗ kia).
 */
function computeSyncScope(
  localFiles: FileMeta[],
  remoteEntries: RemoteFileEntry[],
  state: SyncState,
  stateFilePath: string,
  cursorFilePath: string,
) {
  // `space.listFiles()` returns the Fallthrough-merged listing (real Space
  // files + the server's read-only baked-in Library/Repositories content,
  // perm: "ro") -- not just this Space's own content. Those paths aren't
  // ours to sync: excluded entirely (not just from localMap) so they're
  // never uploaded, downloaded, reported as a conflict, or hit the
  // server's write-guard for fallback-only paths. Same `perm` check
  // already used by plugs/configuration-manager/libraries.ts's roguePlugs
  // filter; `isBakedIn()` above is the additional path-prefix layer.
  const excluded = new Set(
    localFiles.filter((f) => f.perm === "ro" || isBakedIn(f.name)).map((f) => f.name),
  );
  const localMap = new Map(
    localFiles
      .filter(
        (f) =>
          f.name !== stateFilePath &&
          f.name !== cursorFilePath &&
          !excluded.has(f.name) &&
          !isBakedIn(f.name),
      )
      .map((f) => [f.name, f]),
  );
  const remoteMap = new Map<string, RemoteFileEntry>();
  for (const e of remoteEntries) {
    if (!e.deleted) remoteMap.set(e.path, e);
  }
  // Đường dẫn từng có mặt (local, remote hiện tại, hoặc trong state cũ).
  const allPaths = new Set<string>(
    [...localMap.keys(), ...remoteMap.keys(), ...Object.keys(state)].filter(
      (p) => !excluded.has(p) && !isBakedIn(p),
    ),
  );
  return { excluded, localMap, remoteMap, allPaths };
}

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

/**
 * File riêng cho cursor + bản sao (snapshot) danh sách remote (Giai đoạn 2.1,
 * 2026-09-13) -- CỐ Ý tách khỏi `stateFilePathFor` (sync-state.json): cursor
 * là dữ liệu CỦA RIÊNG bước liệt kê remote (không liên quan gì tới
 * localMtime/remoteRev từng path), gộp chung vào state sẽ buộc phải đổi
 * format file đang chạy thật trên production của nhiều user -- rủi ro không
 * cần thiết. 1 file riêng, không ai từng đọc, an toàn thêm mới hoàn toàn.
 */
function cursorFilePathFor(provider: SyncProvider): string {
  if (provider.name === "Dropbox") return "_dropbox/sync-cursor.json";
  const slug = provider.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `_sync/${slug}-cursor.json`;
}

interface RemoteCacheEntry {
  rev: string;
  serverModified: string;
}

/** Bản sao (snapshot) toàn bộ remote hiện biết + cursor để lần sau chỉ hỏi
 * phần thay đổi (delta) thay vì liệt kê lại từ đầu. */
interface RemoteCache {
  cursor?: string;
  entries: Record<string, RemoteCacheEntry>;
}

async function loadRemoteCache(spaceOps: SpaceOps, cursorFilePath: string): Promise<RemoteCache> {
  try {
    const data = await spaceOps.readFile(cursorFilePath);
    const parsed = JSON.parse(new TextDecoder().decode(data));
    if (parsed && typeof parsed === "object" && parsed.entries) return parsed as RemoteCache;
    return { entries: {} };
  } catch {
    return { entries: {} };
  }
}

async function saveRemoteCache(
  spaceOps: SpaceOps,
  cursorFilePath: string,
  cache: RemoteCache,
): Promise<void> {
  await spaceOps.writeFile(cursorFilePath, new TextEncoder().encode(JSON.stringify(cache)));
}

/**
 * Lấy danh sách remote ĐẦY ĐỦ để đưa vào `computeSyncScope`, nhưng chỉ thực
 * sự hỏi provider phần THAY ĐỔI (delta) kể từ cursor lần trước nếu provider
 * hỗ trợ (Dropbox) -- provider không hỗ trợ (WebDAV) luôn trả `full: true,
 * cursor: undefined`, hàm này khi đó chỉ đơn giản dùng thẳng kết quả, không
 * cache gì thêm (không có cursor để tái sử dụng ở lần sau).
 *
 * QUAN TRỌNG: khi `result.full === false` (chỉ nhận delta), các path KHÔNG có
 * trong `result.entries` không có nghĩa "đã biến mất trên remote" -- nghĩa là
 * "không đổi kể từ cursor trước", nên phải MERGE delta vào bản cache cũ (add
 * đè, xoá nếu deleted) để tái tạo đúng trạng thái remote đầy đủ, chứ không
 * được coi thẳng `result.entries` là toàn bộ remote (sẽ khiến mọi file không
 * đổi bị hiểu nhầm là "đã bị xoá trên remote" -- lỗi mất dữ liệu nghiêm trọng).
 */
async function resolveRemoteEntries(
  provider: SyncProvider,
  folder: string,
  spaceOps: SpaceOps,
  cursorFilePath: string,
): Promise<RemoteFileEntry[]> {
  const cache = await loadRemoteCache(spaceOps, cursorFilePath);
  const result = await provider.listEntries(folder, cache.cursor);

  const merged: Record<string, RemoteCacheEntry> = result.full ? {} : { ...cache.entries };
  for (const e of result.entries) {
    if (e.deleted) {
      delete merged[e.path];
    } else {
      merged[e.path] = { rev: e.rev, serverModified: e.serverModified };
    }
  }

  if (result.cursor !== undefined) {
    await saveRemoteCache(spaceOps, cursorFilePath, { cursor: result.cursor, entries: merged });
  }

  return Object.entries(merged).map(([path, v]) => ({
    path,
    rev: v.rev,
    serverModified: v.serverModified,
    deleted: false,
  }));
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

export interface SyncDiagnosis {
  path: string;
  localMtime: number;
  priorLocalMtime?: number;
  remoteRev: string;
  priorRemoteRev?: string;
}

/**
 * Dry-run chẩn đoán: liệt kê mọi path mà `performSync` SẼ coi là "xung đột
 * thật" (cả hai bên đổi so với lần đồng bộ trước) NẾU chạy ngay bây giờ —
 * nhưng KHÔNG ghi bất cứ gì (không tạo file `.conflict-*`, không upload,
 * không download, không lưu state). Dùng để điều tra một vòng lặp xung đột
 * đang diễn ra trên production mà không làm nó tệ thêm — xem
 * docs/plans (sự cố CONFIG.md/index.md liên tục xung đột, 2026-09-12).
 */
export async function diagnoseSync(
  provider: SyncProvider,
  folder: string,
  spaceOps: SpaceOps,
): Promise<SyncDiagnosis[]> {
  const stateFilePath = stateFilePathFor(provider);
  const cursorFilePath = cursorFilePathFor(provider);
  const state = await loadState(spaceOps, stateFilePath);

  // Dry-run: luôn liệt kê ĐẦY ĐỦ (không truyền cursor), không đọc/ghi
  // RemoteCache -- giữ đúng cam kết "KHÔNG ghi bất cứ gì" của hàm này, và
  // tránh làm lệch cursor đã lưu cho lần `performSync` thật kế tiếp.
  const [localFiles, { entries: remoteEntries }] = await Promise.all([
    spaceOps.listFiles(),
    provider.listEntries(folder),
  ]);

  const { localMap, remoteMap, allPaths } = computeSyncScope(
    localFiles,
    remoteEntries,
    state,
    stateFilePath,
    cursorFilePath,
  );

  const out: SyncDiagnosis[] = [];
  for (const path of allPaths) {
    const local = localMap.get(path);
    const remote = remoteMap.get(path);
    const prior = state[path];
    const localChanged = !prior ? Boolean(local) : local?.lastModified !== prior.localMtime;
    const remoteChanged = !prior ? Boolean(remote) : remote?.rev !== prior.remoteRev;
    if (local && remote && prior && localChanged && remoteChanged) {
      out.push({
        path,
        localMtime: local.lastModified,
        priorLocalMtime: prior.localMtime,
        remoteRev: remote.rev,
        priorRemoteRev: prior.remoteRev,
      });
    }
  }
  return out;
}

export interface PerformSyncOptions {
  /** Số path xử lý xong tối đa trước khi bắt buộc checkpoint (mặc định 20). */
  checkpointBatchSize?: number;
  /** Thời gian tối đa (ms) giữa 2 lần checkpoint (mặc định 2000). */
  checkpointIntervalMs?: number;
}

const DEFAULT_CHECKPOINT_BATCH_SIZE = 20;
const DEFAULT_CHECKPOINT_INTERVAL_MS = 2_000;

export async function performSync(
  provider: SyncProvider,
  folder: string,
  spaceOps: SpaceOps,
  opts: PerformSyncOptions = {},
): Promise<SyncReport> {
  const checkpointBatchSize = opts.checkpointBatchSize ?? DEFAULT_CHECKPOINT_BATCH_SIZE;
  const checkpointIntervalMs = opts.checkpointIntervalMs ?? DEFAULT_CHECKPOINT_INTERVAL_MS;
  const stateFilePath = stateFilePathFor(provider);
  const cursorFilePath = cursorFilePathFor(provider);
  const state = await loadState(spaceOps, stateFilePath);

  const [localFiles, remoteEntries] = await Promise.all([
    spaceOps.listFiles(),
    resolveRemoteEntries(provider, folder, spaceOps, cursorFilePath),
  ]);

  const { excluded, localMap, remoteMap, allPaths } = computeSyncScope(
    localFiles,
    remoteEntries,
    state,
    stateFilePath,
    cursorFilePath,
  );

  const report: SyncReport = {
    uploaded: [],
    downloaded: [],
    deletedLocal: [],
    deletedRemote: [],
    conflicts: [],
    errors: [],
  };
  // Bắt đầu từ BẢN SAO của state cũ (không phải rỗng) rồi cập nhật/xoá từng
  // key ngay trong vòng lặp + lưu ngay sau mỗi path có thay đổi thật. Nếu bị
  // ngắt giữa chừng (mạng treo, tab đóng, container restart...), các path ĐÃ
  // xử lý xong trong lượt này không bị mất khỏi state — chỉ path CHƯA kịp xử
  // lý mới ảnh hưởng ở lần chạy kế (đúng như bình thường). Trước đây
  // `nextState` bắt đầu rỗng và chỉ được lưu 1 lần duy nhất ở cuối hàm — một
  // lượt bị ngắt giữa chừng (ví dụ do `nativeFetch` không có timeout treo vô
  // thời hạn — xem dropbox_sync.ts) làm mất sạch mọi tiến độ đã thực sự
  // thành công trên remote, khiến lần sau lặp lại đúng conflict cũ vô ích.
  const nextState: SyncState = { ...state };
  // Paths excluded from allPaths (perm: "ro" or under Library/Repositories)
  // never get touched by the loop below -- clean them out of the copied
  // state here, otherwise they'd persist forever instead of being dropped
  // like they were when nextState used to start empty. Checking `isBakedIn`
  // too (not just `excluded`, which only reflects this run's `localFiles`)
  // catches any stale state entry left over for a baked-in path that
  // doesn't currently show up in the listing at all.
  for (const p of Object.keys(nextState)) {
    if (excluded.has(p) || isBakedIn(p)) delete nextState[p];
  }

  // Checkpoint theo lô (Giai đoạn 1.1, 2026-09-13): giữ nguyên mục đích của
  // checkpoint-mỗi-path ở trên (không mất tiến độ nếu bị ngắt giữa chừng) NHƯNG
  // gộp thành 1 lần ghi mỗi `checkpointBatchSize` path HOẶC mỗi
  // `checkpointIntervalMs` (điều kiện nào tới trước) thay vì ghi toàn bộ
  // SyncState sau MỖI path — N file thay đổi trước đây = N lần serialize+ghi
  // toàn bộ state (O(n²) I/O+CPU), là nguyên nhân chính gây "chậm/treo khi
  // đồng bộ lần đầu/Space nhiều file" (xem docs/plans). Đánh đổi: nếu bị ngắt
  // giữa chừng, mất tối đa tiến độ của 1 lô (mặc định ~20 path) thay vì 0 -- vô
  // hại, vì dữ liệu thật không mất (đã nằm trên remote/local), chỉ khiến lần
  // sync kế xử lý lại đúng các path đó.
  let pendingSinceCheckpoint = 0;
  let lastCheckpointAt = Date.now();
  const checkpoint = async () => {
    pendingSinceCheckpoint++;
    if (
      pendingSinceCheckpoint >= checkpointBatchSize ||
      Date.now() - lastCheckpointAt >= checkpointIntervalMs
    ) {
      await saveState(spaceOps, stateFilePath, nextState);
      pendingSinceCheckpoint = 0;
      lastCheckpointAt = Date.now();
    }
  };

  for (const path of allPaths) {
    try {
      const local = localMap.get(path);
      const remote = remoteMap.get(path);
      const prior = state[path];

      const localChanged = !prior ? Boolean(local) : local?.lastModified !== prior.localMtime;
      const remoteChanged = !prior ? Boolean(remote) : remote?.rev !== prior.remoteRev;

      if (!local && !remote) {
        // Xoá + lưu NGAY (không chờ hết vòng lặp) — nếu bị ngắt ở path kế
        // tiếp, việc "đã quên" path này không bị mất.
        delete nextState[path];
        await checkpoint();
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
          delete nextState[path];
        } else {
          // Remote bị xoá NHƯNG local đã sửa từ đó -> ưu tiên không mất chỉnh sửa, tái tạo trên remote.
          const data = await spaceOps.readFile(path);
          const result = await provider.upload(folder, path, data, { tag: "add" });
          report.uploaded.push(path);
          nextState[path] = { localMtime: local.lastModified, remoteRev: result.rev };
        }
        await checkpoint();
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
          delete nextState[path];
        } else {
          // Local bị xoá NHƯNG remote đã sửa từ đó -> ưu tiên không mất chỉnh sửa, tải lại về local.
          const dl = await provider.download(folder, path);
          const meta = await spaceOps.writeFile(path, dl.data);
          report.downloaded.push(path);
          nextState[path] = { localMtime: meta.lastModified, remoteRev: dl.rev };
        }
        await checkpoint();
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
          await checkpoint();
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
          await checkpoint();
          continue;
        }
        if (remoteChanged) {
          const dl = await provider.download(folder, path);
          const meta = await spaceOps.writeFile(path, dl.data);
          report.downloaded.push(path);
          nextState[path] = { localMtime: meta.lastModified, remoteRev: dl.rev };
          await checkpoint();
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
