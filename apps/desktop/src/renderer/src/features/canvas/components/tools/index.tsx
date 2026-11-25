import {
  IconCode2,
  IconCursor,
  IconEraser,
  IconFigures,
  IconHand,
  IconHighlighter,
  IconImage,
  IconMindMap,
  IconNoteEdit,
  IconPencil,
  IconPinTack,
  IconSection,
  IconTable,
  IconText,
} from "@pond/icons";
import { Button, Keyboard, Toolbar, Tooltip } from "@pond/ui";
import type { CanvasColor, CanvasOutline } from "@shared/canvas-contracts";
import { useLayoutEffect, useRef } from "react";
import { platformGlyphs } from "@/shared/lib/shortcuts";
import { AddSaves } from "../add-saves";
import { Picker } from "../picker";
import styles from "./styles.module.css";

export type CanvasTool =
  | "select"
  | "hand"
  | "note"
  | "figure"
  | "text"
  | "pen"
  | "section"
  | "table"
  | "code"
  | "topic";

function shiftedTool(key: string): CanvasTool | undefined {
  switch (key.toLowerCase()) {
    case "s":
      return "section";
    case "t":
      return "table";
    case "c":
      return "code";
    case "m":
      return "topic";
    default:
      return undefined;
  }
}

export function toolForKey(
  key: string,
  shift: boolean,
): CanvasTool | undefined {
  if (shift) return shiftedTool(key);
  switch (key.toLowerCase()) {
    case "v":
      return "select";
    case "h":
      return "hand";
    case "s":
      return "note";
    case "r":
      return "figure";
    case "t":
      return "text";
    case "m":
      return "pen";
    default:
      return undefined;
  }
}

export type PenMode = "marker" | "highlight" | "erase";

/** Tools that drop an item. They can stay selected. */
export const STAMP_TOOLS: ReadonlySet<CanvasTool> = new Set([
  "note",
  "figure",
  "text",
  "section",
  "table",
  "code",
  "topic",
]);

/** Tools whose items take a color from the palette. */
export const COLORED_TOOLS: ReadonlySet<CanvasTool> = new Set([
  "note",
  "pen",
  "figure",
  "section",
  "table",
  "topic",
]);

const MODES: ReadonlyArray<{
  tool: CanvasTool;
  label: string;
  shortcut: ReadonlyArray<string>;
  Icon: typeof IconCursor;
}> = [
  { tool: "select", label: "Select", shortcut: ["V"], Icon: IconCursor },
  { tool: "hand", label: "Hand", shortcut: ["H"], Icon: IconHand },
  { tool: "pen", label: "Marker", shortcut: ["M"], Icon: IconHighlighter },
  { tool: "note", label: "Sticky Note", shortcut: ["S"], Icon: IconNoteEdit },
  { tool: "figure", label: "Shape", shortcut: ["R"], Icon: IconFigures },
  { tool: "text", label: "Text", shortcut: ["T"], Icon: IconText },
  {
    tool: "section",
    label: "Section",
    shortcut: ["⇧", "S"],
    Icon: IconSection,
  },
  { tool: "table", label: "Table", shortcut: ["⇧", "T"], Icon: IconTable },
  { tool: "code", label: "Code Block", shortcut: ["⇧", "C"], Icon: IconCode2 },
  { tool: "topic", label: "Mind Map", shortcut: ["⇧", "M"], Icon: IconMindMap },
];

function place(mark: HTMLElement, button: HTMLElement, animate: boolean) {
  if (!animate) mark.dataset.snap = "";
  mark.style.translate = `${button.offsetLeft}px ${button.offsetTop}px`;
  mark.style.width = `${button.offsetWidth}px`;
  mark.style.height = `${button.offsetHeight}px`;
  if (!animate) {
    void mark.offsetWidth;
    delete mark.dataset.snap;
  }
}

const PENS: ReadonlyArray<{
  mode: PenMode;
  label: string;
  Icon: typeof IconPencil;
}> = [
  { mode: "marker", label: "Marker", Icon: IconPencil },
  { mode: "highlight", label: "Highlighter", Icon: IconHighlighter },
  { mode: "erase", label: "Eraser", Icon: IconEraser },
];

interface ToolsProps {
  tool: CanvasTool;
  color: CanvasColor;
  outline: CanvasOutline;
  penMode: PenMode;
  kept: boolean;
  showColors: boolean;
  showOutlines: boolean;
  onCanvas: ReadonlySet<string>;
  onTool: (tool: CanvasTool) => void;
  onColor: (color: CanvasColor) => void;
  onOutline: (outline: CanvasOutline) => void;
  onPenMode: (mode: PenMode) => void;
  onKeep: (kept: boolean) => void;
  onAddSaves: (saveIds: Array<string>) => void;
}

