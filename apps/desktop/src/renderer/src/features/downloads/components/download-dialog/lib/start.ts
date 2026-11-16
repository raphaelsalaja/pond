import type { DownloadRequest } from "@shared/downloader-contracts";
import { getAppRouter } from "@/shared/lib/app-router";
import {
  type NotifyOptions,
  notify,
  TOAST_TIMEOUT_MS,
  updateNotification,
} from "@/shared/lib/toast";
import type { ExportDestination } from "../export-options/settings";

const EXPORT_FAILED = "Pond couldn't download these files. Try again.";

interface StartInput {
  /** Links yt-dlp downloads with `request`. */
  media: string[];
  /** Posts and pages Pond's importer saves as they are. */
  posts: string[];
  /** Links straight to a file, saved as a new save. */
  files: string[];
  request: DownloadRequest;
  label: string | null;
}

async function savePost(url: string): Promise<boolean> {
  try {
    const result = await window.pond.query("saves.quickAdd", { url });
    return result.ok;
  } catch {
    return false;
  }
}

async function saveFile(url: string): Promise<boolean> {
  try {
    const result = await window.pond.query("downloader.exportFiles", {
      url,
      title: null,
      files: [url],
      destination: "library",
    });
    return result.ok;
  } catch {
    return false;
  }
}

async function startMedia(
  urls: string[],
  request: DownloadRequest,
): Promise<{ started: number; failed: number }> {
  if (urls.length === 0) return { started: 0, failed: 0 };
  try {
    const { ids, failed } = await window.pond.query("downloader.start", {
      urls,
      request,
    });
    return { started: ids.length, failed: failed.length };
  } catch {
    return { started: 0, failed: urls.length };
  }
}

/** Starts every link and reports them in one toast. */
export async function startLinks({
  media,
  posts,
  files,
  request,
  label,
}: StartInput) {
  const [mediaResult, saved] = await Promise.all([
    startMedia(media, request),
    Promise.all([...posts.map(savePost), ...files.map(saveFile)]),
  ]);
  const started = mediaResult.started + saved.filter(Boolean).length;
  const failed = mediaResult.failed + saved.filter((ok) => !ok).length;
  if (started === 0) {
    notify({
      id: "download-start",
      title: "Download didn't start",
      description: "Pond couldn't add this link. Try again.",
    });
    return;
  }
  notify({
    id: "download-start",
    title: started === 1 ? "Downloading" : `Downloading ${started} links`,
    ...(failed
      ? {
          description: `${failed} ${failed === 1 ? "link" : "links"} couldn't start.`,
        }
      : label
        ? { description: label }
        : {}),
    action: {
      label: "Show Downloads",
      onClick: () => getAppRouter()?.history.push("/downloads"),
    },
  });
}

function nameOf(path: string): string {
  return path.split("/").at(-1) ?? path;
}

interface ExportFilesInput {
  /** The page the files came from. */
  url: string;
  title: string | null;
  files: string[];
  destination: ExportDestination;
  label: string;
}

/** Downloads files to a save, a folder or the clipboard, with progress in one toast. */
export async function exportFiles({
  url,
  title,
  files,
  destination,
  label,
}: ExportFilesInput) {
  const id = notify({
    id: "download-export",
    title: "Downloading",
    description: label,
    timeout: 0,
  });
  const result = await window.pond
    .query("downloader.exportFiles", { url, title, files, destination })
    .catch(() => ({ ok: false as const, message: EXPORT_FAILED }));
  if (!result.ok) {
    updateNotification({
      id,
      title: "Download didn't finish",
      description: result.message,
      timeout: TOAST_TIMEOUT_MS,
    });
    return;
  }
  const [first] = result.paths;
  const done: NotifyOptions = {
    id,
    title:
      destination === "clipboard"
        ? "Copied to Clipboard"
        : destination === "library"
          ? "Added to Library"
          : "Downloaded",
    description:
      result.paths.length > 1
        ? `${result.paths.length} files`
        : first
          ? nameOf(first)
          : label,
    timeout: TOAST_TIMEOUT_MS,
  };
  if (destination === "file" && first)
    done.action = {
      label: "Show in Finder",
      onClick: () =>
        void window.pond.query("downloader.reveal", { path: first }),
    };
  updateNotification(done);
}
