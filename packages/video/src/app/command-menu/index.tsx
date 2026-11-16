import { IconCaretRight, IconMagnifier } from "@pond/icons";
import { Button, Keyboard } from "@pond/ui";
import type { CSSProperties, ReactNode } from "react";
import { ease, mix, progress } from "../../motion";
import { APP_WIDTH } from "../geometry";
import styles from "./styles.module.css";

/** The popup's frame in app coordinates, as `command-menu/styles.module.css` places it in a 667px-tall window. */
export const COMMAND_MENU = {
  left: (APP_WIDTH - 680) / 2,
  top: 73,
  width: 680,
};

const FIELD = 48;
const CRUMBS = 36;
const PADDING = 12;
const GROUP = 30;
const DIVIDED = 42;
const ROW = 32;
const TALL = 48;
const FOOTER = 44;
const MAX_RESULTS = 370;
const RESIZE = 200;
const OPEN = 200;
const CLOSE = 150;
const BLINK = 530;

export type MatchRange = readonly [start: number, end: number];

export interface PaletteEntry {
  id: string;
  label: string;
  icon: ReactNode;
  detail?: string;
  /** One chord's glyphs per step, as `chordGlyphs` returns them. Two steps read "G then L". */
  shortcut?: string[][];
  /** A save row with a media preview. */
  tall?: boolean;
  /** Opens a page, so it shows the caret. */
  page?: boolean;
  /** Has secondary actions, so the active row shows the Tab key. */
  actions?: boolean;
  ranges?: readonly MatchRange[];
}

export type PaletteRow =
  | { kind: "group"; label: string; divided: boolean }
  | { kind: "entry"; entry: PaletteEntry; index: number };

/** One settled state of the menu, from `at` until the next state. */
export interface PaletteState {
  at: number;
  query: string;
  placeholder: string;
  crumb?: { title: string; context?: string };
  rows: readonly PaletteRow[];
  footer?: PaletteEntry;
  active: number;
  /** Changes when a page opens or closes, so the content slides in. */
  page: string;
  direction?: "forward" | "back";
  /** The query is selected, as after Command-A. */
  selected?: boolean;
}

function resultsHeight(rows: readonly PaletteRow[]) {
  let height = PADDING;
  for (const row of rows) {
    if (row.kind === "group") height += row.divided ? DIVIDED : GROUP;
    else height += row.entry.tall ? TALL : ROW;
  }
  return Math.min(MAX_RESULTS, height);
}

