import { IconCaretRightFill } from "@pond/icons";
import { Keyboard, Loader } from "@pond/ui";
import {
  type CSSProperties,
  type MouseEvent,
  memo,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import { ShortcutKeys } from "@/shared/components/shortcut-keys";
import type { MatchRange } from "../score";
import type { MenuModel, RankedEntry } from "../types";
import { useResultsHeight } from "../use-results-height";
import styles from "./styles.module.css";

export const RESULTS_ID = "pond-command-menu-results";

interface ResultsListProps {
  model: MenuModel;
  activeIndex: number;
  pageKey: string;
  direction?: "forward" | "back";
  /** The input lost focus, so the active row shows a fainter fill. */
  inactive: boolean;
  keyboard: RefObject<boolean>;
  onActivate: (index: number) => void;
  onExecute: (index: number) => void;
}

function Highlight({
  text,
  ranges,
}: {
  text: string;
  ranges: readonly MatchRange[];
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

interface EntryRowProps {
  item: RankedEntry;
  index: number;
  active: boolean;
  keyboard: RefObject<boolean>;
  onActivate: (index: number) => void;
  onExecute: (index: number) => void;
}

const EntryRow = memo(function EntryRow({
  item,
  index,
  active,
  keyboard,
  onActivate,
  onExecute,
}: EntryRowProps) {
  const { entry, ranges } = item;
  function onMouseMove(event: MouseEvent) {
    if (keyboard.current) return;
    if (event.movementX === 0 && event.movementY === 0) return;
    onActivate(index);
  }
  return (
    <button
      id={entry.id}
      type="button"
      role="option"
      tabIndex={-1}
      aria-selected={active}
      data-command-index={index}
      className={styles.item}
      data-tall={entry.tall || undefined}
      onMouseMove={onMouseMove}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onExecute(index)}
    >
      <span className={styles.icon}>{entry.icon}</span>
      <span className={styles.copy}>
        <span
          className={styles.label}
          data-matched={ranges.length > 0 || undefined}
        >
          <Highlight text={entry.label} ranges={ranges} />
        </span>
        {entry.detail ? (
          <span className={styles.detail}>{entry.detail}</span>
        ) : null}
      </span>
      {entry.shortcut ? (
        <span className={styles.shortcut}>
          <ShortcutKeys id={entry.shortcut} density="flat" />
        </span>
      ) : null}
      {active && entry.actions ? (
        <Keyboard.Key className={styles.hint} density="flat" aria-hidden>
          ⇥
        </Keyboard.Key>
      ) : null}
      {entry.page ? (
        <IconCaretRightFill
          className={styles.indicator}
          size={10}
          aria-hidden
        />
      ) : null}
    </button>
  );
});

export function ResultsList({
  model,
  activeIndex,
  pageKey,
  direction,
  inactive,
  keyboard,
  onActivate,
  onExecute,
}: ResultsListProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const height = useResultsHeight(model.rows, pageKey);
  const [sized, setSized] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setSized(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (!keyboard.current) return;
    viewportRef.current
      ?.querySelector<HTMLElement>(`[data-command-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, keyboard]);

  const style: CSSProperties & { "--results-height": string } = {
    "--results-height": `${height}px`,
  };
  const footerIndex = model.entries.length - 1;

  return (
    <div
      id={RESULTS_ID}
      role="listbox"
      className={styles.root}
      data-inactive={inactive || undefined}
    >
      <div
        ref={viewportRef}
        className={styles.results}
        data-sized={sized || undefined}
        style={style}
      >
        <div className={styles.edge} data-edge="top" aria-hidden />
        <div
          key={pageKey}
          className={styles.content}
          data-direction={direction}
        >
          {model.rows.map((row) => {
            if (row.kind === "group") {
              return (
                <div
                  key={row.key}
                  role="presentation"
                  className={styles.group}
                  data-divided={row.divided || undefined}
                >
                  {row.label}
                </div>
              );
            }
            if (row.kind === "status") {
              return (
                <div
                  key={row.key}
                  role="presentation"
                  className={styles.status}
                  data-busy={row.busy || undefined}
                >
                  {row.busy ? (
                    <Loader.Spinner className={styles.spinner} />
                  ) : null}
                  {row.label}
                </div>
              );
            }
            return (
              <EntryRow
                key={row.key}
                item={row.item}
                index={row.index}
                active={row.index === activeIndex}
                keyboard={keyboard}
                onActivate={onActivate}
                onExecute={onExecute}
              />
            );
          })}
        </div>
        <div className={styles.edge} data-edge="bottom" aria-hidden />
      </div>
      {model.footer ? (
        <div className={styles.footer}>
          <EntryRow
            item={model.footer}
            index={footerIndex}
            active={footerIndex === activeIndex}
            keyboard={keyboard}
            onActivate={onActivate}
            onExecute={onExecute}
          />
        </div>
      ) : null}
    </div>
  );
}
