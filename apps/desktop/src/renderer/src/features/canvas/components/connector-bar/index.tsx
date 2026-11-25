import {
  IconArrowLeft,
  IconArrowRight,
  IconLineWeight,
  IconText,
  IconTrash,
} from "@pond/icons";
import { useStore, ViewportPortal } from "@xyflow/react";
import {
  capItems,
  connectorStrokeItems,
  LINE_ICONS,
  lineItems,
} from "../../lib/board-menu";
import { capsOf, withCap } from "../../lib/document";
import type { ConnectorStyle } from "../../lib/document";
import { Bar } from "../bar";
import { useBoard } from "../board/context";
import styles from "./styles.module.css";

interface ConnectorBarProps {
  id: string;
  x: number;
  y: number;
  style: ConnectorStyle;
}

export function ConnectorBar({ id, x, y, style }: ConnectorBarProps) {
  const board = useBoard();
  const zoom = useStore((state) => state.transform[2]);
  const caps = capsOf(style);
  const LineIcon = LINE_ICONS[style.line];
  return (
    <ViewportPortal>
      <div
        className={styles.anchor}
        style={{
          transform: `translate(${x}px, ${y}px) scale(${1 / zoom}) translate(-50%, calc(-100% - 28px))`,
        }}
      >
        <Bar.Root className="nodrag nopan" hidden={board.barsHidden}>
          <Bar.Group aria-label="Line">
            <Bar.Colors
              value={style.color}
              onChange={(color) => board.restyle({ color })}
            />
            <Bar.Menu
              label="Stroke"
              buildItems={() =>
                connectorStrokeItems(
                  { weight: style.weight ?? "thin", dashed: style.dashed },
                  board.restyle,
                )
              }
            >
              <IconLineWeight />
            </Bar.Menu>
            <Bar.Action
              label={style.label ? "Edit Label" : "Add Label"}
              shortcut={["↵"]}
              onClick={() => board.startEditing(id)}
            >
              <IconText />
            </Bar.Action>
          </Bar.Group>
          <Bar.Group aria-label="Path">
            <Bar.Menu
              label="Start"
              buildItems={() =>
                capItems(caps.start, (cap) =>
                  board.restyle(withCap("start", cap)),
                )
              }
            >
              <IconArrowLeft />
            </Bar.Menu>
            <Bar.Menu
              label="Line Shape"
              buildItems={() =>
                lineItems(style.line, (line) => board.restyle({ line }))
              }
            >
              <LineIcon />
            </Bar.Menu>
            <Bar.Menu
              label="End"
              buildItems={() =>
                capItems(caps.end, (cap) => board.restyle(withCap("end", cap)))
              }
            >
              <IconArrowRight />
            </Bar.Menu>
          </Bar.Group>
          <Bar.Group aria-label="Actions">
            <Bar.Action
              label="Delete"
              shortcut={["⌫"]}
              onClick={board.deleteConnectors}
            >
              <IconTrash />
            </Bar.Action>
          </Bar.Group>
        </Bar.Root>
      </div>
    </ViewportPortal>
  );
}
