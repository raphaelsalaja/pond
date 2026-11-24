import {
  IconLayers,
  IconMediaPause,
  IconScissors,
  IconVideo,
} from "@pond/icons";

export const FEATURES = [
  {
    title: "Video or Audio",
    description: "Paste a link and save it as an MP4, or as MP3 or M4A audio.",
    Icon: IconVideo,
  },
  {
    title: "Whole Playlists",
    description: "Download every video in a playlist at the quality you pick.",
    Icon: IconLayers,
  },
  {
    title: "Clip a Range",
    description:
      "Set a start and end to keep only the part of a video you need.",
    Icon: IconScissors,
  },
  {
    title: "Pause the Queue",
    description:
      "Pause background downloads at any time. Links you add still start.",
    Icon: IconMediaPause,
  },
];

export const INTRO = {
  title: "Downloads",
  description:
    "Downloads tracks every file Pond fetches into your Library, from saved posts and links you paste.",
};
