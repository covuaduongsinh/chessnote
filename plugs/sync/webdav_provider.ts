// Adapter mỏng: bọc các hàm client API thuần trong `webdav_sync.ts` (KHÔNG
// sửa logic bên trong) để khớp interface `SyncProvider` tổng quát mà
// `sync_engine.ts` dùng chung cho mọi remote storage.
import {
  type WebDavAuth,
  WebDavConflictError,
  deleteFile as webdavDeleteFile,
  downloadFile as webdavDownloadFile,
  listEntriesRecursive,
  uploadFile as webdavUploadFile,
} from "./webdav_sync.ts";
import { RemoteConflictError, type SyncProvider, type WriteMode } from "./sync_provider.ts";

export class WebDavSyncProvider implements SyncProvider {
  readonly name = "WebDAV";

  constructor(private auth: WebDavAuth) {}

  async listEntries(folder: string) {
    return await listEntriesRecursive(this.auth, folder);
  }

  async download(folder: string, path: string) {
    return await webdavDownloadFile(this.auth, folder, path);
  }

  async upload(folder: string, path: string, data: Uint8Array, mode: WriteMode) {
    try {
      return await webdavUploadFile(this.auth, folder, path, data, mode);
    } catch (e) {
      if (e instanceof WebDavConflictError) {
        throw new RemoteConflictError(e.path);
      }
      throw e;
    }
  }

  async delete(folder: string, path: string) {
    await webdavDeleteFile(this.auth, folder, path);
  }
}
