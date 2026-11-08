import type { DownloadRequest } from "@shared/downloader-contracts";
import { getAppRouter } from "@/shared/lib/app-router";
import {
  type NotifyOptions,
  notify,
  TOAST_TIMEOUT_MS,
  updateNotification,
} from "@/shared/lib/toast";
import type { ExportDestination } from "../export-options/settings";

const START_FAILED = "Pond couldn't add this link. Try again.";
const EXPORT_FAILED = "Pond couldn't export this link. Try again.";

function nameOf(path: string): string {
  return path.split("/").at(-1) ?? path;
}

async function toLibrary(url: string, title: string, request: DownloadRequest) {
  try {
    const { ids } = await window.pond.query("downloader.start", {
      urls: [url],
      request,
    });
    if (ids.length === 0) throw new Error(START_FAILED);
    notify({
      id: "download-start",
      title: "Downloading",
      description: title,
      action: {
        label: "Show Downloads",
        onClick: () => getAppRouter()?.history.push("/downloads"),
      },
    });
  } catch {
    notify({
      id: "download-start",
      title: "Download didn't start",
      description: START_FAILED,
    });
  }
}

async function toDisk(
  url: string,
  title: string,
  request: DownloadRequest,
  destination: "file" | "clipboard",
) {
  const id = notify({
    id: "download-export",
    title: "Exporting",
    description: title,
    timeout: 0,
  });
  const result = await window.pond
    .query("downloader.export", { url, request, destination })
    .catch(() => ({ ok: false as const, message: EXPORT_FAILED }));
  if (!result.ok) {
    updateNotification({
      id,
      title: "Export didn't finish",
      description: result.message,
      timeout: TOAST_TIMEOUT_MS,
    });
    return;
  }
  const { path } = result;
  const done: NotifyOptions = {
    id,
    title: destination === "clipboard" ? "Copied to Clipboard" : "Exported",
    description: path ? nameOf(path) : title,
    timeout: TOAST_TIMEOUT_MS,
  };
  if (destination === "file" && path)
    done.action = {
      label: "Show in Finder",
      onClick: () => void window.pond.query("downloader.reveal", { path }),
    };
  updateNotification(done);
}

/** Library goes through the download queue; File and Clipboard export straight to disk. */
export function runExport(
  url: string,
  title: string,
  request: DownloadRequest,
  destination: ExportDestination,
): Promise<void> {
  return destination === "library"
    ? toLibrary(url, title, request)
    : toDisk(url, title, request, destination);
}
