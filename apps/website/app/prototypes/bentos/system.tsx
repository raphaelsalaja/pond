"use client";

import {
  IconCircleCheckFill,
  IconExport,
  IconFile,
  IconFileZip,
  IconFolder,
  IconFolderImport,
  IconFolderPlus,
  IconGauge,
  IconLink2,
  IconLock,
  IconMagnifier,
  IconSparkle,
} from "@pond/icons";
import {
  IconInstagram,
  IconPinterest,
  IconYoutube,
} from "@pond/icons/social-media";
import type { CSSProperties } from "react";
import { findSave } from "@/lib/library";
import { Card } from "../../components/replica/card";
import { Toolbar } from "../../components/replica/toolbar";
import {
  AccountRow,
  countTo,
  flip,
  formatCount,
  Panel,
  type Play,
  Stage,
  Thumb,
  useStage,
  visit,
} from "./pieces";
import styles from "./styles.module.css";

const COMMANDS = [
  {
    id: "search",
    label: "Search library",
    hint: "stagger",
    icon: <IconMagnifier />,
  },
  { id: "fish", label: "Ask your fish", hint: "Koi", icon: <IconSparkle /> },
  {
    id: "board",
    label: "New board",
    hint: "Car Design",
    icon: <IconFolderPlus />,
  },
  {
    id: "import",
    label: "Import history",
    hint: "X archive",
    icon: <IconFolderImport />,
  },
  {
    id: "offline",
    label: "Work offline",
    hint: "On this Mac",
    icon: <IconLock />,
  },
  { id: "export", label: "Export board", hint: "ZIP", icon: <IconExport /> },
  { id: "share", label: "Share board", hint: "Copy link", icon: <IconLink2 /> },
] as const;

const EXPORTS = [
  {
    id: "folder",
    title: "Folder on this Mac",
    detail: "~/Pond/Car Design",
    icon: <IconFolder />,
  },
  {
    id: "json",
    title: "library.json",
    detail: "48,210 saves",
    icon: <IconFile />,
  },
  {
    id: "zip",
    title: "Car Design.zip",
    detail: "642 files",
    icon: <IconFileZip />,
  },
] as const;

const MEMORIES = [
  { id: "pink-roses", when: "Saved 26 Oct" },
  { id: "moss-forest", when: "Saved 24 Oct" },
  { id: "breakfast-tray", when: "Saved 26 Oct" },
] as const;

const WINDOW_TILES = [
  { id: "chrome-chair", top: 18, left: 16, width: 176, media: 200 },
  { id: "mercedes-snow", top: 18, left: 208, width: 176, media: 168 },
  { id: "sculpted-watch", top: 18, left: 400, width: 168, media: 196 },
  { id: "garden-gate", top: 18, left: 584, width: 176, media: 188 },
] as const;

const SOURCES = [
  {
    id: "instagram",
    name: "Instagram",
    detail: "Saved posts · 1,876",
    icon: <IconInstagram />,
  },
  {
    id: "pinterest",
    name: "Pinterest",
    detail: "Car Design · 642",
    icon: <IconPinterest />,
  },
  {
    id: "youtube",
    name: "YouTube",
    detail: "Watch later · 221",
    icon: <IconYoutube />,
  },
] as const;

type SyncBeat = { index: number; phase: "sync" | "done" };
const SYNC_POSTER: SyncBeat = { index: 0, phase: "done" };

const playSync: Play<SyncBeat> = async (set, wait) => {
  await wait(700);
  for (let index = 0; index < SOURCES.length; index += 1) {
    set({ index, phase: "sync" });
    await wait(620);
    set({ index, phase: "done" });
    await wait(280);
  }
  set(SYNC_POSTER);
  await wait(700);
};

const playExport: Play<number> = async (set, wait) => {
  await wait(500);
  for (let index = 0; index <= EXPORTS.length; index += 1) {
    set(index);
    await wait(index === EXPORTS.length ? 1100 : 620);
  }
};

