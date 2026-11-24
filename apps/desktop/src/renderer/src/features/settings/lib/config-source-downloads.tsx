import { sourceLabel } from "@pond/schema/sources";
import type { ExternalSource } from "@pond/schema/sources";
import type { SectionConfig } from "@/features/settings/components/engine";
import { useSourceCustomBinding } from "@/features/settings/components/sections/downloads";
import { imageDownloadGroups } from "@/features/settings/lib/config-images";
import { videoDownloadGroups } from "@/features/settings/lib/config-videos";
import { group } from "@/features/settings/lib/engine-types";

export function sourceDownloadsSection(source: ExternalSource): SectionConfig {
  const label = sourceLabel(source);
  const useCustom = () => useSourceCustomBinding(source);
  return {
    title: label,
    description: `Image and video downloads for saves from ${label}.`,
    keywords: ["downloads", "harvesting", "images", "videos", label],
    groups: [
      group.with(useCustom, {
        items: [
          {
            control: "switch",
            key: "useGlobal",
            title: "Use Global Settings",
            description: "Off uses this source's own download settings.",
          },
        ],
      }),
      ...imageDownloadGroups(source),
      ...videoDownloadGroups(source),
    ],
  };
}