export function Tools({
  tool,
  color,
  outline,
  penMode,
  kept,
  showColors,
  showOutlines,
  onCanvas,
  onTool,
  onColor,
  onOutline,
  onPenMode,
  onKeep,
  onAddSaves,
}: ToolsProps) {
  const indicator = useRef<HTMLSpanElement>(null);
  const buttons = useRef(new Map<CanvasTool, HTMLElement>());
  const placed = useRef(false);

  useLayoutEffect(() => {
    const mark = indicator.current;
    const button = buttons.current.get(tool);
    if (!mark || !button) return;
    place(mark, button, placed.current);
    placed.current = true;
  }, [tool]);

  useLayoutEffect(() => {
    const mark = indicator.current;
    const bar = mark?.parentElement;
    if (!mark || !bar) return;
    const observer = new ResizeObserver(() => {
      const active = bar.querySelector<HTMLElement>("[data-pressed]");
      if (active) place(mark, active, false);
    });
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);

  return (
    <Tooltip.Group>
      <div className={styles.dock}>
        <Toolbar.Root className={styles.bar} aria-label="Canvas Tools">
          <span
            ref={indicator}
            className={styles.indicator}
            aria-hidden="true"
          />
          {MODES.map(({ tool: mode, label, shortcut, Icon }) => (
            <Tooltip
              key={mode}
              label={label}
              shortcut={<Keyboard.Cluster keys={platformGlyphs(shortcut)} />}
              side="top"
            >
              <Toolbar.Button
                ref={(node: HTMLButtonElement | null) => {
                  if (node) buttons.current.set(mode, node);
                  else buttons.current.delete(mode);
                }}
                render={
                  <Button
                    icon
                    size="sm"
                    variant="text"
                    rounding="full"
                    aria-label={label}
                  />
                }
                className={styles.mode}
                data-pressed={tool === mode || undefined}
                aria-pressed={tool === mode}
                onClick={() => onTool(mode)}
              >
                <Icon />
              </Toolbar.Button>
            </Tooltip>
          ))}
          <AddSaves onCanvas={onCanvas} onAdd={onAddSaves}>
            <Toolbar.Button
              render={
                <Button
                  icon
                  size="sm"
                  variant="text"
                  rounding="full"
                  aria-label="Add Saves"
                />
              }
              className={styles.mode}
            >
              <IconImage />
            </Toolbar.Button>
          </AddSaves>
        </Toolbar.Root>
        <div
          className={styles.palette}
          data-open={
            showColors ||
            showOutlines ||
            tool === "pen" ||
            STAMP_TOOLS.has(tool) ||
            undefined
          }
          inert={
            !(
              showColors ||
              showOutlines ||
              tool === "pen" ||
              STAMP_TOOLS.has(tool)
            )
          }
        >
          {tool === "pen" ? (
            <fieldset className={styles.choices} aria-label="Marker">
              {PENS.map(({ mode, label, Icon }) => (
                <Tooltip key={mode} label={label} side="top">
                  <Button
                    rounding="full"
                    icon
                    size="sm"
                    variant="ghost"
                    aria-label={label}
                    aria-pressed={penMode === mode}
                    data-pressed={penMode === mode || undefined}
                    onClick={() => onPenMode(mode)}
                  >
                    <Icon />
                  </Button>
                </Tooltip>
              ))}
            </fieldset>
          ) : null}
          {STAMP_TOOLS.has(tool) ? (
            <fieldset className={styles.choices} aria-label="Placement">
              <Tooltip label="Keep Selected" side="top">
                <Button
                  rounding="full"
                  icon
                  size="sm"
                  variant="ghost"
                  aria-label="Keep Selected"
                  aria-pressed={kept}
                  data-pressed={kept || undefined}
                  onClick={() => onKeep(!kept)}
                >
                  <IconPinTack />
                </Button>
              </Tooltip>
            </fieldset>
          ) : null}
          <fieldset className={styles.choices} aria-label="Style">
            {showOutlines ? (
              <Picker.Outlines value={outline} size="sm" onChange={onOutline} />
            ) : null}
            <Picker.Colors value={color} size="sm" onChange={onColor} />
          </fieldset>
        </div>
      </div>
    </Tooltip.Group>
  );
}