export function CommandBar() {
  const { ref, state } = useStage(0, visit([1, 2, 3, 4, 5, 6, 0], 640));
  return (
    <Stage nodeRef={ref} size="tall" mask="bottom">
      <Panel place="start" fill>
        <ul className={styles.rows}>
          {COMMANDS.map((command, index) => (
            <AccountRow
              key={command.id}
              icon={command.icon}
              title={command.label}
              detail={command.hint}
              on={index === state}
              done={index === state}
            />
          ))}
        </ul>
      </Panel>
    </Stage>
  );
}

export function ShortcutKeys() {
  const { ref, state } = useStage(true, flip(true, 900));
  return (
    <Stage nodeRef={ref} size="small">
      <div className={styles.keys}>
        <kbd className={styles.keycap} data-down={state || undefined}>
          ⌘
        </kbd>
        <kbd className={styles.keycap} data-down={state || undefined}>
          K
        </kbd>
      </div>
      <p className={styles.keyHint} data-on={state || undefined}>
        Command bar
      </p>
    </Stage>
  );
}

export function LocalLibrary() {
  const { ref, state } = useStage(true, flip(true, 1400));
  return (
    <Stage nodeRef={ref} size="small">
      <div className={styles.heroNumber}>
        <span className={styles.lock} data-on={state || undefined}>
          <IconLock size={28} />
        </span>
        <strong>On this Mac</strong>
        <span>
          {state ? "Nothing leaves this computer." : "Checking the library…"}
        </span>
      </div>
    </Stage>
  );
}

export function OfflineLibrary() {
  const { ref, state } = useStage(false, flip(false, 1400));
  return (
    <Stage nodeRef={ref} size="small">
      <div className={styles.offline}>
        <span className={styles.pill} data-on={!state || undefined}>
          {state ? (
            <IconCircleCheckFill size={16} />
          ) : (
            <span className={styles.spinner} />
          )}
          {state ? "Back online" : "Offline · still searchable"}
        </span>
        <div className={styles.strip}>
          <span className={styles.stripCard}>
            <Thumb id="chrome-chair" />
          </span>
          <span className={styles.stripCard}>
            <Thumb id="flower-painting" />
          </span>
        </div>
      </div>
    </Stage>
  );
}

const playSpeed: Play<number> = async (set, wait) => {
  await wait(500);
  for (const value of [64, 46, 32, 24, 18]) {
    set(value);
    await wait(value === 18 ? 1200 : 160);
  }
};

export function SearchSpeed() {
  const { ref, state } = useStage(18, playSpeed);
  return (
    <Stage nodeRef={ref} size="small">
      <div className={styles.heroNumber}>
        <span className={styles.lock}>
          <IconGauge size={28} />
        </span>
        <strong>
          {state}
          <span className={styles.unit}>ms</span>
        </strong>
        <span>First result for “stagger”</span>
      </div>
    </Stage>
  );
}

export function ExportBundle() {
  const { ref, state } = useStage(EXPORTS.length, playExport);
  return (
    <Stage nodeRef={ref} size="wide" mask="right">
      <Panel place="start">
        <ul className={styles.rows}>
          {EXPORTS.map((item, index) => {
            const ready = index < state;
            const packing = index === state;
            let detail: string = item.detail;
            if (ready) detail = "Ready";
            if (packing) detail = "Packing…";
            return (
              <AccountRow
                key={item.id}
                icon={item.icon}
                title={item.title}
                detail={detail}
                on={index === Math.min(state, EXPORTS.length - 1)}
                done={ready || packing}
                trailing={
                  ready ? (
                    <IconCircleCheckFill size={18} />
                  ) : packing ? (
                    <span className={styles.spinner} />
                  ) : null
                }
              />
            );
          })}
        </ul>
      </Panel>
    </Stage>
  );
}

