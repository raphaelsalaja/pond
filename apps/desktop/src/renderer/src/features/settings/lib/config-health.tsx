import type { SectionConfig } from "@/features/settings/components/engine";
import {
  HealthCategoryList,
  HealthDebugReport,
  HealthOverview,
} from "@/features/settings/components/sections/health";

export const healthSection: SectionConfig = {
  title: "Library Health",
  description:
    "Checks files, previews, and downloads without changing anything until you choose a repair.",
  keywords: [
    "health",
    "integrity",
    "check",
    "repair",
    "missing",
    "damaged",
    "failed",
    "thumbnails",
    "posters",
    "downloads",
    "diagnostics",
    "debug report",
  ],
  groups: [
    { title: "Overview", render: () => <HealthOverview /> },
    { title: "Files", render: () => <HealthCategoryList group="files" /> },
    { title: "Media", render: () => <HealthCategoryList group="media" /> },
    {
      title: "Downloads",
      render: () => <HealthCategoryList group="downloads" />,
    },
    { title: "Support", render: () => <HealthDebugReport /> },
  ],
};
