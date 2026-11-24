import { IconClock, IconEye, IconFolderOpen, IconUserPlus } from "@pond/icons";

export const FEATURES = [
  {
    title: "Connect an Account",
    description:
      "Sign in through the Pond browser extension to sync the posts you save there.",
    Icon: IconUserPlus,
  },
  {
    title: "Watch a Public Account",
    description:
      "Follow a public profile, channel or board and save each new post.",
    Icon: IconEye,
  },
  {
    title: "Watch a Folder",
    description:
      "Pick a folder on your Mac, and files you add to it join your Library.",
    Icon: IconFolderOpen,
  },
  {
    title: "Fetch on a Schedule",
    description:
      "Check every source when Pond opens or at the times you choose.",
    Icon: IconClock,
  },
];

export const INTRO = {
  title: "Sources",
  description:
    "Sources bring what you save across the web into your Library. Pond fetches each one on this Mac.",
};
