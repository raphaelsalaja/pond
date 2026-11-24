import { IconFolder, IconMerge, IconSparkle, IconTag } from "@pond/icons";

export const FEATURES = [
  {
    title: "Tag in Bulk",
    description: "Add tags to one save or to every save you've selected.",
    Icon: IconTag,
  },
  {
    title: "Suggested Tags",
    description:
      "Pond suggests tags for each save on your Mac and lists them in the tag picker.",
    Icon: IconSparkle,
  },
  {
    title: "Tag Groups",
    description: "Gather related tags into a group and give it a description.",
    Icon: IconFolder,
  },
  {
    title: "Rename and Merge",
    description:
      "Rename a tag on every save at once, or merge duplicates into one.",
    Icon: IconMerge,
  },
];

export const INTRO = {
  title: "Tags",
  description:
    "Tags sort your Library across every source and folder. Give a save as many as you need.",
};
