import { EXTERNAL_SOURCE_IDS, type ExternalSource } from "@pond/schema/sources";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import type { Binding } from "@/features/settings/components/engine";
import {
  hasSourceOverrides,
  type ImageDownloadValues,
  imageDownloadValues,
  type VideoDownloadValues,
  videoDownloadValues,
} from "@/features/settings/lib/download-sources";
import {
  DEFAULT_IMAGE_DOWNLOAD,
  DEFAULT_VIDEO_DOWNLOAD,
  type DownloadSettings,
  type ImageDownloadPrefs,
  type VideoDownloadPrefs,
} from "@/features/settings/lib/section-types";
import { notify } from "@/shared/lib/toast";

const VideoDownloadSchema = z.object({
  autoDownload: z.boolean(),
  maxHeight: z.number().nullable(),
  maxFps: z.number().nullable(),
  videoCodec: z.enum(["h264", "hevc", "av1", "vp9", "any"]),
  audioCodec: z.enum(["aac", "opus", "any"]),
  container: z.enum(["auto", "mp4", "mkv", "webm", "mov"]),
  maxFileSizeMb: z.number().nullable(),
  subtitles: z.enum(["off", "download", "embed"]),
  subtitleLang: z.string(),
  embedMetadata: z.boolean(),
  embedThumbnail: z.boolean(),
  embedChapters: z.boolean(),
  sponsorblockRemove: z.boolean(),
}) satisfies z.ZodType<VideoDownloadPrefs>;

const ImageDownloadSchema = z.object({
  maxLongEdge: z.number().nullable(),
  format: z.enum(["original", "jpeg", "png", "webp", "avif"]),
  quality: z.number(),
  lossless: z.boolean(),
  progressive: z.boolean(),
  preserveMetadata: z.boolean(),
  maxFileSizeMb: z.number().nullable(),
  splitPosts: z.boolean(),
}) satisfies z.ZodType<ImageDownloadPrefs>;

const SourceSchema = z.enum(EXTERNAL_SOURCE_IDS);

const DownloadSettingsSchema = z.object({
  videoDownload: VideoDownloadSchema.partial().catch({}),
  imageDownload: ImageDownloadSchema.partial().catch({}),
  videoDownloadSources: z
    .partialRecord(SourceSchema, VideoDownloadSchema.partial())
    .catch({}),
  imageDownloadSources: z
    .partialRecord(SourceSchema, ImageDownloadSchema.partial())
    .catch({}),
});

const SavedDownloadsSchema = z.discriminatedUnion("ok", [
  DownloadSettingsSchema.extend({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false) }),
]);

const DOWNLOADS_KEY = ["settings", "downloads"] as const;

function readDownloads(
  row: z.infer<typeof DownloadSettingsSchema>,
): DownloadSettings {
  return {
    videoDownload: { ...DEFAULT_VIDEO_DOWNLOAD, ...row.videoDownload },
    imageDownload: { ...DEFAULT_IMAGE_DOWNLOAD, ...row.imageDownload },
    videoDownloadSources: row.videoDownloadSources,
    imageDownloadSources: row.imageDownloadSources,
  };
}

const EMPTY_DOWNLOADS: DownloadSettings = {
  videoDownload: DEFAULT_VIDEO_DOWNLOAD,
  imageDownload: DEFAULT_IMAGE_DOWNLOAD,
  videoDownloadSources: {},
  imageDownloadSources: {},
};

export function useDownloadSettings() {
  return useQuery<DownloadSettings>({
    queryKey: DOWNLOADS_KEY,
    queryFn: async () =>
      readDownloads(
        DownloadSettingsSchema.parse(
          await window.pond.query("settings.get", {}),
        ),
      ),
  });
}

let downloadSaveQueue = Promise.resolve();

function useSaveDownloads() {
  const qc = useQueryClient();
  return (run: () => Promise<object>) => {
    const operation = downloadSaveQueue.then(async () => {
      const saved = SavedDownloadsSchema.parse(await run());
      if (!saved.ok) throw new Error("Download settings were not saved");
      qc.setQueryData<DownloadSettings>(DOWNLOADS_KEY, readDownloads(saved));
    });
    downloadSaveQueue = operation.catch(() => {
      notify({
        id: "download-prefs-error",
        title: "Couldn't save download settings",
        description: "Your previous setting is unchanged. Try again.",
        timeout: 8000,
      });
    });
  };
}

export function useVideoDownloadBinding(
  source?: ExternalSource,
): Binding<VideoDownloadValues> {
  const { data } = useDownloadSettings();
  const save = useSaveDownloads();
  return {
    values: videoDownloadValues(data ?? EMPTY_DOWNLOADS, source),
    loaded: Boolean(data),
    patch: ({ followsGlobal: _locked, ...delta }) => {
      if (!data) return;
      save(() =>
        window.pond.query("settings.setVideoDownload", { ...delta, source }),
      );
    },
  };
}

export function useImageDownloadBinding(
  source?: ExternalSource,
): Binding<ImageDownloadValues> {
  const { data } = useDownloadSettings();
  const save = useSaveDownloads();
  return {
    values: imageDownloadValues(data ?? EMPTY_DOWNLOADS, source),
    loaded: Boolean(data),
    patch: ({ followsGlobal: _locked, ...delta }) => {
      if (!data) return;
      save(() =>
        window.pond.query("settings.setImageDownload", { ...delta, source }),
      );
    },
  };
}

export function useSourceCustomBinding(
  source: ExternalSource,
): Binding<{ useGlobal: boolean }> {
  const { data } = useDownloadSettings();
  const save = useSaveDownloads();
  return {
    values: {
      useGlobal: !hasSourceOverrides(data ?? EMPTY_DOWNLOADS, source),
    },
    loaded: Boolean(data),
    patch: ({ useGlobal }) => {
      if (!data || useGlobal === undefined) return;
      save(() =>
        window.pond.query("settings.setSourceDownloadsCustom", {
          source,
          custom: !useGlobal,
        }),
      );
    },
  };
}
