import type { Command } from "./types";

export const NAVIGATION_COMMANDS: Command[] = [
  {
    id: "nav.library",
    label: "Go to Library",
    group: "Navigation",
    scope: "all",
    keywords: ["home", "all saves"],
    chord: ["g", "l"],
    perform: ({ navigate, close }) => {
      navigate("/", { viewTransition: true });
      close();
    },
  },
  {
    id: "nav.inbox",
    label: "Go to Inbox",
    group: "Navigation",
    scope: "all",
    keywords: ["unread"],
    chord: ["g", "i"],
    perform: ({ navigate, close }) => {
      navigate("/inbox", { viewTransition: true });
      close();
    },
  },
  {
    id: "nav.activity",
    label: "Go to Activity",
    group: "Navigation",
    scope: "all",
    keywords: ["history", "log"],
    chord: ["g", "a"],
    perform: ({ navigate, close }) => {
      navigate("/activity", { viewTransition: true });
      close();
    },
  },
  {
    id: "nav.trash",
    label: "Go to Trash",
    group: "Navigation",
    scope: "all",
    keywords: ["deleted"],
    chord: ["g", "t"],
    perform: ({ navigate, close }) => {
      navigate("/trash", { viewTransition: true });
      close();
    },
  },
  {
    id: "nav.untagged",
    label: "Go to Untagged",
    group: "Navigation",
    scope: "all",
    keywords: ["needs tags", "no tags"],
    chord: ["g", "u"],
    perform: ({ navigate, close }) => {
      navigate("/untagged", { viewTransition: true });
      close();
    },
  },
  {
    id: "nav.recents",
    label: "Go to Recents",
    group: "Navigation",
    scope: "all",
    keywords: ["recent", "history"],
    chord: ["g", "r"],
    perform: ({ navigate, close }) => {
      navigate("/recents", { viewTransition: true });
      close();
    },
  },
  {
    id: "nav.random",
    label: "Go to Random",
    group: "Navigation",
    scope: "all",
    keywords: ["shuffle", "discover"],
    chord: ["g", "x"],
    perform: ({ navigate, close }) => {
      navigate("/random", { viewTransition: true });
      close();
    },
  },
  {
    id: "nav.settings",
    label: "Go to Settings",
    group: "Navigation",
    scope: "all",
    keywords: ["preferences", "options"],
    shortcut: ["⌘", ","],
    chord: ["g", "s"],
    perform: ({ navigate, close }) => {
      navigate("/settings", { viewTransition: true });
      close();
    },
  },
];
