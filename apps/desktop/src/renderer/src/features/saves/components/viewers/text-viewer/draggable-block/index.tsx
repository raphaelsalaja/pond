import { $isCodeNode } from "@lexical/code";
import { $isHorizontalRuleNode } from "@lexical/extension";
import { $isListItemNode, $isListNode } from "@lexical/list";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $isHeadingNode, $isQuoteNode, eventFiles } from "@lexical/rich-text";
import {
  calculateZoomLevel,
  isHTMLElement,
  mergeRegister,
} from "@lexical/utils";
import { IconGripDotsVertical } from "@pond/icons";
import { Button, Menu } from "@pond/ui";
import {
  $getNearestNodeFromDOMNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isNodeSelection,
  $isParagraphNode,
  $isRangeSelection,
  $isRootNode,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  DRAGOVER_COMMAND,
  DROP_COMMAND,
  KEY_DOWN_COMMAND,
} from "lexical";
import type { LexicalEditor, LexicalNode } from "lexical";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DragEvent as ReactDragEvent } from "react";
import { createPortal } from "react-dom";
import { platformGlyphs } from "@/shared/lib/shortcuts";
import {
  $isCollapsibleContainerNode,
  $isCollapsibleContentNode,
} from "../collapsible";
import { $isImageNode } from "../image-node";
import { $isYouTubeNode } from "../youtube-node";
import styles from "./styles.module.css";

const GUTTER = 32;
const HANDLE = 4;
const LINE = 2;
const FORMAT = "application/x-lexical-drag-block";

function $isDraggable(node: LexicalNode): boolean {
  return (
    $isParagraphNode(node) ||
    $isHeadingNode(node) ||
    $isQuoteNode(node) ||
    $isCodeNode(node) ||
    $isListItemNode(node) ||
    $isHorizontalRuleNode(node) ||
    $isImageNode(node) ||
    $isYouTubeNode(node) ||
    $isCollapsibleContainerNode(node)
  );
}

function $walkable(node: LexicalNode): boolean {
  return (
    $isListNode(node) ||
    $isListItemNode(node) ||
    $isCollapsibleContainerNode(node) ||
    $isCollapsibleContentNode(node)
  );
}

function $draggableKeys(): Array<string> {
  const keys: Array<string> = [];
  const walk = (node: LexicalNode) => {
    if ($isDraggable(node)) {
      keys.push(node.getKey());
    }
    if ($isElementNode(node) && ($isRootNode(node) || $walkable(node))) {
      for (const child of node.getChildren()) {
        walk(child);
      }
    }
  };
  walk($getRoot());
  return keys;
}

function $moveBlock(
  dragged: LexicalNode,
  target: LexicalNode,
  after: boolean,
): void {
  if (dragged === target) {
    return;
  }
  if (dragged.getParent() !== target.getParent()) {
    if (!($isListItemNode(dragged) && $isListItemNode(target))) {
      return;
    }
  }
  if (after) {
    target.insertAfter(dragged);
  } else {
    target.insertBefore(dragged);
  }
}

function $blockOf(node: LexicalNode | null | undefined): LexicalNode | null {
  let current = node ?? null;
  while (current && !$isRootNode(current)) {
    const parent: LexicalNode | null = current.getParent();
    if (
      $isDraggable(current) &&
      parent &&
      ($isRootNode(parent) || $walkable(parent))
    ) {
      return current;
    }
    current = parent;
  }
  return null;
}

function $selectedBlock(): LexicalNode | null {
  const selection = $getSelection();
  if ($isRangeSelection(selection)) {
    return $blockOf(selection.anchor.getNode());
  }
  if ($isNodeSelection(selection)) {
    return $blockOf(selection.getNodes()[0]);
  }
  return null;
}

type Direction = -1 | 1;

function $neighbor(block: LexicalNode, direction: Direction) {
  return direction < 0 ? block.getPreviousSibling() : block.getNextSibling();
}

function $moveBy(block: LexicalNode, direction: Direction): boolean {
  const neighbor = $neighbor(block, direction);
  if (!neighbor) {
    return false;
  }
  $moveBlock(block, neighbor, direction > 0);
  return true;
}

function $movedLabel(block: LexicalNode): string {
  const total = block.getParent()?.getChildrenSize() ?? 0;
  return `Moved block to position ${block.getIndexWithinParent() + 1} of ${total}.`;
}

const MOVE_UP_SHORTCUT = ["⌘", "⇧", "↑"];
const MOVE_DOWN_SHORTCUT = ["⌘", "⇧", "↓"];