export function ShareBoard() {
  const { ref, state } = useStage(true, flip(true, 1300));
  const covers = [
    "mercedes-snow",
    "chrome-chair",
    "yellow-coupe",
    "paris-countach",
  ] as const;
  return (
    <Stage nodeRef={ref} size="wide">
      <Panel place="start">
        <div className={styles.folderHead}>
          <span className={styles.copy}>
            <strong>Car Design</strong>
            <span className={styles.detail}>
              642 saves · only people with the link
            </span>
          </span>
        </div>
        <div className={styles.strip}>
          {covers.map((id) => (
            <span key={id} className={styles.stripCard}>
              <Thumb id={id} />
            </span>
          ))}
        </div>
        <div className={styles.linkRow}>
          <code>pond.local/b/car-design</code>
          <span className={styles.pill} data-on={state || undefined}>
            {state ? (
              <IconCircleCheckFill size={16} />
            ) : (
              <IconLink2 size={16} />
            )}
            {state ? "Copied" : "Copy link"}
          </span>
        </div>
      </Panel>
    </Stage>
  );
}

export function DailyMemory() {
  const { ref, state } = useStage(0, visit([1, 2, 0], 1400));
  const memory = MEMORIES[state] ?? MEMORIES[0];
  const save = findSave(memory.id);
  return (
    <Stage nodeRef={ref} size="tall" mask="bottom">
      {MEMORIES.map((item, index) => (
        <div
          key={item.id}
          className={styles.bleed}
          data-on={index === state || undefined}
        >
          <Thumb id={item.id} />
        </div>
      ))}
      <div className={styles.memoryCopy}>
        <span className={styles.detail}>{memory.when}</span>
        <strong>{save.title}</strong>
      </div>
    </Stage>
  );
}

export function DesktopWindow() {
  const { ref, state } = useStage(0, visit([1, 2, 3, 0], 900));
  return (
    <Stage nodeRef={ref} size="wide" mask="bottom">
      <div
        className={styles.window}
        style={{ "--window-left-width": "220px" } as CSSProperties}
      >
        <Toolbar
          crumbs={[
            { label: "Library", Icon: IconFolder },
            { label: "All saves" },
          ]}
          position="48,210"
        />
        <div className={styles.canvas}>
          {WINDOW_TILES.map((tile, index) => (
            <Card
              key={tile.id}
              save={findSave(tile.id)}
              selected={index === state}
              layout={{
                id: tile.id,
                top: tile.top,
                left: tile.left,
                width: tile.width,
                mediaHeight: tile.media,
              }}
            />
          ))}
        </div>
      </div>
    </Stage>
  );
}

export function SyncStatus() {
  const { ref, state } = useStage(SYNC_POSTER, playSync);
  return (
    <Stage nodeRef={ref} size="small">
      <Panel place="start">
        <ul className={styles.rows}>
          {SOURCES.map((source, index) => {
            const active = index === state.index;
            const syncing = active && state.phase === "sync";
            return (
              <AccountRow
                key={source.id}
                icon={source.icon}
                title={source.name}
                detail={syncing ? "Syncing…" : "Synced just now"}
                on={active}
                done={!syncing}
                trailing={
                  syncing ? (
                    <span className={styles.spinner} />
                  ) : (
                    <IconCircleCheckFill size={16} />
                  )
                }
              />
            );
          })}
        </ul>
      </Panel>
    </Stage>
  );
}

export function LibraryStats() {
  const { ref, state } = useStage(48210, countTo(48150, 48210, 15));
  const figures = [
    { id: "saves", value: formatCount(state), label: "Saves" },
    { id: "sources", value: "18", label: "Sources" },
    { id: "boards", value: "6", label: "Boards" },
  ];
  return (
    <Stage nodeRef={ref} size="wide" mask="right">
      <div className={styles.figures}>
        {figures.map((figure) => (
          <span key={figure.id} className={styles.figure}>
            <strong>{figure.value}</strong>
            <span>{figure.label}</span>
          </span>
        ))}
      </div>
    </Stage>
  );
}
