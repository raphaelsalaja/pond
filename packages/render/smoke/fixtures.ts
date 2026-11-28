import type { BlueskyPost, ThreadsPost, XPost } from "../src/index";

/** 48×48 and 64×48 PNGs, so each layout decodes an avatar and media. */
const AVATAR =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAIAAADYYG7QAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAOElEQVRYw+3OMQ0AAAgDsPm/cMxcEI4mFdBk9hchISEhISEhISEhISEhISEhISEhISEhISEhoTsFeI8H09C3p4AAAAAASUVORK5CYII=";
const MEDIA =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAAAwCAIAAAAuKetIAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAQ0lEQVRo3u3PQQkAAAgEsMtjWRPY1Qp+hcEKLDX9WgQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQErhYn4wjxA3Dy2QAAAABJRU5ErkJggg==";

export const X_POST: XPost = {
  text: "Pond keeps what you save on your own computer. Notes, tags and folders stay local 🌱 https://example.com/pond",
  author: {
    name: "Pond",
    handle: "pondapp",
    verified: "blue",
    avatar: AVATAR,
  },
  media: [
    {
      kind: "image",
      width: 64,
      height: 48,
      data: MEDIA,
      alt: "A green square",
    },
  ],
  quote: {
    text: "Local-first means your library works offline.",
    author: {
      name: "Example",
      handle: "example",
      avatar: AVATAR,
    },
    createdAt: "2026-11-27T09:00:00-08:00",
  },
  createdAt: "2026-11-27T12:30:00-08:00",
  now: "2026-11-27T14:30:00-08:00",
  counts: {
    replies: 12,
    reposts: 34,
    likes: 567,
    views: 8900,
    bookmarks: 21,
  },
};

export const THREADS_POST: ThreadsPost = {
  author: {
    name: "pond",
    initials: "P",
    verified: true,
    avatar: AVATAR,
  },
  text: [
    {
      text: "Saved this thread to Pond. Read it later at ",
    },
    {
      text: "example.com",
      link: true,
    },
    {
      text: " ✨",
    },
  ],
  media: [
    {
      src: MEDIA,
      width: 64,
      height: 48,
    },
    {
      src: MEDIA,
      width: 64,
      height: 48,
    },
  ],
  time: "18h",
  metrics: [
    {
      icon: "threads-like",
      value: "1.2K",
    },
    {
      icon: "threads-reply",
      value: "48",
    },
    {
      icon: "threads-repost",
      value: "7",
    },
    {
      icon: "threads-share",
      value: "",
    },
    {
      icon: "threads-save",
      value: "",
    },
  ],
};

export const BLUESKY_POST: BlueskyPost = {
  author: {
    name: "Pond",
    handle: "@pond.example.com",
    verified: true,
    avatar: AVATAR,
  },
  text: [
    {
      text: "Everything you save stays on your computer. ",
    },
    {
      text: "#localfirst",
      link: true,
    },
  ],
  media: {
    images: [
      {
        src: MEDIA,
        width: 64,
        height: 48,
      },
    ],
  },
  card: {
    title: "Pond",
    description: "A local-first archive of things you saved on the web.",
    domain: "example.com",
    image: MEDIA,
  },
  date: "November 27, 2026 at 12:30 PM",
  stats: [
    {
      value: "34",
      label: "reposts",
    },
    {
      value: "567",
      label: "likes",
    },
  ],
  controls: {
    replies: "12",
    reposts: "34",
    likes: "567",
  },
};
