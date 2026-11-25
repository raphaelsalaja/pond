import type { ExternalSource } from "@pond/schema/sources";
import type {
  DownloadSettings,
  ImageDownloadPrefs,
  VideoDownloadPrefs,
} from "@/features/settings/lib/section-types";

/** A type alias, not an interface, so it stays assignable to `SettingsValues`. */
type SourceLock = {
  followsGlobal: boolean;
};

export type VideoDownloadValues = VideoDownloadPrefs & SourceLock;
export type ImageDownloadValues = ImageDownloadPrefs & SourceLock;

export function sourceSectionId(source: ExternalSource): string {
  return `sources-${source}`;
}

export function hasSourceOverrides(
  settings: DownloadSettings,
  source: ExternalSource,
): boolean {
  return (
    settings.videoDownloadSources[source] !== undefined ||
    settings.imageDownloadSources[source] !== undefined
  );
}

function followsGlobal(
  settings: DownloadSettings,
  source: ExternalSource | undefined,
): boolean {
  return source !== undefined && !hasSourceOverrides(settings, source);
}

export function videoDownloadValues(
  settings: DownloadSettings,
  source?: ExternalSource,
): VideoDownloadValues {
  const override = source ? settings.videoDownloadSources[source] : undefined;
  return {
    ...settings.videoDownload,
    ...override,
    followsGlobal: followsGlobal(settings, source),
  };
}

export function imageDownloadValues(
  settings: DownloadSettings,
  source?: ExternalSource,
): ImageDownloadValues {
  const override = source ? settings.imageDownloadSources[source] : undefined;
  return {
    ...settings.imageDownload,
    ...override,
    followsGlobal: followsGlobal(settings, source),
  };
}

export function missingVideosDescription(count: number): string {
  if (count === 0) return "All video saves have a video file.";
  if (count === 1) return "1 video save doesn't have a video file.";
  return `${count} video saves don't have a video file.`;
}

export function queuedVideosTitle(queued: number): string {
  if (queued === 0) return "No videos to download";
  if (queued === 1) return "Downloading 1 video";
  return `Downloading ${queued} videos`;
}
