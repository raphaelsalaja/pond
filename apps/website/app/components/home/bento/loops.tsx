"use client";

import { IconCircleCheckFill, IconMagnifier } from "@pond/icons";
import {
  IconInstagram,
  IconPinterest,
  IconTikTok,
  IconXTwitter,
  IconYoutube,
} from "@pond/icons/social-media";
import { BrandTile, Input } from "@pond/ui";
import { Message } from "@pond/ui/message";
import Image from "next/image";
import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useRef,
} from "react";
import { findSave, saveImage } from "@/lib/library";
import { FishMark } from "../../replica/fish-mark";
import sourceStyles from "../../replica/sources/styles.module.css";
import { type Play, usePosterLoop } from "./play";
import styles from "./styles.module.css";

const YOU = "user";
const FISH = "assistant";
const WORD = "stagger";
const SAVED_COUNT = 1876;
const SLIDES = [
  "chrome-chair",
  "breakfast-potatoes",
  "flower-painting",
  "motion-code",
  "stuffed-monkey",
] as const;
const BLUE = 2;
const RESULTS = [
  { id: "motion-code", match: true },
  { id: "stuffed-monkey", match: false },
  { id: "taped-banana", match: false },
] as const;
const LINES = [
  { text: "Crispy on the edges, then the yolk.", focus: "yolk" },
  { text: "Salt the potatoes before the pan is hot.", focus: "potatoes" },
  { text: "They take the color in about a minute.", focus: "color" },
  { text: "Turn them once, and leave them.", focus: "once" },
] as const;
const WATCHES = ["sculpted-watch", "star-watch", "watch-unboxing"] as const;
const STACK = [
  "chrome-chair",
  "flower-painting",
  "breakfast-potatoes",
] as const;

type Sync = "active" | "syncing" | "paused";
interface SourceBeat {
  index: number;
  phase: Sync;
  count: number;
}
type Step = "queued" | "importing" | "done";

const SOURCES: {
  name: string;
  source: string;
  Icon: typeof IconInstagram;
  count: string;
  paused?: boolean;
}[] = [
  {
    name: "Saved Posts",
    source: "Instagram",
    Icon: IconInstagram,
    count: "1,876",
  },
  { name: "Bookmarks", source: "X", Icon: IconXTwitter, count: "3,412" },
  {
    name: "Car Design",
    source: "Pinterest",
    Icon: IconPinterest,
    count: "642",
  },
  { name: "Watch Later", source: "YouTube", Icon: IconYoutube, count: "221" },
  {
    name: "Favorites",
    source: "TikTok",
    Icon: IconTikTok,
    count: "165",
    paused: true,
  },
];

const SOURCE_POSTER: SourceBeat = {
  index: 0,
  phase: "active",
  count: SAVED_COUNT,
};

const countLabel = new Intl.NumberFormat("en-US");

const playSync: Play<SourceBeat> = async (set, wait) => {
  await wait(1200);
  for (let index = 0; index < SOURCES.length; index += 1) {
    const ticking = index === 0;
    let count = ticking ? SAVED_COUNT - 55 : SAVED_COUNT;
    set({ index, phase: "syncing", count });
    if (ticking) {
      while (count < SAVED_COUNT) {
        count = Math.min(SAVED_COUNT, count + 11);
        set({ index, phase: "syncing", count });
        await wait(80);
      }
    } else {
      await wait(720);
    }
    set({ index, phase: "active", count: SAVED_COUNT });
    await wait(260);
  }
  set(SOURCE_POSTER);
};

const playColor: Play<number> = async (set, wait) => {
  await wait(900);
  for (const index of [3, 4, 1, BLUE]) {
    set(index);
    await wait(index === BLUE ? 1600 : 900);
  }
};

const playWord: Play<number> = async (set, wait) => {
  await wait(1500);
  for (let count = WORD.length - 1; count >= 0; count -= 1) {
    set(count);
    await wait(36);
  }
  await wait(240);
  for (let count = 1; count <= WORD.length; count += 1) {
    set(count);
    await wait(70);
  }
};

const playLines: Play<number> = async (set, wait) => {
  await wait(1400);
  for (let line = 1; line < LINES.length; line += 1) {
    set(line);
    await wait(1100);
  }
  set(0);
  await wait(400);
};

