import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import {
  IconTextAFill18 as ContentIcon,
  IconCalendarFill18 as DateIcon,
  IconFileFill18 as FileIcon,
  IconMediaPlayFill18 as MediaIcon,
} from "@pond/icons/fill/18";
import { TrayCard } from "@pond/ui";
import { motion, useReducedMotion } from "motion/react";
import { type ReactNode, useId } from "react";
import { useDock } from "@/components/library/dock/lib/context";
import type { SortDir } from "@/hooks/use-filtered-saves";
import { type SortKey, useView } from "@/hooks/use-view";
import { snappySpring } from "@/lib/ui/motion";
import { dockMode } from "@/stores/dock-mode";
import styles from "./styles.module.css";

type KeyOption = { value: SortKey; label: string };
export type SortGroupId = "date" | "content" | "media" | "file";

const KEY_GROUPS: Array<{
  id: SortGroupId;
  section: "sort-date" | "sort-content" | "sort-media" | "sort-file";
  label: string;
  icon: ReactNode;
  options: KeyOption[];
}> = [
  {
    id: "date",
    section: "sort-date",
    label: "Date",
    icon: <DateIcon size={18} />,
    options: [
      { value: "savedAt", label: "Date Saved" },
      { value: "createdAt", label: "Date Added" },
      { value: "publishedAt", label: "Date Published" },
    ],
  },
  {
    id: "content",
    section: "sort-content",
    label: "Content",
    icon: <ContentIcon size={18} />,
    options: [
      { value: "title", label: "Title" },
      { value: "type", label: "Type" },
      { value: "creator", label: "Creator" },
      { value: "source", label: "Source" },
      { value: "tagName", label: "First Tag" },
      { value: "tagCount", label: "Tag Count" },
    ],
  },
  {
    id: "media",
    section: "sort-media",
    label: "Media",
    icon: <MediaIcon size={18} />,
    options: [
      { value: "duration", label: "Duration" },
      { value: "width", label: "Width" },
      { value: "height", label: "Height" },
      { value: "dimensions", label: "Dimensions" },
      { value: "aspectRatio", label: "Aspect Ratio" },
    ],
  },
  {
    id: "file",
    section: "sort-file",
    label: "File",
    icon: <FileIcon size={18} />,
    options: [
      { value: "fileSize", label: "Size" },
      { value: "fileCount", label: "Count" },
    ],
  },
];

const DIRECTIONS = [
  { value: "asc" as const, label: "Ascending" },
  { value: "desc" as const, label: "Descending" },
];

type SortState = { key: SortKey; dir: SortDir };

/** Cancel restores the sort from when the family opened; the main card unmounts while a subview is shown, so the snapshot outlives the components and clears when the dock leaves the sort family. */
let snapshot: SortState | null = null;
dockMode.subscribe((mode) => {
  if (!mode.startsWith("sort")) snapshot = null;
});

function useHighlightTransition() {
  const reduceMotion = useReducedMotion();
  return reduceMotion ? { duration: 0 } : snappySpring;
}

export function SortSection() {
  const { state, actions } = useView();
  const dock = useDock();
  const { key, dir } = state.sort;
  const groupId = useId();
  const highlightTransition = useHighlightTransition();
  snapshot ??= state.sort;

  return (
    <>
      <TrayCard.Header>
        <TrayCard.Title>Sort Library</TrayCard.Title>
        <TrayCard.Close />
        <TrayCard.Separator />
        <TrayCard.Description>
          Pick which detail orders your library.
        </TrayCard.Description>
      </TrayCard.Header>
      <div className={styles.groups}>
        {KEY_GROUPS.map((group) => {
          const selected = group.options.find((option) => option.value === key);
          return (
            <button
              key={group.id}
              type="button"
              className={styles.group}
              onClick={() => dock.openViewMenu(group.section)}
            >
              {selected ? (
                <motion.span
                  aria-hidden
                  layoutId={`${groupId}-groups`}
                  className={styles.highlight}
                  transition={highlightTransition}
                />
              ) : null}
              <span className={styles["group-icon"]}>{group.icon}</span>
              <span className={styles["group-label"]}>{group.label}</span>
              {selected ? (
                <span className={styles["group-value"]}>{selected.label}</span>
              ) : null}
            </button>
          );
        })}
      </div>
      <ToggleGroup aria-label="Sort direction" className={styles.directions}>
        {DIRECTIONS.map((direction) => {
          const active = direction.value === dir;
          return (
            <Toggle
              key={direction.value}
              title={direction.label}
              className={styles.direction}
              onClick={() => actions.setSort({ key, dir: direction.value })}
            >
              {active ? (
                <motion.span
                  aria-hidden
                  layoutId={`${groupId}-direction`}
                  className={styles["toggle-highlight"]}
                  transition={highlightTransition}
                />
              ) : null}
              <span className={styles.label}>{direction.label}</span>
            </Toggle>
          );
        })}
      </ToggleGroup>
      <TrayCard.Footer>
        <TrayCard.Cancel
          onClick={() => {
            if (snapshot) actions.setSort(snapshot);
          }}
        />
        <TrayCard.Confirm />
      </TrayCard.Footer>
    </>
  );
}

export function SortGroupSection({ group }: { group: SortGroupId }) {
  const { state, actions } = useView();
  const dock = useDock();
  const { key, dir } = state.sort;
  const groupId = useId();
  const highlightTransition = useHighlightTransition();
  snapshot ??= state.sort;

  const spec = KEY_GROUPS.find((entry) => entry.id === group);
  if (!spec) return null;

  return (
    <>
      <TrayCard.Header>
        <TrayCard.Back onClick={() => dock.openViewMenu("sort")} />
        <TrayCard.Title position="center">{spec.label}</TrayCard.Title>
        <TrayCard.Separator />
      </TrayCard.Header>
      <div className={styles.rows}>
        {spec.options.map((option) => {
          const active = option.value === key;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              className={styles.option}
              onClick={() => {
                actions.setSort({ key: option.value, dir });
                dock.openViewMenu("sort");
              }}
            >
              {active ? (
                <motion.span
                  aria-hidden
                  layoutId={`${groupId}-options`}
                  className={styles.highlight}
                  transition={highlightTransition}
                />
              ) : null}
              <span className={styles.label}>{option.label}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}
