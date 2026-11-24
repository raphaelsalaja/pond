import {
  IconArrowUpRight,
  IconChatBubble,
  IconCopy,
  IconExternalLink,
  IconFolder,
  IconFolderOpen,
  IconFolderSend,
  IconMagnifier,
  IconTrashXmark,
} from "@pond/icons";
import { PaletteThumb } from "@pond/video";
import type {
  MatchRange,
  PaletteEntry,
  PaletteRow,
  PaletteState,
} from "@pond/video";
import {
  MIN_SCORE,
  matchItem,
} from "../../../../apps/desktop/src/renderer/src/features/library/components/command-menu/score";
import {
  APPLY_VIEW,
  COMMANDS,
  FOLDERS,
  media,
  RECENT,
  SAVES,
  VIEWS,
  WICKER,
} from "./data";
import type { Command, Shot } from "./data";
import { CUES } from "./timeline";

interface Item extends PaletteEntry {
  group: string;
  keywords?: string;
  scoreFloor?: number;
  scoreWeight?: number;
}

interface Ranked {
  item: Item;
  score: number;
  ranges: ReadonlyArray<MatchRange>;
}

const KEYWORD_SAVE_WEIGHT = 0.95;
const KEYWORD_LIMIT = 8;
const ROOT_LIMITS = { Folders: 5, "Saved Views": 5 } satisfies Record<
  string,
  number
>;

const PLACEHOLDERS = {
  root: "Search…",
  actions: "Search…",
  folders: "Search…",
};

function command(spec: Command): Item {
  const Icon = spec.icon;
  return {
    id: `command:${spec.label}`,
    group: spec.group,
    label: spec.label,
    keywords: [spec.detail, spec.keywords].filter(Boolean).join(" "),
    icon: <Icon aria-hidden />,
    shortcut: spec.shortcut,
    page: spec === APPLY_VIEW || undefined,
  };
}

const COMMAND_ITEMS = [...COMMANDS.map(command), command(APPLY_VIEW)];

const FOLDER_ITEMS: Array<Item> = FOLDERS.map((folder) => ({
  id: `folder:${folder.name}`,
  group: "Folders",
  label: folder.name,
  icon: <IconFolder aria-hidden />,
}));

const VIEW_ITEMS: Array<Item> = VIEWS.map((name) => ({
  id: `view:${name}`,
  group: "Saved Views",
  label: name,
  icon: <IconMagnifier aria-hidden />,
}));

function save(shot: Shot, id: string, group: string, rank = 0): Item {
  return {
    id,
    group,
    label: shot.title,
    detail: shot.source,
    tall: true,
    actions: true,
    icon: <PaletteThumb src={media(shot.id)} aspect={shot.aspect} />,
    scoreFloor: MIN_SCORE + 0.06 - rank * 0.004,
    scoreWeight: KEYWORD_SAVE_WEIGHT,
  };
}

const fold = (text: string) => text.toLowerCase();

/** Keyword hits as the library's full-text search returns them: titles with a word that starts with the query. */
function keywordHits(query: string): Array<Item> {
  const q = fold(query.trim());
  if (q.length < 2) {
    return [];
  }
  return SAVES.filter((shot) =>
    fold(shot.title)
      .split(/[\s,]+/)
      .some((word) => word.startsWith(q)),
  )
    .slice(0, KEYWORD_LIMIT)
    .map((shot, rank) => save(shot, `save:${shot.id}`, "Saves", rank));
}

/** `rank.ts` `rankEntries`. */
function rank(items: ReadonlyArray<Item>, query: string): Array<Ranked> {
  const trimmed = query.trim();
  if (!trimmed) {
    return items.map((item) => ({ item, score: 1, ranges: [] }));
  }
  const ranked: Array<Ranked> = [];
  for (const item of items) {
    const match = matchItem(item, trimmed);
    const weight = item.scoreWeight ?? 1;
    const matched =
      !match || weight === 0 ? 0 : match.score === 1 ? 1 : match.score * weight;
    const score = Math.max(matched, item.scoreFloor ?? 0);
    if (score < MIN_SCORE) {
      continue;
    }
    ranked.push({ item, score, ranges: match?.ranges ?? [] });
  }
  return ranked;
}

