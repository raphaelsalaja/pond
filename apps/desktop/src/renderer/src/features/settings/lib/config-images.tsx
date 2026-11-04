import type { ExternalSource } from "@pond/schema/sources";
import type { SectionConfig } from "@/features/settings/components/engine";
import { useImageDownloadBinding } from "@/features/settings/components/sections/downloads";
import { SplitExistingSaves } from "@/features/settings/components/sections/split-existing";
import {
  type GroupConfig,
  group,
  type SettingsValues,
} from "@/features/settings/lib/engine-types";

const imageQuality = (v: SettingsValues) =>
  (v.format === "jpeg" || v.format === "webp" || v.format === "avif") &&
  !v.lossless;
const imageLossless = (v: SettingsValues) =>
  v.format === "webp" || v.format === "avif";
const imageProgressive = (v: SettingsValues) =>
  v.format === "jpeg" || v.format === "png";
const followsGlobal = (v: SettingsValues) => v.followsGlobal === true;

export function imageDownloadGroups(source?: ExternalSource): GroupConfig[] {
  const useBinding = () => useImageDownloadBinding(source);
  /** Source pages mix image and video groups, so their titles name the kind. */
  const title = (name: string) => (source ? `Image ${name}` : name);
  return [
    group.with(useBinding, {
      title: title("Format"),
      items: [
        {
          control: "select",
          key: "maxLongEdge",
          disabled: followsGlobal,
          title: "Resolution",
          description: "Resize anything larger than this.",
          options: [
            { value: 1024, label: "1024\u00A0px" },
            { value: 2048, label: "2048\u00A0px" },
            { value: 4096, label: "4096\u00A0px" },
            { value: 8192, label: "8192\u00A0px" },
            { value: null, label: "Original" },
          ],
        },
        {
          control: "select",
          key: "format",
          disabled: followsGlobal,
          title: "Format",
          description: "Keep the format or convert future downloads.",
          options: [
            { value: "original", label: "Same Format" },
            { value: "jpeg", label: "JPEG" },
            { value: "png", label: "PNG" },
            { value: "webp", label: "WebP" },
            { value: "avif", label: "AVIF" },
          ],
        },
      ],
    }),
    group.with(useBinding, {
      title: title("Encoding"),
      items: [
        {
          control: "select",
          key: "quality",
          disabled: followsGlobal,
          title: "Quality",
          description: "Higher keeps more detail.",
          visible: imageQuality,
          options: [
            { value: 50, label: "50%" },
            { value: 60, label: "60%" },
            { value: 70, label: "70%" },
            { value: 80, label: "80%" },
            { value: 90, label: "90%" },
            { value: 95, label: "95%" },
            { value: 100, label: "100%" },
          ],
        },
        {
          control: "switch",
          key: "lossless",
          disabled: followsGlobal,
          title: "Lossless",
          description: "Encode WebP/AVIF without quality loss.",
          visible: imageLossless,
        },
        {
          control: "switch",
          key: "progressive",
          disabled: followsGlobal,
          title: "Progressive",
          description: "Load JPEG and PNG in passes.",
          visible: imageProgressive,
        },
        {
          control: "switch",
          key: "preserveMetadata",
          disabled: followsGlobal,
          title: "Preserve Metadata",
          description: "Keep camera, location, and color details.",
        },
      ],
    }),
    group.with(useBinding, {
      title: "Carousels",
      items: [
        {
          control: "switch",
          key: "splitPosts",
          disabled: followsGlobal,
          title: "Split Into Saves",
          description:
            "New posts with several images or videos save each one on its own.",
        },
        {
          control: "custom",
          key: "split-existing",
          title: "Split Existing Saves",
          keywords: ["backfill", "existing"],
          visible: () => source === undefined,
          render: () => <SplitExistingSaves />,
        },
      ],
    }),
  ];
}

export const imagesSection: SectionConfig = {
  title: "Images",
  description: "Resize, format, encoding, and carousels for saved images.",
  keywords: [
    "downloads",
    "resolution",
    "format",
    "quality",
    "metadata",
    "carousel",
    "split",
  ],
  groups: imageDownloadGroups(),
};