function Highlight({
  text,
  ranges = [],
}: {
  text: string;
  ranges?: readonly MatchRange[];
}) {
  if (ranges.length === 0) return text;
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push(
      <mark key={start} className={styles.match}>
        {text.slice(start, end)}
      </mark>,
    );
    cursor = end;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

function Entry({ entry, active }: { entry: PaletteEntry; active: boolean }) {
  const matched = (entry.ranges?.length ?? 0) > 0;
  return (
    <span
      className={styles.item}
      data-active={active || undefined}
      data-tall={entry.tall || undefined}
    >
      <span className={styles.icon}>{entry.icon}</span>
      <span className={styles.copy}>
        <span className={styles.label} data-matched={matched || undefined}>
          <Highlight text={entry.label} ranges={entry.ranges} />
        </span>
        {entry.detail ? (
          <span className={styles.detail}>{entry.detail}</span>
        ) : null}
      </span>
      {entry.shortcut ? (
        <span className={styles.shortcut}>
          {entry.shortcut.map((step, i) => (
            <span key={step.join("+")} className={styles.sequence}>
              {i > 0 ? <span className={styles.then}>then</span> : null}
              <Keyboard.Cluster keys={step} density="flat" />
            </span>
          ))}
        </span>
      ) : null}
      {active && entry.actions ? (
        <Keyboard.Key className={styles.hint} density="flat">
          ⇥
        </Keyboard.Key>
      ) : null}
      {entry.page ? (
        <IconCaretRight className={styles.indicator} size={10} />
      ) : null}
    </span>
  );
}

/** A save preview fitted to the row's 32px slot at the save's own aspect ratio. */
export function PaletteThumb({ src, aspect }: { src: string; aspect: number }) {
  /** SAFETY: React forwards custom properties, but `CSSProperties` has no `--*` keys. */
  const style = {
    "--thumb-width": Math.min(1, aspect),
    "--thumb-height": Math.min(1, 1 / aspect),
  } as CSSProperties;
  return (
    <span className={styles.slot}>
      <span className={styles.thumb} style={style}>
        <img src={src} alt="" />
      </span>
    </span>
  );
}

interface CommandMenuProps {
  t: number;
  open: number;
  close: number;
  states: readonly PaletteState[];
}

/** Pond's command menu over a dimmed window: it resizes to each state's rows and slides pages in. Children of `App.Window`. */
export function CommandMenu({ t, open, close, states }: CommandMenuProps) {
  if (t < open || t > close + CLOSE) return null;
  let index = 0;
  for (let i = 0; i < states.length; i++) {
    if ((states[i]?.at ?? Infinity) <= t) index = i;
  }
  const state = states[index];
  if (!state) return null;
  const previous = states[index - 1] ?? state;

  const shown = ease.out(progress(t, open, OPEN));
  const hidden = ease.out(progress(t, close, CLOSE));
  const visible = shown * (1 - hidden);
  const scale = mix(1.05, 1, shown) * mix(1, 1.05, hidden);

  const height = (s: PaletteState) =>
    FIELD +
    (s.crumb ? CRUMBS : 0) +
    resultsHeight(s.rows) +
    (s.footer ? FOOTER : 0);
  const resize = ease.outQuint(progress(t, state.at, RESIZE));
  const results = mix(
    resultsHeight(previous.rows),
    resultsHeight(state.rows),
    resize,
  );
  const total = mix(height(previous), height(state), resize);

  const turned = previous.page !== state.page;
  const slide = turned ? ease.outQuint(progress(t, state.at, RESIZE)) : 1;
  const offset = (state.direction === "back" ? -8 : 8) * (1 - slide);

  const typing = t - state.at < BLINK;
  const caret = typing || Math.floor((t - state.at) / BLINK) % 2 === 1;
  const footerIndex = state.rows.filter((row) => row.kind === "entry").length;

  return (
    <>
      <div className={styles.backdrop} style={{ opacity: visible }} />
      <div
        className={styles.popup}
        style={{
          left: COMMAND_MENU.left,
          top: COMMAND_MENU.top,
          width: COMMAND_MENU.width,
          height: total,
          opacity: visible,
          transform: `scale(${scale})`,
        }}
      >
        <div className={styles.search}>
          {state.crumb ? (
            <div className={styles.crumbs}>
              <Button variant="tertiary" size="xs" rounding="full">
                {state.crumb.context ? (
                  <>
                    <span className={styles.context}>
                      {state.crumb.context}
                    </span>
                    <span className={styles.context}>·</span>
                  </>
                ) : null}
                <span>{state.crumb.title}</span>
              </Button>
            </div>
          ) : null}
          <div className={styles.field}>
            <IconMagnifier className={styles.magnifier} />
            <span className={styles.input}>
              {state.query ? (
                <span
                  className={styles.query}
                  data-selected={state.selected || undefined}
                >
                  {state.query}
                </span>
              ) : null}
              <span
                className={styles.caret}
                style={{ opacity: caret && !state.selected ? 1 : 0 }}
              />
              {state.query ? null : (
                <span className={styles.placeholder}>{state.placeholder}</span>
              )}
            </span>
            <Keyboard.Key>esc</Keyboard.Key>
          </div>
        </div>
        <div className={styles.results} style={{ height: results }}>
          <div
            key={state.page}
            className={styles.content}
            style={{
              opacity: slide,
              transform: `translateX(${offset}px)`,
            }}
          >
            {state.rows.map((row) =>
              row.kind === "group" ? (
                <div
                  key={`group:${row.label}`}
                  className={styles.group}
                  data-divided={row.divided || undefined}
                >
                  {row.label}
                </div>
              ) : (
                <Entry
                  key={row.entry.id}
                  entry={row.entry}
                  active={row.index === state.active}
                />
              ),
            )}
          </div>
        </div>
        {state.footer ? (
          <div className={styles.footer}>
            <Entry entry={state.footer} active={state.active === footerIndex} />
          </div>
        ) : null}
      </div>
    </>
  );
}
