import type { ExternalSource } from "@pond/schema/sources";
import type { SectionConfig } from "@/features/settings/components/engine";
import { MissingVideos } from "@/features/settings/components/sections/download-sources";
import { useVideoDownloadBinding } from "@/features/settings/components/sections/downloads";
import { group } from "@/features/settings/lib/engine-types";
import type {
  GroupConfig,
  SettingsValues,
} from "@/features/settings/lib/engine-types";

const subtitlesEnabled = (v: SettingsValues) => v.subtitles !== "off";
const followsGlobal = (v: SettingsValues) => v.followsGlobal === true;

export function videoDownloadGroups(
  source?: ExternalSource,
): Array<GroupConfig> {
  const useBinding = () => useVideoDownloadBinding(source);
  /** Source pages mix image and video groups, so their titles name the kind. */
  const title = (name: string) => (source ? `Video ${name}` : name);
  return [
    group.with(useBinding, {
      title: title("Downloads"),
      items: [
        {
          control: "switch",
          key: "autoDownload",
          disabled: followsGlobal,
          title: "Download Videos Automatically",
          description: "Off keeps the link and poster for later.",
        },
      ],
    }),
    {
      title: "Existing Saves",
      render: () => <MissingVideos source={source} />,
    },
    group.with(useBinding, {
      title: title("Quality"),
      items: [
        {
          control: "select",
          key: "maxHeight",
          disabled: followsGlobal,
          title: "Maximum Resolution",
          description: "1080p suits most clips.",
          tooltip: "Higher resolutions make bigger files.",
          options: [
            { value: 4320, label: "4320p (8K)" },
            { value: 2160, label: "2160p (4K)" },
            { value: 1440, label: "1440p" },
            { value: 1080, label: "1080p" },
            { value: 720, label: "720p" },
            { value: 480, label: "480p" },
            { value: 360, label: "360p" },
            { value: 240, label: "240p" },
            { value: 144, label: "144p" },
            { value: null, label: "Original" },
          ],
        },
        {
          control: "select",
          key: "maxFps",
          disabled: followsGlobal,
          title: "Maximum Frame Rate",
          description: "Download videos at or below this frame rate.",
          options: [
            { value: null, label: "Unlimited" },
            { value: 60, label: "60\u00A0fps" },
            { value: 30, label: "30\u00A0fps" },
            { value: 24, label: "24\u00A0fps" },
          ],
        },
        {
          control: "select",
          key: "maxFileSizeMb",
          disabled: followsGlobal,
          title: "Maximum File Size",
          description: "Skip downloads bigger than the cap.",
          options: [
            { value: 2, label: "2\u00A0MB" },
            { value: 5, label: "5\u00A0MB" },
            { value: 10, label: "10\u00A0MB" },
            { value: 25, label: "25\u00A0MB" },
            { value: 50, label: "50\u00A0MB" },
            { value: 100, label: "100 MB" },
            { value: 500, label: "500 MB" },
            { value: 1000, label: "1 GB" },
            { value: 5000, label: "5 GB" },
            { value: null, label: "Unlimited" },
          ],
        },
      ],
    }),
    group.with(useBinding, {
      title: title("Formats"),
      items: [
        {
          control: "select",
          key: "videoCodec",
          disabled: followsGlobal,
          title: "Preferred Video Codec",
          description: "H.264 plays on the most devices.",
          tooltip: "AV1 and VP9 make smaller files.",
          options: [
            { value: "h264", label: "H.264 (AVC)" },
            { value: "hevc", label: "H.265 (HEVC)" },
            { value: "av1", label: "AV1" },
            { value: "vp9", label: "VP9" },
            { value: "any", label: "Any / Best" },
          ],
        },
        {
          control: "select",
          key: "audioCodec",
          disabled: followsGlobal,
          title: "Preferred Audio Codec",
          description: "Falls back if unavailable.",
          options: [
            { value: "aac", label: "AAC" },
            { value: "opus", label: "Opus" },
            { value: "any", label: "Any / Best" },
          ],
        },
        {
          control: "select",
          key: "container",
          disabled: followsGlobal,
          title: "Container",
          description: "Auto works for most downloads.",
          options: [
            { value: "auto", label: "Auto" },
            { value: "mp4", label: "MP4" },
            { value: "mkv", label: "MKV" },
            { value: "webm", label: "WebM" },
            { value: "mov", label: "MOV" },
          ],
        },
      ],
    }),
    group.with(useBinding, {
      title: title("Subtitles"),
      items: [
        {
          control: "select",
          key: "subtitles",
          disabled: followsGlobal,
          title: "Subtitles",
          description: "A separate file, or included in the video.",
          options: [
            { value: "off", label: "Off" },
            { value: "download", label: "Separate File" },
            { value: "embed", label: "Embed in Video" },
          ],
        },
        {
          control: "select",
          key: "subtitleLang",
          disabled: followsGlobal,
          title: "Subtitle Language",
          description: "Language to fetch when available.",
          visible: subtitlesEnabled,
          options: [
            { value: "en", label: "English" },
            { value: "es", label: "Spanish" },
            { value: "fr", label: "French" },
            { value: "de", label: "German" },
            { value: "it", label: "Italian" },
            { value: "pt", label: "Portuguese" },
            { value: "ja", label: "Japanese" },
            { value: "ko", label: "Korean" },
            { value: "zh", label: "Chinese" },
            { value: "ru", label: "Russian" },
            { value: "ar", label: "Arabic" },
            { value: "hi", label: "Hindi" },
          ],
        },
      ],
    }),
    group.with(useBinding, {
      title: title("File Details"),
      items: [
        {
          control: "switch",
          key: "embedMetadata",
          disabled: followsGlobal,
          title: "Embed Details",
          description: "Write title, uploader, and date into the file.",
        },
        {
          control: "switch",
          key: "embedThumbnail",
          disabled: followsGlobal,
          title: "Embed Thumbnail",
          description: "Attach the poster image as cover art.",
        },
        {
          control: "switch",
          key: "embedChapters",
          disabled: followsGlobal,
          title: "Embed Chapters",
          description: "Include chapters when the source has them.",
        },
      ],
    }),
    group.with(useBinding, {
      title: title("Sponsor Block"),
      items: [
        {
          control: "switch",
          key: "sponsorblockRemove",
          disabled: followsGlobal,
          title: "Remove Sponsors",
          description: "Cut sponsor segments on YouTube.",
        },
      ],
    }),
  ];
}

export const videosSection: SectionConfig = {
  title: "Videos",
  description: "Quality, codecs, and extras for saved videos.",
  keywords: [
    "downloads",
    "resolution",
    "codec",
    "subtitles",
    "sponsorblock",
    "missing",
  ],
  groups: videoDownloadGroups(),
};
