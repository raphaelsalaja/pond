import { IconCanvas, IconDots } from "@pond/icons";
import { Menu, Sidebar } from "@pond/ui";
import type { CanvasSummary } from "@shared/canvas-contracts";
import { useState } from "react";
import { isLibrarySaveDrag, saveDropIds } from "@/features/saves";
import { InlineNameEditor } from "@/shared/components/inline-name-editor";
import {
  SpecContextMenu,
  SpecMenu,
} from "@/shared/components/spec-context-menu";
import { addSavesToCanvas, canvasItems, runCanvasAction } from "../../lib/menu";
import { canvases } from "../../state/canvases";
import styles from "./styles.module.css";

interface CanvasRowProps {
  canvas: CanvasSummary;
  active: boolean;
  renaming: boolean;
}

export function CanvasRow({ canvas, active, renaming }: CanvasRowProps) {
  const [dropping, setDropping] = useState(false);
  const items = () => canvasItems(canvas);

  return (
    <SpecContextMenu
      search
      searchLabel="Search Canvas operations"
      buildItems={items}
    >
      <div className={styles.row} data-hover-row={renaming ? undefined : ""}>
        {renaming ? (
          <div className={styles.editor}>
            <Sidebar.Icon className={styles.icon}>
              <IconCanvas />
            </Sidebar.Icon>
            <InlineNameEditor
              name={canvas.name}
              className={styles.field}
              ariaLabel="Canvas name"
              onSave={(name) =>
                runCanvasAction(() => canvases.rename(canvas.id, name))
              }
              onFinish={() => canvases.finishEditing()}
            />
          </div>
        ) : (
          <Sidebar.Item
            className={styles.item}
            data-status={active || dropping ? "active" : undefined}
            aria-current={active ? "page" : undefined}
            onClick={() => canvases.open(canvas.id)}
            onDoubleClick={() => canvases.startEditing(canvas.id)}
            onDragOver={(event) => {
              if (!isLibrarySaveDrag(event.dataTransfer)) {
                return;
              }
              event.preventDefault();
              event.stopPropagation();
              event.dataTransfer.dropEffect = "copy";
              setDropping(true);
            }}
            onDragLeave={() => setDropping(false)}
            onDrop={(event) => {
              setDropping(false);
              if (!isLibrarySaveDrag(event.dataTransfer)) {
                return;
              }
              event.preventDefault();
              event.stopPropagation();
              addSavesToCanvas(canvas.id, saveDropIds(event.dataTransfer));
            }}
          >
            <Sidebar.Icon>
              <IconCanvas />
            </Sidebar.Icon>
            <Sidebar.ItemLabel>{canvas.name}</Sidebar.ItemLabel>
          </Sidebar.Item>
        )}
        {renaming ? null : (
          <SpecMenu
            search
            searchLabel="Search Canvas operations"
            align="end"
            buildItems={items}
          >
            <Menu.Trigger
              icon
              size="xs"
              variant="text"
              className={styles.more}
              aria-label={`More Actions for ${canvas.name}`}
              tabIndex={-1}
            >
              <IconDots size={12} />
            </Menu.Trigger>
          </SpecMenu>
        )}
      </div>
    </SpecContextMenu>
  );
}
