import {
  IconCursor,
  IconFigures,
  IconHand,
  IconHighlighter,
  IconImage,
  IconNoteEdit,
  IconText,
} from "@pond/icons";
import { Button } from "@pond/ui/button";
import { mix } from "../../motion";
import { CANVAS_COLORS, INK } from "../board/colors";
import type { CanvasColor } from "../board/colors";
import styles from "./styles.module.css";

/** The dock's buttons, in order, as the board's tools component lists them. */
export const CANVAS_TOOLS = [
  { label: "Select", Icon: IconCursor },
  { label: "Hand", Icon: IconHand },
  { label: "Marker", Icon: IconHighlighter },
  { label: "Sticky Note", Icon: IconNoteEdit },
  { label: "Shape", Icon: IconFigures },
  { label: "Text", Icon: IconText },
  { label: "Add Saves", Icon: IconImage },
] as const;

export type CanvasTool = (typeof CANVAS_TOOLS)[number]["label"];

export const toolIndex = (tool: CanvasTool) =>
  CANVAS_TOOLS.findIndex((entry) => entry.label === tool);

interface ToolsProps {
  /** The active tool's index; fractions slide the highlight between buttons. */
  active: number;
  /** How open the color palette is, 0 to 1. */
  palette?: number;
  color?: CanvasColor;
}

/** The canvas tools dock floating at the bottom of the board, with its color palette above. */
export function Tools({ active, palette = 0, color = "yellow" }: ToolsProps) {
  return (
    <div className={styles.dock}>
      <div className={styles.bar}>
        <span
          className={styles.indicator}
          style={{ translate: `${4 + active * 34}px 4px` }}
        />
        {CANVAS_TOOLS.map(({ label, Icon }) => (
          <Button key={label} icon size="md" variant="text" aria-label={label}>
            <Icon />
          </Button>
        ))}
      </div>
      <div
        className={styles.palette}
        style={{
          opacity: palette,
          visibility: palette <= 0.002 ? "hidden" : undefined,
          scale: `${mix(0.96, 1, palette)}`,
          translate: `-50% ${(1 - palette) * 6}px`,
        }}
      >
        {CANVAS_COLORS.map((swatch) => (
          <Button
            key={swatch}
            icon
            size="sm"
            variant="text"
            aria-label={swatch}
          >
            <span
              className={styles.swatch}
              data-pressed={swatch === color || undefined}
              style={{ "--swatch": INK[swatch] }}
            />
          </Button>
        ))}
      </div>
    </div>
  );
}