const playFish: Play<number> = async (set, wait) => {
  await wait(1400);
  set(0);
  await wait(200);
  for (let shown = 1; shown <= WATCHES.length; shown += 1) {
    set(shown);
    await wait(shown === WATCHES.length ? 0 : 180);
  }
};

const playSteps: Play<Step> = async (set, wait) => {
  await wait(1500);
  set("queued");
  await wait(700);
  set("importing");
  await wait(1200);
  set("done");
  await wait(400);
};

const playSaved: Play<boolean> = async (set, wait) => {
  await wait(1800);
  set(false);
  await wait(1400);
  set(true);
  await wait(400);
};

function StatusGlyph({ status }: { status: Sync }) {
  return (
    <svg
      className={sourceStyles.glyph}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      aria-hidden
    >
      <circle
        cx="8"
        cy="8"
        r="6"
        fill={status === "active" ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.5"
        opacity={status === "active" ? 1 : 0.45}
      />
      {status === "syncing" ? (
        <circle
          className={sourceStyles.spin}
          cx="8"
          cy="8"
          r="6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeDasharray="65 100"
          pathLength="100"
        />
      ) : null}
      {status === "active" ? (
        <path
          d="M5.2 8.2 7 10 10.8 6"
          fill="none"
          stroke="var(--ds-gray-1)"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      {status === "paused" ? (
        <>
          <rect
            x="5.55"
            y="5.35"
            width="1.55"
            height="5.3"
            rx="0.4"
            fill="currentColor"
          />
          <rect
            x="8.9"
            y="5.35"
            width="1.55"
            height="5.3"
            rx="0.4"
            fill="currentColor"
          />
        </>
      ) : null}
    </svg>
  );
}

function Thumb({ id }: { id: string }) {
  const save = findSave(id);
  return (
    <span className={styles.shot}>
      <Image src={saveImage(save)} alt="" fill sizes="180px" />
    </span>
  );
}

function Panel({
  children,
  nodeRef,
  place,
  fill = false,
}: {
  children: ReactNode;
  nodeRef: RefObject<HTMLDivElement | null>;
  place: "start" | "end" | "bottom-start" | "bottom-end";
  fill?: boolean;
}) {
  return (
    <div
      ref={nodeRef}
      className={styles.crop}
      data-place={place}
      data-fill={fill || undefined}
      aria-hidden
    >
      {children}
    </div>
  );
}

export function StatusDot() {
  const ref = useRef<HTMLDivElement>(null);
  const beat = usePosterLoop(SOURCE_POSTER, playSync, ref);

  return (
    <Panel nodeRef={ref} place="start" fill>
      <ul className={styles.sourceList}>
        {SOURCES.map((row, index) => {
          const on = index === beat.index;
          const phase: Sync = on
            ? beat.phase
            : row.paused
              ? "paused"
              : "active";
          const count =
            on && row.source === "Instagram"
              ? countLabel.format(beat.count)
              : row.count;
          const label =
            phase === "syncing"
              ? "Syncing"
              : phase === "paused"
                ? "Paused"
                : "Active";
          return (
            <li key={row.name} data-on={on || undefined}>
              <BrandTile size={40}>
                <row.Icon width={40} height={40} />
              </BrandTile>
              <span className={styles.rowCopy}>
                <strong>{row.name}</strong>
                <span>
                  <span className={sourceStyles.mark} data-status={phase}>
                    <StatusGlyph status={phase} />
                  </span>
                  {row.source} · {count} · {label}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

export function ColorDots() {
  const ref = useRef<HTMLDivElement>(null);
  const center = usePosterLoop(BLUE, playColor, ref);

  return (
    <div ref={ref} className={styles.carousel} aria-hidden>
      <div
        className={styles.track}
        style={{ "--center": center } as CSSProperties}
      >
        {SLIDES.map((id, index) => (
          <span
            key={id}
            className={styles.slide}
            data-center={index === center || undefined}
          >
            <Thumb id={id} />
          </span>
        ))}
      </div>
    </div>
  );
}

export function SearchWord() {
  const ref = useRef<HTMLDivElement>(null);
  const count = usePosterLoop(WORD.length, playWord, ref);
  const found = count === WORD.length;

  return (
    <Panel nodeRef={ref} place="start">
      <Input.Root className={styles.field} size="md" variant="secondary">
        <Input.Icon>
          <IconMagnifier size={16} />
        </Input.Icon>
        <Input.Field
          readOnly
          tabIndex={-1}
          value={WORD.slice(0, count)}
          placeholder="Search"
        />
      </Input.Root>
      <ul className={styles.hits}>
        {RESULTS.map((result) => {
          const save = findSave(result.id);
          return (
            <li key={result.id} data-on={(found && result.match) || undefined}>
              <Thumb id={result.id} />
              <span className={styles.hit}>{save.title}</span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

export function Waveform() {
  const ref = useRef<HTMLDivElement>(null);
  const line = usePosterLoop(0, playLines, ref);

  return (
    <Panel nodeRef={ref} place="bottom-start">
      <div className={styles.mask}>
        <div
          className={styles.script}
          style={{ "--line": line } as CSSProperties}
        >
          {LINES.map((entry, index) => (
            <p key={entry.focus}>
              {entry.text.slice(0, entry.text.indexOf(entry.focus))}
              <span data-on={index === line || undefined}>{entry.focus}</span>
              {entry.text.slice(
                entry.text.indexOf(entry.focus) + entry.focus.length,
              )}
            </p>
          ))}
        </div>
      </div>
    </Panel>
  );
}

export function FishMoment() {
  const ref = useRef<HTMLDivElement>(null);
  const shown = usePosterLoop(WATCHES.length, playFish, ref);

  return (
    <Panel nodeRef={ref} place="start" fill>
      <div className={styles.chatHead}>
        <FishMark color="orange" species="koi" size={48} mood="pleased" />
        <span className={styles.chatMeta}>
          <strong>Koi</strong>
          <span>Apple Intelligence</span>
        </span>
      </div>
      <div className={styles.thread}>
        <Message.View role={YOU}>Find the watches.</Message.View>
        <Message.View role={FISH}>
          <Message.Bubble>Three from this week.</Message.Bubble>
        </Message.View>
        <div className={styles.watches}>
          {WATCHES.map((id, index) => (
            <span
              key={id}
              className={styles.watch}
              data-on={index < shown || undefined}
            >
              <Thumb id={id} />
            </span>
          ))}
        </div>
      </div>
      <Input.Root className={styles.composer} size="md" variant="secondary">
        <Input.Field
          readOnly
          tabIndex={-1}
          placeholder="Ask about your Saves"
        />
      </Input.Root>
    </Panel>
  );
}

const STEP_ORDER = ["queued", "importing", "done"] as const;

export function ProgressTicks() {
  const ref = useRef<HTMLDivElement>(null);
  const step = usePosterLoop<Step>("done", playSteps, ref);
  const current = STEP_ORDER.indexOf(step);

  return (
    <Panel nodeRef={ref} place="end">
      <ol className={styles.steps}>
        {STEP_ORDER.map((id, index) => {
          const state =
            index < current ? "done" : index === current ? step : "queued";
          const detail =
            id === "queued"
              ? "2,104 saves"
              : id === "importing"
                ? state === "importing"
                  ? "1,204 of 1,876"
                  : "1,876 saves"
                : "1,876 saved";
          return (
            <li key={id} data-state={state}>
              <span className={styles.marker} />
              <span className={styles.rowCopy}>
                <strong>
                  {id === "queued"
                    ? "Queued"
                    : id === "importing"
                      ? "Importing"
                      : "Done"}
                </strong>
                <span>
                  {id === "queued"
                    ? "X archive"
                    : id === "importing"
                      ? "Instagram export"
                      : "YouTube Takeout"}
                  {" · "}
                  {detail}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}

export function SavedMark() {
  const ref = useRef<HTMLDivElement>(null);
  const saved = usePosterLoop(true, playSaved, ref);

  return (
    <Panel nodeRef={ref} place="start">
      <div className={styles.stack}>
        {STACK.map((id) => (
          <Thumb key={id} id={id} />
        ))}
      </div>
      <div className={styles.pill} data-saved={saved || undefined}>
        {saved ? (
          <IconCircleCheckFill size={16} />
        ) : (
          <span className={styles.spinner} />
        )}
        {saved ? "Saved to Pond" : "Saving…"}
      </div>
    </Panel>
  );
}
