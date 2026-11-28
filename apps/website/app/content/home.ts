/** Every word on the homepage. */

const REPO = "https://github.com/raphaelsalaja/pond";
const WIKI = `${REPO}/wiki`;

export const LINKS = {
  repo: REPO,
  releases: `${REPO}/releases`,
  changelog: `${REPO}/tree/main/changelog`,
  wiki: WIKI,
  mcp: `${WIKI}/Model-Context-Protocol`,
  cli: `${REPO}/tree/main/packages/cli`,
  developers: "/developers",
  coffee: "https://buymeacoffee.com/raphaelsalaja",
  sponsors: "https://github.com/sponsors/raphaelsalaja",
  twitter: "https://x.com/raphaelsalaja",
  raycast: `${REPO}/tree/main/apps/raycast`,
};

export const HERO = {
  /** One sentence per line, at every width. */
  title: ["Everything you save,", "all in one place."],
  line: "Bring in your likes and bookmarks from X, Instagram, Pinterest, and more. Finding them again has never been so simple.",
};

export interface Section {
  title: string;
  line: string;
}

export const SAVE: Section = {
  title: "Save from everywhere.",
  line: "Pond syncs through your own browser session, so new likes and saves land on their own.",
};

export type FeatureIcon =
  | "app"
  | "extension"
  | "sources"
  | "history"
  | "watch"
  | "share"
  | "files"
  | "originals";

export interface Feature {
  icon: FeatureIcon;
  title: string;
  body: string;
  action?: "download" | "extension";
}

export const FEATURES: Array<Feature> = [
  {
    icon: "app",
    title: "Desktop app",
    body: "A native app for macOS, Windows, and Linux.",
    action: "download",
  },
  {
    icon: "extension",
    title: "Save from your browser",
    body: "Save the page you’re on in one click.",
    action: "extension",
  },
  {
    icon: "sources",
    title: "Sync your likes and saves",
    body: "Connect an account once and Pond keeps importing.",
  },
  {
    icon: "history",
    title: "Bring your history",
    body: "Import an X archive, an Instagram export, or a YouTube Takeout.",
  },
  {
    icon: "watch",
    title: "Watch a board or a playlist",
    body: "Follow a Pinterest board or a YouTube playlist as it grows.",
  },
  {
    icon: "share",
    title: "Save from anywhere",
    body: "The Share menu, Shortcuts, Raycast, and a local API.",
  },
  {
    icon: "files",
    title: "Import your files",
    body: "Drop in images, videos, and PDFs, or bring an Eagle library.",
  },
  {
    icon: "originals",
    title: "Keep the originals",
    body: "Pond downloads every image and video at full size, not just the link.",
  },
];

export type ShowcaseImage =
  | "color"
  | "text"
  | "routines"
  | "review"
  | "duplicates"
  | "snooze";

export interface Showcase {
  image: ShowcaseImage;
  title: string;
  body: string;
}

export const FIND: Section & { cards: Array<Showcase> } = {
  title: "Find anything you saved.",
  line: "Search by the colors in a picture, the words in a screenshot, or what someone said in a video. It all runs on your computer.",
  cards: [
    {
      image: "color",
      title: "Search by color",
      body: "Pond pulls a palette from every image, so you can ask for the orange one.",
    },
    {
      image: "text",
      title: "Find the words in a screenshot",
      body: "Pond reads the text in your images, so a word finds the screenshot it’s in.",
    },
  ],
};

export const ASK: Section & { cards: Array<Showcase> } = {
  title: "Ask your Library.",
  line: "Fish are chat characters that answer from your Saves, using Apple Intelligence, your own key, or a local model.",
  cards: [
    {
      image: "routines",
      title: "Routines",
      body: "A fish can look over new Saves on a schedule and suggest tags, folders, and notes.",
    },
    {
      image: "review",
      title: "You approve every change",
      body: "Nothing in your Library changes until you say so.",
    },
  ],
};

export const KEEP: Section & { cards: Array<Showcase> } = {
  title: "Yours, on your disk.",
  line: "Your Library is a folder on your computer. No Pond account, no Pond cloud, and nothing to export when you leave.",
  cards: [
    {
      image: "duplicates",
      title: "Merge duplicates",
      body: "Pond pairs Saves that hold the same thing, even resized, and merges them when you say so.",
    },
    {
      image: "snooze",
      title: "Snooze what can wait",
      body: "Hide a Save from the Inbox until tomorrow, next week, or a date you pick.",
    },
  ],
};

export type ToolIcon = "mcp" | "cli" | "api";

export const BUILD: Section & {
  tools: Array<{
    icon: ToolIcon;
    name: string;
    body: string;
    action: string;
    href: string;
  }>;
} = {
  title: "Connect your Library to Claude, ChatGPT, or your own scripts.",
  line: "Everything runs inside Pond on your computer. Nothing goes through a Pond server.",
  tools: [
    {
      icon: "mcp",
      name: "MCP",
      body: "Let your agent search and open your Saves.",
      action: "Connect",
      href: LINKS.mcp,
    },
    {
      icon: "cli",
      name: "CLI",
      body: "Search and save from the terminal.",
      action: "Read Me",
      href: LINKS.cli,
    },
    {
      icon: "api",
      name: "API",
      body: "Build your own tools on a local HTTP API.",
      action: "Docs",
      href: LINKS.developers,
    },
  ],
};

export const FREE = {
  title: "Free and open source.",
  line: "Pond is made by one person and MIT licensed. There’s nothing to upgrade.",
  plan: {
    name: "Pond",
    price: "Free",
    body: "Everything Pond does, on every platform, for as long as you use it.",
    includes: [
      "Desktop app and browser extension",
      "21 Sources and any web page",
      "Search by color, text, and speech",
      "Fish with your own model",
      "Local API, CLI, and MCP",
      "Your Library in a folder you own",
    ],
  },
  support: {
    name: "Support Pond",
    body: "Support pays for the Apple Developer membership, Windows code signing, and time to keep Sources working as sites change.",
    includes: [
      "Once or monthly on Buy Me a Coffee",
      "Monthly on GitHub Sponsors",
      "Or star the repository",
    ],
  },
};

export const FAQ: Array<{ question: string; answer: string }> = [
  {
    question: "Is there a Pond account or a Pond cloud?",
    answer:
      "No. Your Library is a folder on your computer, with your files in it. Pond has no servers that hold your Saves, and you can open the folder yourself.",
  },
  {
    question: "How does Pond get my saves from X or Instagram?",
    answer:
      "Sources run through your own browser session on your own computer. Pond never sends your passwords or cookies anywhere. It paces every request, backs off when a site asks it to, and stops a Source if the site shows a challenge.",
  },
  {
    question: "Which sites can Pond save from?",
    answer:
      "X, Instagram, Pinterest, TikTok, YouTube, Reddit, Threads, Bluesky, Tumblr, LinkedIn, Are.na, Cosmos, Savee, Dribbble, Behance, Unsplash, Vimeo, GitHub, Substack, Marked, and mymind, plus any web page through the extension.",
  },
  {
    question: "What happens if a post I saved gets deleted?",
    answer:
      "Your copy stays. Pond downloads the images, videos, and text of every Save into your Library, so it doesn’t depend on the post still being online.",
  },
  {
    question: "Do I need an AI subscription to use Fish?",
    answer:
      "No. Fish can use Apple Intelligence, a key from the provider you already pay for, or a local model through Ollama or LM Studio.",
  },
];
