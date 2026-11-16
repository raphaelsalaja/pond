import {
  IconAlign2Left,
  IconArrowUpRight,
  IconCrop,
  IconDuplicate,
  IconImage,
  IconTrash,
} from "@pond/icons";
import { Button, type MenuItemSpec } from "@pond/ui";
import type { CanvasColor } from "@shared/canvas-contracts";
import { NodeToolbar, Position } from "@xyflow/react";
import type { ReactElement } from "react";
import type { CanvasNode } from "../../lib/document";
import { AddSaves } from "../add-saves";
import { Bar } from "../bar";

export type SelectionControl =
  | {
      kind: "menu";
      label: string;
      icon: ReactElement;
      buildItems: () => MenuItemSpec[];
    }
  | { kind: "custom"; label: string; element: ReactElement }
  | {
      kind: "action";
      label: string;
      icon: ReactElement;
      shortcut?: string[];
      pressed?: boolean;
      onClick(): void;
    };

interface ControlProps {
  control: SelectionControl;
}

function Control({ control }: ControlProps) {
  if (control.kind === "custom") return control.element;
  if (control.kind === "menu")
    return (
      <Bar.Menu label={control.label} buildItems={control.buildItems}>
        {control.icon}
      </Bar.Menu>
    );
  return (
    <Bar.Action
      label={control.label}
      shortcut={control.shortcut}
      pressed={control.pressed}
      onClick={control.onClick}
    >
      {control.icon}
    </Bar.Action>
  );
}

interface SelectionBarProps {
  nodes: readonly CanvasNode[];
  hidden: boolean;
  canOpen: boolean;
  canCrop: boolean;
  onCanvas: ReadonlySet<string>;
  arrange: (() => MenuItemSpec[]) | null;
  /** Item kind controls that share a group with Color, like Shape. */
  lead: readonly SelectionControl[];
  /** Style controls after Color, like Font and Bold. */
  style: readonly SelectionControl[];
  /** Selection actions before Duplicate, like Group and Lock. */
  extras: readonly SelectionControl[];
  onColor(color: CanvasColor): void;
  onOpen(): void;
  onCrop(): void;
  onReplace(saveIds: string[]): void;
  onDuplicate(): void;
  onDelete(): void;
}

function shared<Value>(values: readonly Value[]): Value | null {
  const unique = new Set(values);
  const [only] = unique;
  return unique.size === 1 && only !== undefined ? only : null;
}

export function SelectionBar({
  nodes,
  hidden,
  canOpen,
  canCrop,
  onCanvas,
  arrange,
  lead,
  style,
  extras,
  onColor,
  onOpen,
  onCrop,
  onReplace,
  onDuplicate,
  onDelete,
}: SelectionBarProps) {
  const colors = nodes.flatMap((node) =>
    node.type === "save" || node.type === "text" || node.type === "code"
      ? []
      : [node.data.color],
  );
  const copyable = nodes.some((node) => node.type !== "save");
  return (
    <NodeToolbar
      nodeId={nodes.map((node) => node.id)}
      isVisible={nodes.length > 0}
      position={Position.Top}
      offset={28}
    >
      <Bar.Root hidden={hidden}>
        {lead.length || colors.length ? (
          <Bar.Group aria-label="Kind">
            {lead.map((control) => (
              <Control key={control.label} control={control} />
            ))}
            {colors.length ? (
              <Bar.Colors value={shared(colors)} onChange={onColor} />
            ) : null}
          </Bar.Group>
        ) : null}
        {style.length ? (
          <Bar.Group aria-label="Style">
            {style.map((control) => (
              <Control key={control.label} control={control} />
            ))}
          </Bar.Group>
        ) : null}
        <Bar.Group aria-label="Actions">
          {canOpen ? (
            <Bar.Action label="Open Save" shortcut={["↵"]} onClick={onOpen}>
              <IconArrowUpRight />
            </Bar.Action>
          ) : null}
          {canCrop ? (
            <Bar.Action label="Crop" onClick={onCrop}>
              <IconCrop />
            </Bar.Action>
          ) : null}
          {canOpen ? (
            <AddSaves
              onCanvas={onCanvas}
              onAdd={onReplace}
              label="Replace Save"
            >
              <Button
                icon
                size="xs"
                variant="ghost"
                rounding="full"
                aria-label="Replace Save"
              >
                <IconImage />
              </Button>
            </AddSaves>
          ) : null}
          {arrange ? (
            <Bar.Menu label="Arrange" buildItems={arrange}>
              <IconAlign2Left />
            </Bar.Menu>
          ) : null}
          {extras.map((control) => (
            <Control key={control.label} control={control} />
          ))}
          {copyable ? (
            <Bar.Action
              label="Duplicate"
              shortcut={["⌘", "D"]}
              onClick={onDuplicate}
            >
              <IconDuplicate />
            </Bar.Action>
          ) : null}
          <Bar.Action label="Delete" shortcut={["⌫"]} onClick={onDelete}>
            <IconTrash />
          </Bar.Action>
        </Bar.Group>
      </Bar.Root>
    </NodeToolbar>
  );
}
