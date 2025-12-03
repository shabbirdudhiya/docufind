import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export interface UpdateInfo {
  available: boolean;
  version?: string;
  date?: string;
  body?: string;
}

export interface UpdateProgress {
  downloaded: number;
  total: number;
  percentage: number;
}

export async function checkForUpdates(): Promise<UpdateInfo> {
  try {
    const update = await check();

    if (update) {
      return {
        available: true,
        version: update.version,
        date: update.date,
        body: update.body,
      };
    }

    return { available: false };
  } catch (error) {
    console.error("Failed to check for updates:", error);
    return { available: false };
  }
}

export async function downloadAndInstallUpdate(
  onProgress?: (progress: UpdateProgress) => void
): Promise<boolean> {
  try {
    const update = await check();

    if (!update) {
      return false;
    }

    let downloaded = 0;
    let contentLength = 0;

    await update.downloadAndInstall((event) => {
      switch (event.event) {
        case "Started":
          contentLength = event.data.contentLength || 0;
          console.log(`Started downloading ${contentLength} bytes`);
          break;
        case "Progress":
          downloaded += event.data.chunkLength;
          const percentage =
            contentLength > 0
              ? Math.round((downloaded / contentLength) * 100)
              : 0;
          onProgress?.({
            downloaded,
            total: contentLength,
            percentage,
          });
          break;
        case "Finished":
          console.log("Download finished");
          break;
      }
    });

    console.log("Update installed, restarting...");
    await relaunch();
    return true;
  } catch (error) {
    console.error("Failed to download/install update:", error);
    return false;
  }
}
