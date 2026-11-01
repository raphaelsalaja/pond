"use client";

import { IconCircleCheckFill, IconFolderFill, IconSparkle } from "@pond/icons";
import { IconGoogleChrome } from "@pond/icons/social-media";
import { findSave } from "@/lib/library";
import { Card } from "../../components/replica/card";
import {
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

const TAGS = [
  { id: "chairs", label: "Chairs", save: "chrome-chair" },
  { id: "breakfast", label: "Breakfast", save: "breakfast-tray" },
  { id: "watches", label: "Watches", save: "sculpted-watch" },
  { id: "gardens", label: "Gardens", save: "moss-forest" },
  { id: "cars", label: "Cars", save: "mercedes-snow" },
  { id: "type", label: "Type", save: "motion-code" },
] as const;

const BOARDS = [
  {
    id: "cars",
    title: "Car Design",
    detail: "642 saves",
    save: "mercedes-snow",
  },
  {
    id: "breakfast",
    title: "Breakfast",
    detail: "28 saves",
    save: "breakfast-tray",
  },
  { id: "watches", title: "Watches", detail: "3 saves", save: "star-watch" },
  { id: "gardens", title: "Gardens", detail: "114 saves", save: "garden-gate" },
  {
    id: "type",
    title: "Type in pictures",
    detail: "19 saves",
    save: "motion-code",
  },
] as const;

const RULES = [
  {
    id: "slate",
    name: "Blue mornings",
    label: "Color is blue",
    saves: ["flower-painting", "fog-city", "glass-slab"],
  },
  {
    id: "clay",
    name: "Warm kitchen",
    label: "Color is clay",
    saves: ["breakfast-potatoes", "espresso-timer", "fried-chicken"],
  },
  {
    id: "moss",
    name: "Gardens",
    label: "Color is moss",
    saves: ["moss-forest", "garden-gate", "topiary-field"],
  },
] as const;

const TILES = [
  { id: "chrome-chair", top: 18, left: -20, width: 150, media: 188 },
  { id: "pink-roses", top: 28, left: 148, width: 168, media: 214 },
  { id: "flower-painting", top: 220, left: 4, width: 156, media: 150 },
  { id: "moss-forest", top: 252, left: 156, width: 176, media: 200 },
  { id: "breakfast-tray", top: 430, left: 28, width: 210, media: 150 },
] as const;

const DAYS = [4, 12, 18, 26] as const;
const MARKS: Record<number, string> = {
  4: "garden-gate",
  12: "breakfast-tray",
  18: "moss-forest",
  26: "chrome-chair",
};
const WEEK = [
  { id: "mon", label: "M" },
  { id: "tue", label: "T" },
  { id: "wed", label: "W" },
  { id: "thu", label: "T" },
  { id: "fri", label: "F" },
  { id: "sat", label: "S" },
  { id: "sun", label: "S" },
] as const;
const PADS = ["pad-a", "pad-b", "pad-c"] as const;

const TYPES = [
  { id: "jpg", label: "JPG", save: "chrome-chair" },
  { id: "png", label: "PNG", save: "gradient-cards" },
  { id: "mp4", label: "MP4", save: "breakfast-potatoes" },
  { id: "webp", label: "WEBP", save: "moss-forest" },
] as const;

const STEPS = ["queued", "importing", "done"] as const;
type Step = (typeof STEPS)[number];

const playSteps: Play<Step> = async (set, wait) => {
  await wait(800);
  set("queued");
  await wait(700);
  set("importing");
  await wait(900);
  set("done");
  await wait(1100);
};

export function ImportSteps() {
  const { ref, state } = useStage<Step>("done", playSteps);
  const current = STEPS.indexOf(state);
  return (
    <Stage nodeRef={ref} size="wide" mask="right">
      <Panel place="start">
        <ol className={styles.steps}>
          {STEPS.map((id, index) => {
            const phase =
              index < current ? "done" : index === current ? state : "wait";
            const title =
              id === "queued"
                ? "Queued"
                : id === "importing"
                  ? "Importing"
                  : "Done";
            const detail =
              id === "queued"
                ? "X archive · 2,104 saves"
                : id === "importing"
                  ? phase === "importing"
                    ? "Instagram · 1,204 of 1,876"
                    : "Instagram · 1,876 saves"
                  : "YouTube Takeout · 1,876 saved";
            return (
              <li key={id} className={styles.step} data-state={phase}>
                <span className={styles.marker} />
                <span className={styles.copy}>
                  <strong>{title}</strong>
                  <span className={styles.detail}>{detail}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </Panel>
    </Stage>
  );
}

export function ExtensionSave() {
  const { ref, state } = useStage(true, flip(true, 1400));
  const stack = ["breakfast-tray", "flower-painting", "chrome-chair"] as const;
  return (
    <Stage nodeRef={ref} size="small">
      <div className={styles.stack}>
        {stack.map((id) => (
          <span key={id} className={styles.stackCard}>
            <Thumb id={id} />
          </span>
        ))}
      </div>
      <div className={styles.pill} data-on={state || undefined}>
        {state ? (
          <IconCircleCheckFill size={16} />
        ) : (
          <span className={styles.spinner} />
        )}
        <IconGoogleChrome />
        {state ? "Saved to Pond" : "Saving from Chrome"}
      </div>
    </Stage>
  );
}

export function FirefoxAddon() {
  const { ref, state } = useStage(true, flip(true, 1300));
  return (
    <Stage nodeRef={ref} size="small">
      <Panel place="start">
        <div className={styles.toolbar}>
          <span className={styles.fox}>Fx</span>
          <span className={styles.copy}>
            <strong>Firefox</strong>
            <span className={styles.detail}>
              {findSave("moss-forest").title}
            </span>
          </span>
          <span className={styles.pill} data-on={state || undefined}>
            {state ? (
              <IconCircleCheckFill size={16} />
            ) : (
              <span className={styles.spinner} />
            )}
            {state ? "Saved" : "Save"}
          </span>
        </div>
      </Panel>
    </Stage>
  );
}

export function HistoryCount() {
  const { ref, state } = useStage(12480, countTo(12408, 12480, 12));
  return (
    <Stage nodeRef={ref} size="small">
      <div className={styles.heroNumber}>
        <strong>{formatCount(state)}</strong>
        <span>X bookmarks imported</span>
      </div>
    </Stage>
  );
}

export function TagFilter() {
  const { ref, state } = useStage(0, visit([2, 4, 5, 1, 0], 860));
  return (
    <Stage nodeRef={ref} size="wide" mask="right">
      <div className={styles.chips}>
        {TAGS.map((tag, index) => (
          <span
            key={tag.id}
            className={styles.chip}
            data-on={index === state || undefined}
          >
            {tag.label}
          </span>
        ))}
      </div>
      <div className={styles.tagPhoto}>
        {TAGS.map((tag, index) => (
          <div
            key={tag.id}
            className={styles.bleed}
            data-on={index === state || undefined}
          >
            <Thumb id={tag.save} />
          </div>
        ))}
      </div>
    </Stage>
  );
}

export function BoardList() {
  const { ref, state } = useStage(0, visit([1, 2, 3, 4, 0], 780));
  return (
    <Stage nodeRef={ref} size="tall">
      <Panel place="start" fill>
        <ul className={styles.rows}>
          {BOARDS.map((board, index) => (
            <li
              key={board.id}
              className={styles.row}
              data-on={index === state || undefined}
              data-done
            >
              <span className={styles.cover}>
                <Thumb id={board.save} />
              </span>
              <span className={styles.copy}>
                <strong>{board.title}</strong>
                <span className={styles.detail}>{board.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </Panel>
    </Stage>
  );
}

export function DuplicatePair() {
  const { ref, state } = useStage(true, flip(true, 1200));
  return (
    <Stage nodeRef={ref} size="small">
      <span className={styles.pair} data-role="back">
        <Thumb id="chrome-chair" />
      </span>
      <span
        className={styles.pair}
        data-role="front"
        data-stacked={state || undefined}
      >
        <Thumb id="chrome-chair" />
      </span>
      <span className={styles.badge}>
        {state ? "2 copies · Flowing chair" : "Comparing saves"}
      </span>
    </Stage>
  );
}

export function SmartFolder() {
  const { ref, state } = useStage(0, visit([1, 2, 0], 1100));
  const rule = RULES[state] ?? RULES[0];
  return (
    <Stage nodeRef={ref} size="wide">
      <Panel place="start">
        <div className={styles.folderHead}>
          <span className={styles.tile}>
            <IconFolderFill />
          </span>
          <span className={styles.copy}>
            <strong>{rule.name}</strong>
            <span className={styles.detail}>
              <IconSparkle size={14} /> {rule.label}
            </span>
          </span>
        </div>
        <div className={styles.strip}>
          {rule.saves.map((id) => (
            <span key={id} className={styles.stripCard}>
              <Thumb id={id} />
            </span>
          ))}
        </div>
      </Panel>
    </Stage>
  );
}

export function MoodBoard() {
  const { ref, state } = useStage(1, visit([0, 2, 3, 4, 1], 900));
  return (
    <Stage nodeRef={ref} size="tall" mask="bottom">
      <div className={styles.canvas}>
        {TILES.map((tile, index) => (
          <Card
            key={tile.id}
            save={findSave(tile.id)}
            eager={index === 0}
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
    </Stage>
  );
}

export function DragDrop() {
  const { ref, state } = useStage(true, flip(true, 1300));
  return (
    <Stage nodeRef={ref} size="wide">
      <div className={styles.drop} data-on={state || undefined}>
        <span className={styles.tile}>
          <IconFolderFill />
        </span>
        <span className={styles.copy}>
          <strong>Car Design</strong>
          <span className={styles.detail}>
            {state ? "643 saves" : "642 saves"}
          </span>
        </span>
      </div>
      <span className={styles.dragThumb} data-dropped={state || undefined}>
        <Thumb id="mercedes-snow" />
      </span>
    </Stage>
  );
}

export function SaveCalendar() {
  const { ref, state } = useStage(3, visit([0, 1, 2, 3], 860));
  const day = DAYS[state] ?? 26;
  const saveId = MARKS[day] ?? "chrome-chair";
  return (
    <Stage nodeRef={ref} size="wide">
      <div className={styles.month}>
        <strong>October 2026</strong>
        <div className={styles.week}>
          {WEEK.map((day) => (
            <span key={day.id}>{day.label}</span>
          ))}
        </div>
        <div className={styles.grid}>
          {PADS.map((id) => (
            <span key={id} />
          ))}
          {Array.from({ length: 31 }, (_, offset) => offset + 1).map((date) => (
            <span
              key={`oct-${date}`}
              className={styles.day}
              data-mark={MARKS[date] ? true : undefined}
              data-on={date === day || undefined}
            >
              {date}
            </span>
          ))}
        </div>
      </div>
      <div className={styles.preview}>
        <Thumb id={saveId} />
        <span>{findSave(saveId).title}</span>
      </div>
    </Stage>
  );
}

export function FileTypes() {
  const { ref, state } = useStage(0, visit([1, 2, 3, 0], 800));
  return (
    <Stage nodeRef={ref} size="small" mask="bottom">
      {TYPES.map((type, index) => (
        <div
          key={type.id}
          className={styles.bleed}
          data-on={index === state || undefined}
        >
          <Thumb id={type.save} />
        </div>
      ))}
      <div className={styles.typeBar}>
        {TYPES.map((type, index) => (
          <span
            key={type.id}
            className={styles.chip}
            data-on={index === state || undefined}
          >
            {type.label}
          </span>
        ))}
      </div>
    </Stage>
  );
}