interface BlockMenu {
  key: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

interface CollapsedMargins {
  top: number;
  bottom: number;
}

function collapsedMargins(elem: HTMLElement): CollapsedMargins {
  const style = window.getComputedStyle(elem);
  const prev = elem.previousElementSibling
    ? Number.parseFloat(
        window.getComputedStyle(elem.previousElementSibling).marginBottom,
      )
    : 0;
  const next = elem.nextElementSibling
    ? Number.parseFloat(
        window.getComputedStyle(elem.nextElementSibling).marginTop,
      )
    : 0;
  return {
    top: Math.max(Number.parseFloat(style.marginTop), prev),
    bottom: Math.max(Number.parseFloat(style.marginBottom), next),
  };
}

function blockAtPoint(
  editor: LexicalEditor,
  anchor: HTMLElement,
  event: MouseEvent,
  edges = false,
): HTMLElement | null {
  const frame = anchor.getBoundingClientRect();
  let match: HTMLElement | null = null;
  let area = Number.POSITIVE_INFINITY;

  editor.getEditorState().read(() => {
    const keys = $draggableKeys();
    if (keys.length === 0) {
      return;
    }

    if (edges) {
      const firstKey = keys.at(0);
      const lastKey = keys.at(-1);
      const first = firstKey ? editor.getElementByKey(firstKey) : null;
      const last = lastKey ? editor.getElementByKey(lastKey) : null;
      if (first && event.clientY < first.getBoundingClientRect().top) {
        match = first;
        return;
      }
      if (last && event.clientY > last.getBoundingClientRect().bottom) {
        match = last;
        return;
      }
    }

    for (const key of keys) {
      const elem = editor.getElementByKey(key);
      if (!elem) {
        continue;
      }
      const zoom = calculateZoomLevel(elem);
      const x = event.clientX / zoom;
      const y = event.clientY / zoom;
      const box = elem.getBoundingClientRect();
      const margin = collapsedMargins(elem);
      const top = box.top - margin.top;
      const bottom = box.bottom + margin.bottom;
      if (x < frame.left || x > frame.right || y < top || y > bottom) {
        continue;
      }
      const next = (bottom - top) * (frame.right - frame.left);
      if (next < area) {
        match = elem;
        area = next;
      }
    }
  });

  return match;
}

function setHandle(
  target: HTMLElement | null,
  handle: HTMLElement,
  anchor: HTMLElement,
  zoom: number,
): void {
  if (!target) {
    handle.style.display = "none";
    return;
  }
  const box = target.getBoundingClientRect();
  const style = window.getComputedStyle(target);
  let height = Number.parseInt(style.lineHeight, 10);
  if (Number.isNaN(height)) {
    height = box.height;
  }
  const top =
    (box.top +
      (height - (handle.getBoundingClientRect().height || height)) / 2 -
      anchor.getBoundingClientRect().top) /
    zoom;
  handle.style.display = "flex";
  handle.style.opacity = "1";
  handle.style.transform = `translate(${HANDLE}px, ${top}px)`;
}

function setLine(
  line: HTMLElement,
  target: HTMLElement,
  mouseY: number,
  anchor: HTMLElement,
): void {
  const box = target.getBoundingClientRect();
  const frame = anchor.getBoundingClientRect();
  const margin = collapsedMargins(target);
  const top =
    (mouseY >= box.top
      ? box.bottom + margin.bottom / 2
      : box.top - margin.top / 2) -
    frame.top -
    LINE / 2;
  const left = GUTTER - HANDLE;
  line.style.transform = `translate(${left}px, ${top}px)`;
  line.style.width = `${frame.width - left * 2}px`;
  line.style.opacity = "1";
}

function styleBlock(
  block: HTMLElement,
  patch: Partial<Pick<CSSStyleDeclaration, "opacity" | "transform">>,
): void {
  Object.assign(block.style, patch);
}

export function DraggableBlockPlugin({ anchor }: { anchor: HTMLElement }) {
  const [editor] = useLexicalComposerContext();
  const handleRef = useRef<HTMLButtonElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [block, setBlock] = useState<HTMLElement | null>(null);
  const [menu, setMenu] = useState<BlockMenu | null>(null);
  const [open, setOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const menuOpen = useRef(false);
  const scroller = anchor.parentElement;

  useEffect(() => {
    menuOpen.current = open;
  }, [open]);

  const onMenu = useCallback((node: HTMLElement) => {
    return Boolean(handleRef.current?.contains(node));
  }, []);

  useEffect(() => {
    function onMove(event: MouseEvent) {
      if (menuOpen.current) {
        return;
      }
      const target = event.target;
      if (!isHTMLElement(target)) {
        setBlock(null);
        return;
      }
      if (onMenu(target)) {
        return;
      }
      setBlock(blockAtPoint(editor, anchor, event));
    }

    function onLeave() {
      if (menuOpen.current) {
        return;
      }
      setBlock(null);
    }

    scroller?.addEventListener("mousemove", onMove);
    scroller?.addEventListener("mouseleave", onLeave);
    return () => {
      scroller?.removeEventListener("mousemove", onMove);
      scroller?.removeEventListener("mouseleave", onLeave);
    };
  }, [anchor, editor, onMenu, scroller]);

  useEffect(() => {
    if (!handleRef.current) {
      return;
    }
    setHandle(
      block,
      handleRef.current,
      anchor,
      calculateZoomLevel(block ?? anchor),
    );
  }, [anchor, block]);

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        DRAGOVER_COMMAND,
        (event) => {
          if (!dragging.current) {
            return false;
          }
          const [files] = eventFiles(event);
          if (files) {
            return false;
          }
          if (!isHTMLElement(event.target)) {
            return false;
          }
          const target = blockAtPoint(editor, anchor, event, true);
          const line = lineRef.current;
          if (!target || !line) {
            return false;
          }
          setLine(line, target, event.clientY, anchor);
          event.preventDefault();
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        DROP_COMMAND,
        (event) => {
          if (!dragging.current) {
            return false;
          }
          const [files] = eventFiles(event);
          if (files) {
            return false;
          }
          const key = event.dataTransfer?.getData(FORMAT) ?? "";
          const dragged = $getNodeByKey(key);
          if (!dragged || !isHTMLElement(event.target)) {
            return false;
          }
          const targetElem = blockAtPoint(editor, anchor, event, true);
          if (!targetElem) {
            return false;
          }
          const target = $getNearestNodeFromDOMNode(targetElem);
          if (!target) {
            return false;
          }
          $moveBlock(
            dragged,
            target,
            event.clientY >= targetElem.getBoundingClientRect().top,
          );
          setBlock(null);
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        KEY_DOWN_COMMAND,
        (event) => {
          if (!(event.metaKey || event.ctrlKey) || !event.shiftKey) {
            return false;
          }
          if (event.altKey) {
            return false;
          }
          const direction: Direction | null =
            event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : null;
          if (!direction) {
            return false;
          }
          const selected = $selectedBlock();
          if (!selected) {
            return false;
          }
          event.preventDefault();
          if ($moveBy(selected, direction)) {
            setAnnouncement($movedLabel(selected));
          }
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
    );
  }, [anchor, editor]);

  function openMenu() {
    if (!block) {
      return;
    }
    editor.getEditorState().read(() => {
      const node = $getNearestNodeFromDOMNode(block);
      if (!node) {
        return;
      }
      setMenu({
        key: node.getKey(),
        canMoveUp: $neighbor(node, -1) !== null,
        canMoveDown: $neighbor(node, 1) !== null,
      });
      setOpen(true);
    });
  }

  function moveFromMenu(direction: Direction) {
    const key = menu?.key;
    if (!key) {
      return;
    }
    editor.update(() => {
      const node = $getNodeByKey(key);
      if (node && $moveBy(node, direction)) {
        setAnnouncement($movedLabel(node));
      }
    });
  }

  function onDragStart(event: ReactDragEvent<HTMLButtonElement>) {
    const transfer = event.dataTransfer;
    if (!transfer || !block) {
      return;
    }
    const transform = block.style.transform;
    styleBlock(block, { transform: "translateZ(0)", opacity: "0.4" });
    transfer.setDragImage(block, 0, 0);
    window.setTimeout(() => {
      styleBlock(block, { transform });
    });
    let key = "";
    editor.update(() => {
      key = $getNearestNodeFromDOMNode(block)?.getKey() ?? "";
    });
    dragging.current = true;
    transfer.effectAllowed = "move";
    transfer.setData(FORMAT, key);
  }

  function onDragEnd() {
    dragging.current = false;
    if (block) {
      styleBlock(block, { opacity: "" });
    }
    const line = lineRef.current;
    if (line) {
      line.style.opacity = "0";
      line.style.transform = "translate(-10000px, -10000px)";
    }
  }

  return createPortal(
    <>
      <Button
        ref={handleRef}
        icon
        size="xs"
        variant="text"
        draggable
        className={styles.handle}
        aria-label="Move Block"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={openMenu}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <IconGripDotsVertical size={12} />
      </Button>
      <Menu.Root
        open={open}
        onOpenChange={(next) => {
          if (!next) {
            setOpen(false);
          }
        }}
      >
        <Menu.Portal>
          <Menu.Positioner anchor={handleRef} side="bottom" align="start">
            <Menu.Popup finalFocus={handleRef}>
              <Menu.Item
                disabled={!menu?.canMoveUp}
                onClick={() => moveFromMenu(-1)}
              >
                <Menu.ItemLabel>Move Up</Menu.ItemLabel>
                <Menu.ItemKeyboard>
                  {platformGlyphs(MOVE_UP_SHORTCUT)}
                </Menu.ItemKeyboard>
              </Menu.Item>
              <Menu.Item
                disabled={!menu?.canMoveDown}
                onClick={() => moveFromMenu(1)}
              >
                <Menu.ItemLabel>Move Down</Menu.ItemLabel>
                <Menu.ItemKeyboard>
                  {platformGlyphs(MOVE_DOWN_SHORTCUT)}
                </Menu.ItemKeyboard>
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
      <div ref={lineRef} className={styles.drop} />
      <p role="status" className={styles.announcement}>
        {announcement}
      </p>
    </>,
    anchor,
  );
}
