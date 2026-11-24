import { IconHistory, IconInbox, IconLayers, IconScissors } from "@pond/icons";

export const FEATURES = [
  {
    title: "One Save per Item",
    description:
      "Each image or video in a post becomes its own save with its own tags.",
    Icon: IconLayers,
  },
  {
    title: "Split From the Menu",
    description: "Choose Split Into Saves on any gallery save to split it now.",
    Icon: IconScissors,
  },
  {
    title: "Split New Posts",
    description:
      "Split every new gallery as it arrives, for all sources or just one.",
    Icon: IconInbox,
  },
  {
    title: "Split Existing Saves",
    description: "Split the galleries already in your Library in one pass.",
    Icon: IconHistory,
  },
];

export const INTRO = {
  title: "Split Posts",
  description:
    "Split a gallery post into one save per image or video. Its pieces stay together here, one card per post.",
};
