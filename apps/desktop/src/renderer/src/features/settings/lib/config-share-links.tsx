import {
  defineCustomSection,
  group,
} from "@/features/settings/lib/engine-types";

export const shareLinksSection = defineCustomSection({
  title: "Share Links",
  description:
    "Publish read-only pages of Saves and Folders to storage you own.",
  keywords: [
    "share",
    "sharing",
    "link",
    "public",
    "publish",
    "page",
    "bucket",
    "r2",
    "s3",
    "storage",
    "expire",
    "stop sharing",
  ],
  groups: [
    group.plain({
      items: [
        {
          control: "custom",
          key: "share-host",
          title: "Share Host",
          keywords: ["bucket", "r2", "s3", "backblaze", "endpoint", "key"],
          render: () => null,
        },
        {
          control: "custom",
          key: "links",
          title: "Links",
          keywords: ["stop sharing", "update", "copy link", "expire"],
          render: () => null,
        },
      ],
    }),
  ],
});
