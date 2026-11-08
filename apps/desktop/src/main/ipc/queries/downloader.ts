import { join } from "node:path";
import { app, BrowserWindow, clipboard, dialog, shell } from "electron";
import { z } from "zod";
import {
  DownloadExportInputSchema,
  DownloadFramesInputSchema,
  DownloadProbeInputSchema,
  DownloadRevealInputSchema,
  DownloadStartInputSchema,
  extractLinks,
} from "../../../shared/downloader-contracts";
import { createDownloadExports } from "../../core/download-export";
import {
  probeDownload,
  sampleDownloadFrames,
  startDownloads,
} from "../../core/downloader";
import { transcodeItems } from "../../core/refresh/download-transcode";
import { downloadVideo } from "../../core/refresh/yt-dlp";
import { downloadCaptions } from "../../core/refresh/yt-dlp-captions";
import { writeFileRefsToClipboard } from "../../lib/clipboard-files";
import { query } from "./params";

const downloadExports = createDownloadExports({
  downloadVideo,
  downloadCaptions,
  transcodeItems,
  defaultFolder: () => app.getPath("downloads"),
  clipboardFolder: () => join(app.getPath("temp"), "pond-clipboard"),
  writeClipboardText: (text) => clipboard.writeText(text),
  writeClipboardFiles: writeFileRefsToClipboard,
});

export const downloaderQueries = {
  "downloader.clipboardLinks": query(z.object({}), async () => ({
    urls: extractLinks(await clipboard.readText()),
  })),
  "downloader.probe": query(DownloadProbeInputSchema, ({ url }) =>
    probeDownload(url),
  ),
  "downloader.frames": query(
    DownloadFramesInputSchema,
    async ({ url, count }) => ({
      frames: await sampleDownloadFrames(url, count),
    }),
  ),
  "downloader.start": query(DownloadStartInputSchema, ({ urls, request }) =>
    startDownloads(urls, request),
  ),
  "downloader.export": query(DownloadExportInputSchema, (input) =>
    downloadExports.run(input),
  ),
  "downloader.exportFolder": query(z.object({}), () =>
    downloadExports.folder(),
  ),
  "downloader.pickExportFolder": query(z.object({}), async () => {
    const options: Electron.OpenDialogOptions = {
      title: "Export Folder",
      defaultPath: downloadExports.folder().path,
      properties: ["openDirectory", "createDirectory"],
    };
    const win = BrowserWindow.getFocusedWindow();
    const picked = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    const path = picked.filePaths[0];
    return picked.canceled || !path ? null : downloadExports.choose(path);
  }),
  "downloader.reveal": query(DownloadRevealInputSchema, ({ path }) => {
    if (!downloadExports.owns(path)) return { ok: false };
    shell.showItemInFolder(path);
    return { ok: true };
  }),
};