/** `rank.ts` `buildModel`, without the status row. */
function rows(
  ranked: ReadonlyArray<Ranked>,
  byScore: boolean,
  limits: Record<string, number> = {},
): Array<PaletteRow> {
  const groups = new Map<string, Array<Ranked>>();
  for (const entry of ranked) {
    const list = groups.get(entry.item.group);
    if (list) {
      list.push(entry);
    } else {
      groups.set(entry.item.group, [entry]);
    }
  }
  const ordered = [...groups];
  if (byScore) {
    for (const [, list] of ordered) {
      list.sort((a, b) => b.score - a.score);
    }
    ordered.sort(([, a], [, b]) => (b[0]?.score ?? 0) - (a[0]?.score ?? 0));
  }
  const out: Array<PaletteRow> = [];
  let index = 0;
  for (const [label, list] of ordered) {
    if (label) {
      out.push({ kind: "group", label, divided: out.length > 0 });
    }
    for (const entry of list.slice(0, limits[label] ?? list.length)) {
      out.push({
        kind: "entry",
        index: index++,
        entry: { ...entry.item, ranges: entry.ranges },
      });
    }
  }
  return out;
}

function root(at: number, query: string, extra: Partial<PaletteState> = {}) {
  const items = query
    ? [...COMMAND_ITEMS, ...FOLDER_ITEMS, ...VIEW_ITEMS, ...keywordHits(query)]
    : [
        ...RECENT.map((shot) => save(shot, `recent:${shot.id}`, "Recent")),
        ...COMMAND_ITEMS,
      ];
  const state: PaletteState = {
    at,
    query,
    placeholder: PLACEHOLDERS.root,
    rows: rows(rank(items, query), Boolean(query), ROOT_LIMITS),
    footer: query
      ? {
          id: "search:library",
          label: "Search Library",
          detail: query,
          icon: <IconMagnifier aria-hidden />,
        }
      : undefined,
    active: 0,
    page: "root",
    ...extra,
  };
  return state;
}

const action = (
  label: string,
  keywords: string,
  icon: PaletteEntry["icon"],
  extra: Partial<Item> = {},
): Item => ({
  id: `action:${label}`,
  group: "",
  label,
  keywords,
  icon,
  ...extra,
});

/** `save-actions.tsx` for a web save with a file on disk. */
const ACTIONS: Array<Item> = [
  action("Open Save", "view show", <IconArrowUpRight aria-hidden />),
  action("Reveal in Finder", "show file disk", <IconFolderOpen aria-hidden />),
  action("Open in Browser", "link website", <IconExternalLink aria-hidden />),
  action("Copy Link", "url clipboard", <IconCopy aria-hidden />),
  action("Add to Chat", "assistant ask", <IconChatBubble aria-hidden />),
  action(
    "Add to Folder",
    "move organize collection",
    <IconFolderSend aria-hidden />,
    { page: true },
  ),
  action("Move to Trash", "delete remove", <IconTrashXmark aria-hidden />, {
    shortcut: [["⌫"]],
  }),
];

function actions(at: number, query: string): PaletteState {
  return {
    at,
    query,
    placeholder: PLACEHOLDERS.actions,
    crumb: { title: WICKER.title, context: "Save" },
    rows: rows(rank(ACTIONS, query), Boolean(query)),
    active: 0,
    page: "actions",
    direction: "forward",
  };
}

const ADD_ITEMS: Array<Item> = FOLDERS.map((folder) => ({
  id: `add:${folder.name}`,
  group: "",
  label: folder.name,
  icon: <IconFolder aria-hidden />,
}));

function folders(at: number, query: string): PaletteState {
  return {
    at,
    query,
    placeholder: PLACEHOLDERS.folders,
    crumb: { title: "Add to Folder" },
    rows: rows(rank(ADD_ITEMS, query), Boolean(query)),
    active: 0,
    page: "folders",
    direction: "forward",
  };
}

/** One state per keystroke, so the list reshapes as each letter lands. */
function typed(
  text: string,
  start: number,
  step: number,
  make: (at: number, query: string) => PaletteState,
) {
  return Array.from(text).map((_, i) =>
    make(start + i * step, text.slice(0, i + 1)),
  );
}

export const STATES: Array<PaletteState> = [
  root(CUES.menuOpen, ""),
  ...typed("setings", CUES.typoType, CUES.letter, root),
  root(CUES.selectAll, "setings", { selected: true }),
  ...typed("chair", CUES.chairType, CUES.letter, root),
  root(CUES.down, "chair", { active: 1 }),
  actions(CUES.tab, ""),
  ...typed("fol", CUES.filterType, CUES.letter, actions),
  folders(CUES.enterFolder, ""),
  ...typed("cha", CUES.folderType, CUES.letter, folders),
];
