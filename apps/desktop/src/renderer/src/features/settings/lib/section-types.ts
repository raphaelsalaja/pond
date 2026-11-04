import type { SourceOverrides } from "@pond/schema/db";

type VideoCodec = "h264" | "hevc" | "av1" | "vp9" | "any";
type AudioCodec = "aac" | "opus" | "any";
type VideoContainer = "auto" | "mp4" | "mkv" | "webm" | "mov";
type SubtitleMode = "off" | "download" | "embed";

export type VideoDownloadPrefs = {
  autoDownload: boolean;
  maxHeight: number | null;
  maxFps: number | null;
  videoCodec: VideoCodec;
  audioCodec: AudioCodec;
  container: VideoContainer;
  maxFileSizeMb: number | null;
  subtitles: SubtitleMode;
  subtitleLang: string;
  embedMetadata: boolean;
  embedThumbnail: boolean;
  embedChapters: boolean;
  sponsorblockRemove: boolean;
};

export const DEFAULT_VIDEO_DOWNLOAD: VideoDownloadPrefs = {
  autoDownload: false,
  maxHeight: 1080,
  maxFps: null,
  videoCodec: "h264",
  audioCodec: "aac",
  container: "auto",
  maxFileSizeMb: 500,
  subtitles: "off",
  subtitleLang: "en",
  embedMetadata: true,
  embedThumbnail: false,
  embedChapters: false,
  sponsorblockRemove: false,
};

type ImageFormat = "original" | "jpeg" | "png" | "webp" | "avif";

export type ImageDownloadPrefs = {
  maxLongEdge: number | null;
  format: ImageFormat;
  quality: number;
  lossless: boolean;
  progressive: boolean;
  preserveMetadata: boolean;
  maxFileSizeMb: number | null;
  splitPosts: boolean;
};

export const DEFAULT_IMAGE_DOWNLOAD: ImageDownloadPrefs = {
  maxLongEdge: 2048,
  format: "original",
  quality: 80,
  lossless: false,
  progressive: false,
  preserveMetadata: false,
  maxFileSizeMb: 10,
  splitPosts: false,
};

export interface DownloadSettings {
  videoDownload: VideoDownloadPrefs;
  imageDownload: ImageDownloadPrefs;
  videoDownloadSources: SourceOverrides<VideoDownloadPrefs>;
  imageDownloadSources: SourceOverrides<ImageDownloadPrefs>;
}
