import { mkdir } from "node:fs/promises";
import { basename, extname } from "node:path";
import type {
  DownloadExportDestination,
  DownloadExportFolder,
  DownloadExportResult,
  DownloadRequest,
} from "@shared/downloader-contracts";
import log from "electron-log/main.js";
import { copyExportFile, writeExportFile } from "./export-files";
import { normalizeUrl } from "./pipeline/enqueue-input";
import { classifyUrlToSource } from "./pipeline/extractors";
import {
  cuesToSubtitles,
  cuesToTranscript,
  parseCaptions,
} from "./refresh/captions-transcript";
import type { transcodeItems } from "./refresh/download-transcode";
import type { downloadVideo } from "./refresh/yt-dlp";
import type { downloadCaptions } from "./refresh/yt-dlp-captions";

export interface DownloadExportRuntime {
  downloadVideo: typeof downloadVideo;
  downloadCaptions: typeof downloadCaptions;
  transcodeItems: typeof transcodeItems;
  /** Where File exports land until someone picks another folder. */
  defaultFolder: () => string;
  /** Clipboard files need a home that outlives the export. */
  clipboardFolder: () => string;
  writeClipboardText: (text: string) => void;
  writeClipboardFiles: (paths: string[]) => Promise<void>;
}

const FAILED = "Pond couldn't download this link. Try again.";
const NO_CAPTIONS = "This link has no captions in that language.";
const MAX_STEM = 120;

function stemOf(title: string | null | undefined): string {
  return title?.trim().slice(0, MAX_STEM) || "Download";
}

function folderOf(path: string): DownloadExportFolder {
  return { path, name: basename(path) || path };
}

export function createDownloadExports(runtime: DownloadExportRuntime) {
  let chosen: string | null = null;
  const exported = new Set<string>();

  const destinationFolder = async (
    destination: DownloadExportDestination,
  ): Promise<string> => {
    const folder =
      destination === "file"
        ? (chosen ?? runtime.defaultFolder())
        : runtime.clipboardFolder();
    await mkdir(folder, { recursive: true });
    return folder;
  };

  const finish = async (
    destination: DownloadExportDestination,
    path: string,
  ): Promise<DownloadExportResult> => {
    exported.add(path);
    if (destination === "clipboard") await runtime.writeClipboardFiles([path]);
    return { ok: true, destination, path };
  };

  const exportTranscript = async (
    url: string,
    source: ReturnType<typeof classifyUrlToSource>["source"],
    request: DownloadRequest,
    destination: DownloadExportDestination,
  ): Promise<DownloadExportResult> => {
    const captions = await runtime.downloadCaptions({
      url,
      source,
      lang: request.subtitleLang,
    });
    if (!captions) return { ok: false, message: NO_CAPTIONS };
    try {
      const cues = parseCaptions(captions.text);
      const format = request.transcriptFormat;
      const text =
        format === "txt"
          ? cuesToTranscript(cues, request.range)
          : cuesToSubtitles(cues, format, request.range);
      if (!text.trim()) return { ok: false, message: NO_CAPTIONS };
      if (destination === "clipboard") {
        runtime.writeClipboardText(text);
        return { ok: true, destination, path: null };
      }
      const path = await writeExportFile(
        await destinationFolder(destination),
        `${stemOf(captions.infoJson?.title)}.${format}`,
        format === "txt" ? `${text}\n` : text,
      );
      return finish(destination, path);
    } finally {
      await captions.cleanup();
    }
  };

  return {
    folder(): DownloadExportFolder {
      return folderOf(chosen ?? runtime.defaultFolder());
    },

    choose(path: string): DownloadExportFolder {
      chosen = path;
      return folderOf(path);
    },

    /** Reveal only what this session exported, never an arbitrary path from the renderer. */
    owns(path: string): boolean {
      return exported.has(path);
    },

    async run(input: {
      url: string;
      request: DownloadRequest;
      destination: DownloadExportDestination;
    }): Promise<DownloadExportResult> {
      const { request, destination } = input;
      try {
        const url = normalizeUrl(input.url);
        const { source } = classifyUrlToSource(url);
        if (request.mode === "transcript") {
          return await exportTranscript(url, source, request, destination);
        }
        const download = await runtime.downloadVideo({
          url,
          source,
          allowPlaylist: false,
          expectedCount: 1,
          request,
        });
        const first = download?.items[0];
        if (!download || !first) return { ok: false, message: FAILED };
        let converted: Awaited<ReturnType<typeof transcodeItems>> | null = null;
        try {
          converted = await runtime.transcodeItems({ items: [first], request });
          const item = converted.items[0] ?? first;
          const path = await copyExportFile(
            item.path,
            await destinationFolder(destination),
            `${stemOf(item.infoJson?.title)}${extname(item.path)}`,
          );
          return await finish(destination, path);
        } finally {
          await converted?.cleanup();
          await download.cleanup();
        }
      } catch (error) {
        log.warn("[pond downloader] export failed", input.url, error);
        return { ok: false, message: FAILED };
      }
    },
  };
}
