// Adapter mỏng: bọc các hàm client API thuần trong `dropbox_sync.ts` (KHÔNG
// sửa logic bên trong) để khớp interface `SyncProvider` tổng quát mà
// `sync_engine.ts` dùng chung cho mọi remote storage.
import {
  type DropboxClientDeps,
  DropboxConflictError,
  deleteFile as dbxDeleteFile,
  downloadFile as dbxDownloadFile,
  listFolder,
  normalizeDropboxFolder,
  uploadFile as dbxUploadFile,
} from "./dropbox_sync.ts";
import { RemoteConflictError, type SyncProvider, type WriteMode } from "./sync_provider.ts";

export class DropboxSyncProvider implements SyncProvider {
  readonly name = "Dropbox";

  constructor(private deps: DropboxClientDeps) {}

  async listEntries(folder: string, priorCursor?: string) {
    return await listFolder(this.deps, folder, priorCursor);
  }

  async download(folder: string, path: string) {
    const { prefix } = normalizeDropboxFolder(folder);
    return await dbxDownloadFile(this.deps, `${prefix}${path}`);
  }

  async upload(folder: string, path: string, data: Uint8Array, mode: WriteMode) {
    const { prefix } = normalizeDropboxFolder(folder);
    try {
      return await dbxUploadFile(this.deps, `${prefix}${path}`, data, mode);
    } catch (e) {
      if (e instanceof DropboxConflictError) {
        throw new RemoteConflictError(e.path);
      }
      throw e;
    }
  }

  async delete(folder: string, path: string) {
    const { prefix } = normalizeDropboxFolder(folder);
    await dbxDeleteFile(this.deps, `${prefix}${path}`);
  }
}
