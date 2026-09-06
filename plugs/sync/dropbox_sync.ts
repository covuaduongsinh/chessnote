/**
 * Dropbox Sync Provider for ChessNote (MIT License)
 * Handles bidirectional file synchronization using Dropbox API v2 with OAuth2 PKCE
 */

export interface DropboxConfig {
  accessToken?: string;
  refreshToken?: string;
  clientId: string;
  syncFolder: string; // e.g. "/ChessNote"
}

export interface DropboxFileEntry {
  path: string;
  rev: string;
  serverModified: string;
  size: number;
}

/**
 * Uploads a file (Markdown or PGN) to Dropbox
 */
export async function uploadFileToDropbox(
  config: DropboxConfig,
  path: string,
  content: string | Uint8Array,
): Promise<boolean> {
  if (!config.accessToken) {
    console.warn("Dropbox sync: No access token provided");
    return false;
  }

  const dropboxPath = `${config.syncFolder}/${path.replace(/^\/+/, "")}`;
  const uploadUrl = "https://content.dropboxapi.com/2/files/upload";

  try {
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Dropbox-API-Arg": JSON.stringify({
          path: dropboxPath,
          mode: "overwrite",
          autorename: false,
          mute: true,
          strict_conflict: false,
        }),
        "Content-Type": "application/octet-stream",
      },
      body: content as any,
    });

    return response.ok;
  } catch (err) {
    console.error("Error uploading to Dropbox:", err);
    return false;
  }
}

/**
 * Downloads a file from Dropbox
 */
export async function downloadFileFromDropbox(
  config: DropboxConfig,
  path: string,
): Promise<string | null> {
  if (!config.accessToken) return null;

  const dropboxPath = `${config.syncFolder}/${path.replace(/^\/+/, "")}`;
  const downloadUrl = "https://content.dropboxapi.com/2/files/download";

  try {
    const response = await fetch(downloadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Dropbox-API-Arg": JSON.stringify({ path: dropboxPath }),
      },
    });

    if (!response.ok) return null;
    return await response.text();
  } catch (err) {
    console.error("Error downloading from Dropbox:", err);
    return null;
  }
}

/**
 * Lists all files in the Dropbox sync folder
 */
export async function listDropboxFiles(
  config: DropboxConfig,
): Promise<DropboxFileEntry[]> {
  if (!config.accessToken) return [];

  const listUrl = "https://api.dropboxapi.com/2/files/list_folder";
  try {
    const response = await fetch(listUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        path: config.syncFolder,
        recursive: true,
        include_media_info: false,
        include_deleted: false,
      }),
    });

    if (!response.ok) return [];
    const data = await response.json();
    return (data.entries || [])
      .filter((e: any) => e[".tag"] === "file")
      .map((e: any) => ({
        path: e.path_display.replace(new RegExp(`^${config.syncFolder}/`), ""),
        rev: e.rev,
        serverModified: e.server_modified,
        size: e.size,
      }));
  } catch (err) {
    console.error("Error listing Dropbox folder:", err);
    return [];
  }
}
