"use client";

import type { ReactNode } from "react";
import "./ensure-all.js";
import {
  ConnectFolders,
  ConnectHub,
  ConnectInflow,
  ConnectOauth,
  ConnectSettings,
} from "./connect";
import {
  BoardList,
  DragDrop,
  DuplicatePair,
  ExtensionSave,
  FileTypes,
  FirefoxAddon,
  HistoryCount,
  ImportSteps,
  MoodBoard,
  SaveCalendar,
  SmartFolder,
  TagFilter,
} from "./library";
import {
  ColorRail,
  ColorSwatches,
  FishCommand,
  FishThread,
  ReadText,
  SimilarImages,
  TextSearch,
  TranscriptLines,
} from "./search";
import "./switcher.js";
import styles from "./styles.module.css";

import {
  CommandBar,
  DailyMemory,
  DesktopWindow,
  ExportBundle,
  LibraryStats,
  LocalLibrary,
  OfflineLibrary,
  SearchSpeed,
  ShareBoard,
  ShortcutKeys,
  SyncStatus,
} from "./system";

interface CardSpec {
  group: string;
  name: string;
  variant: string;
  note: string;
  Visual: () => ReactNode;
}

const CARDS: CardSpec[] = [
  {
    group: "Connect once",
    name: "01 · Connect once: Hub",
    variant: "Connect Hub",
    note: "App icons plug into one Pond mark, and the live one is connected.",
    Visual: ConnectHub,
  },
  {
    group: "Connect once",
    name: "02 · Connect once: Settings",
    variant: "Connect Settings",
    note: "A settings list of six sources, cropped off the right edge.",
    Visual: ConnectSettings,
  },
  {
    group: "Connect once",
    name: "03 · Connect once: Inflow",
    variant: "Connect Inflow",
    note: "Saves from each source arrive in a single grid.",
    Visual: ConnectInflow,
  },
  {
    group: "Connect once",
    name: "04 · Connect once: OAuth",
    variant: "Connect Buttons",
    note: "Each Connect button flips to Connected.",
    Visual: ConnectOauth,
  },
  {
    group: "Connect once",
    name: "05 · Connect once: Folders",
    variant: "Local Folders",
    note: "Local folders sit in the corner, one of them selected.",
    Visual: ConnectFolders,
  },
  {
    group: "Search",
    name: "06 · Search by color: Swatches",
    variant: "Color Swatches",
    note: "A swatch picks the save that carries that color.",
    Visual: ColorSwatches,
  },
  {
    group: "Search",
    name: "07 · Search by color: Rail",
    variant: "Color Rail",
    note: "Swatches bleed off the left, and the match fills the right.",
    Visual: ColorRail,
  },
  {
    group: "Search",
    name: "08 · Text in image",
    variant: "Text Search",
    note: "The word in the picture is the search.",
    Visual: TextSearch,
  },
  {
    group: "Search",
    name: "09 · Transcript",
    variant: "Transcript Lines",
    note: "The breakfast transcript keeps one word in focus.",
    Visual: TranscriptLines,
  },
  {
    group: "Search",
    name: "10 · Similar images",
    variant: "Similar Images",
    note: "Neighbours scale down and clip off both sides.",
    Visual: SimilarImages,
  },
  {
    group: "Search",
    name: "11 · OCR",
    variant: "Read Text",
    note: "A line reads the type out of the picture.",
    Visual: ReadText,
  },
  {
    group: "Fish",
    name: "12 · Ask your fish: Thread",
    variant: "Fish Thread",
    note: "Koi answers with three garden saves.",
    Visual: FishThread,
  },
  {
    group: "Fish",
    name: "13 · Ask your fish: Command",
    variant: "Fish Command",
    note: "Ask from the field, then the closest save arrives.",
    Visual: FishCommand,
  },
  {
    group: "Bring in",
    name: "14 · History import",
    variant: "Import Steps",
    note: "An X import steps from queued to done.",
    Visual: ImportSteps,
  },
  {
    group: "Bring in",
    name: "15 · Save from anywhere",
    variant: "Extension Save",
    note: "The Chrome pill flips from Saving to Saved.",
    Visual: ExtensionSave,
  },
  {
    group: "Bring in",
    name: "16 · Firefox add-on",
    variant: "Firefox Addon",
    note: "Firefox saves the page you are already on.",
    Visual: FirefoxAddon,
  },
  {
    group: "Bring in",
    name: "17 · History count",
    variant: "History Count",
    note: "One count for the X archive as it lands.",
    Visual: HistoryCount,
  },
  {
    group: "Library",
    name: "18 · Tags",
    variant: "Tag Filter",
    note: "The tag you pick changes the row behind it.",
    Visual: TagFilter,
  },
  {
    group: "Library",
    name: "19 · Collections",
    variant: "Board List",
    note: "Boards, a cover, and a count.",
    Visual: BoardList,
  },
  {
    group: "Library",
    name: "20 · Duplicates",
    variant: "Duplicate Pair",
    note: "Two copies of Flowing chair pull apart, then stack.",
    Visual: DuplicatePair,
  },
  {
    group: "Library",
    name: "21 · Smart folder",
    variant: "Smart Folder",
    note: "The folder rule swaps the saves inside it.",
    Visual: SmartFolder,
  },
  {
    group: "Library",
    name: "22 · Moodboard",
    variant: "Mood Board",
    note: "A board of real covers, one of them selected.",
    Visual: MoodBoard,
  },
  {
    group: "Library",
    name: "23 · Drag and drop",
    variant: "Drag Drop",
    note: "The snowy Mercedes drops onto the Car Design folder.",
    Visual: DragDrop,
  },
  {
    group: "Library",
    name: "24 · Calendar",
    variant: "Save Calendar",
    note: "October, opened on the day the chair was saved.",
    Visual: SaveCalendar,
  },
  {
    group: "Library",
    name: "25 · File types",
    variant: "File Types",
    note: "JPG, PNG, MP4, and WEBP from the same library.",
    Visual: FileTypes,
  },
  {
    group: "The app",
    name: "26 · Command bar",
    variant: "Command Bar",
    note: "The command list fades where the card ends.",
    Visual: CommandBar,
  },
  {
    group: "The app",
    name: "27 · Shortcuts",
    variant: "Shortcut Keys",
    note: "⌘K opens the command bar.",
    Visual: ShortcutKeys,
  },
  {
    group: "The app",
    name: "28 · Local-first",
    variant: "Local Library",
    note: "The library stays on this Mac.",
    Visual: LocalLibrary,
  },
  {
    group: "The app",
    name: "29 · Offline",
    variant: "Offline Library",
    note: "Offline, and the saves are still on disk.",
    Visual: OfflineLibrary,
  },
  {
    group: "The app",
    name: "30 · Speed",
    variant: "Search Speed",
    note: "Eighteen milliseconds to the first result.",
    Visual: SearchSpeed,
  },
  {
    group: "The app",
    name: "31 · Export",
    variant: "Export Bundle",
    note: "Folder, JSON, or a zip of the board.",
    Visual: ExportBundle,
  },
  {
    group: "The app",
    name: "32 · Share a board",
    variant: "Share Board",
    note: "Copy a link that only opens Car Design.",
    Visual: ShareBoard,
  },
  {
    group: "The app",
    name: "33 · Daily memory",
    variant: "Daily Memory",
    note: "One save comes back from late October.",
    Visual: DailyMemory,
  },
  {
    group: "The app",
    name: "34 · Desktop window",
    variant: "Desktop Window",
    note: "The desktop window, cropped like a product shot.",
    Visual: DesktopWindow,
  },
  {
    group: "The app",
    name: "35 · Sync status",
    variant: "Sync Status",
    note: "Instagram finishes a sync while the other rows wait.",
    Visual: SyncStatus,
  },
  {
    group: "The app",
    name: "36 · Stats",
    variant: "Library Stats",
    note: "Saves, sources, and boards as three figures.",
    Visual: LibraryStats,
  },
];

export function Gallery() {
  return (
    <main className={styles.page}>
      <header className={styles.intro}>
        <p className={styles.kicker}>Temporary prototypes</p>
        <h1 className={styles.title}>Bento cards</h1>
        <p className={styles.lede}>
          Thirty-six ways to show Pond on the homepage. Reply with a number. The
          bar along the bottom focuses one card.
        </p>
      </header>
      <prototype-switcher>
        {CARDS.map((card) => {
          const Visual = card.Visual;
          return (
            <section
              key={card.variant}
              className={styles.entry}
              data-variant={card.variant}
              data-note={card.note}
            >
              <p className={styles.group}>{card.group}</p>
              <h2 className={styles.name}>{card.name}</h2>
              <p className={styles.note}>{card.note}</p>
              <Visual />
            </section>
          );
        })}
      </prototype-switcher>
    </main>
  );
}
