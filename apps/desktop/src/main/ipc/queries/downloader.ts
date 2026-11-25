import { join } from "node:path";
import { app, BrowserWindow, clipboard, dialog, shell } from "electron";
import log from "electron-log/main.js";
import { z } from "zod";
import {
  DownloadExportFilesInputSchema,
  DownloadExportInputSchema,
  DownloadFramesInputSchema,
  DownloadProbeInputSchema,
  DownloadRevealInputSchema,
  DownloadStartInputSchema,
  extractLinks,
} from "../../../shared/downloader-contracts";
import type { createDownloadExports } from "../../core/download-export";
import { writeFileRefsToClipboard } from "../../lib/clipboard-files";
import { query } from "./params";

/** Startup never needs the downloader, so its modules load on first use to keep the main graph small. */
const loadDownloader = () => import("../../core/downloader");

let exportsLoad: Promise<ReturnType<typeof createDownloadExports>> | null =
  null;

function loadExports(): Promise<ReturnType<typeof createDownloadExports>> {
  exportsLoad ??= Promise.all([
    import("../../core/download-export"),
    import("../../core/refresh/download-transcode"),
    import("../../core/refresh/yt-dlp"),
    import("../../core/refresh/yt-dlp-captions"),
    import("../../core/download-file"),
    import("../../core/manual-import"),
  ]).then(
    ([{ createDownloadExports }, transcode, ytdlp, captions, files, manual]) =>
      createDownloadExports({
        downloadVideo: ytdlp.downloadVideo,
        downloadCaptions: captions.downloadCaptions,
        transcodeItems: transcode.transcodeItems,
        defaultFolder: () => app.getPath("downloads"),
        clipboardFolder: () => join(app.getPath("temp"), "pond-clipboard"),
        writeClipboardText: (text) => {
          void clipboard
            .writeText(text)
            .catch((cause: unknown) =>
              log.warn("[pond downloader] clipboard write failed", cause),
            );
        },
        writeClipboardFiles: writeFileRefsToClipboard,
        fetchFile: files.fetchFile,
        saveFiles: ({ url, title, files: fetched, sourceUrls }) =>
          manual.createManualSave({
            url,
            title,
            memoryFiles: fetched,
            fileSourceUrls: sourceUrls,
          }),
      }),
  );
  return exportsLoad;
}

export const downloaderQueries = {
  "downloader.clipboardLinks": query(z.object({}), async () => ({
    urls: extractLinks(await clipboard.readText()),
  })),
  "downloader.probe": query(DownloadProbeInputSchema, async ({ url }) =>
    (await loadDownloader()).probeDownload(url),
  ),
  "downloader.frames": query(
    DownloadFramesInputSchema,
    async ({ url, count }) => ({
      frames: await (await loadDownloader()).sampleDownloadFrames(url, count),
    }),
  ),
  "downloader.start": query(
    DownloadStartInputSchema,
    async ({ urls, request }) =>
      (await loadDownloader()).startDownloads(urls, request),
  ),
  "downloader.export": query(DownloadExportInputSchema, async (input) =>
    (await loadExports()).run(input),
  ),
  "downloader.exportFiles": query(
    DownloadExportFilesInputSchema,
    async (input) => (await loadExports()).files(input),
  ),
  "downloader.exportFolder": query(z.object({}), async () =>
    (await loadExports()).folder(),
  ),
  "downloader.pickExportFolder": query(z.object({}), async () => {
    const downloads = await loadExports();
    const options: Electron.OpenDialogOptions = {
      title: "Export Folder",
      defaultPath: downloads.folder().path,
      properties: ["openDirectory", "createDirectory"],
    };
    const win = BrowserWindow.getFocusedWindow();
    const picked = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    const path = picked.filePaths[0];
    return picked.canceled || !path ? null : downloads.choose(path);
  }),
  "downloader.reveal": query(DownloadRevealInputSchema, async ({ path }) => {
    if (!(await loadExports()).owns(path)) return { ok: false };
    shell.showItemInFolder(path);
    return { ok: true };
  }),
};
