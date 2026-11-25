import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $findMatchingParent,
  $insertNodeToNearestRoot,
  mergeRegister,
} from "@lexical/utils";
import { isHTMLTag } from "@pond/ui/dom";
import {
  $applyNodeReplacement,
  $createParagraphNode,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  ElementNode,
} from "lexical";
import type {
  DOMConversionMap,
  DOMConversionOutput,
  EditorConfig,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  RangeSelection,
  SerializedElementNode,
  Spread,
} from "lexical";
import { useEffect } from "react";
import styles from "./styles.module.css";

export type SerializedCollapsibleContainerNode = Spread<
  { open: boolean },
  SerializedElementNode
>;

export class CollapsibleContainerNode extends ElementNode {
  __open: boolean;

  constructor(open: boolean, key?: NodeKey) {
    super(key);
    this.__open = open;
  }

  static getType(): string {
    return "collapsible-container";
  }

  static clone(node: CollapsibleContainerNode): CollapsibleContainerNode {
    return new CollapsibleContainerNode(node.__open, node.__key);
  }

  static importJSON(
    serialized: SerializedCollapsibleContainerNode,
  ): CollapsibleContainerNode {
    return $createCollapsibleContainerNode(serialized.open).updateFromJSON(
      serialized,
    );
  }

  exportJSON(): SerializedCollapsibleContainerNode {
    return {
      ...super.exportJSON(),
      open: this.__open,
    };
  }

  static importDOM(): DOMConversionMap | null {
    return {
      details: () => ({
        conversion: $convertDetails,
        priority: 1,
      }),
    };
  }

  createDOM(_config: EditorConfig, editor: LexicalEditor): HTMLElement {
    const details = document.createElement("details");
    details.className = styles.collapse ?? "";
    details.open = this.__open;
    details.addEventListener("toggle", () => {
      const open = details.open;
      editor.update(() => {
        const latest = this.getLatest();
        if (latest.getOpen() !== open) latest.setOpen(open);
      });
    });
    return details;
  }

  updateDOM(prev: this, dom: HTMLElement): boolean {
    if (!isHTMLTag(dom, "details")) {
      return true;
    }
    if (prev.__open !== this.__open) {
      dom.open = this.__open;
    }
    return false;
  }

  isShadowRoot(): boolean {
    return true;
  }

  collapseAtStart(): boolean {
    const children: Array<LexicalNode> = [];
    for (const child of this.getChildren()) {
      if ($isElementNode(child)) children.push(...child.getChildren());
    }
    const paragraph = $createParagraphNode();
    paragraph.append(...children);
    this.replace(paragraph);
    return true;
  }

  setOpen(open: boolean): this {
    const writable = this.getWritable();
    writable.__open = open;
    return writable;
  }

  getOpen(): boolean {
    return this.getLatest().__open;
  }

  toggleOpen(): this {
    return this.setOpen(!this.getOpen());
  }
}

function $convertDetails(element: HTMLElement): DOMConversionOutput | null {
  if (!isHTMLTag(element, "details")) {
    return null;
  }
  return {
    node: $createCollapsibleContainerNode(element.open),
  };
}

export function $createCollapsibleContainerNode(
  open: boolean,
): CollapsibleContainerNode {
  return $applyNodeReplacement(new CollapsibleContainerNode(open));
}

export function $isCollapsibleContainerNode(
  node: LexicalNode | null | undefined,
): node is CollapsibleContainerNode {
  return node?.getType() === CollapsibleContainerNode.getType();
}

export class CollapsibleTitleNode extends ElementNode {
  static getType(): string {
    return "collapsible-title";
  }

  static clone(node: CollapsibleTitleNode): CollapsibleTitleNode {
    return new CollapsibleTitleNode(node.__key);
  }

  static importJSON(serialized: SerializedElementNode): CollapsibleTitleNode {
    return $createCollapsibleTitleNode().updateFromJSON(serialized);
  }

  static importDOM(): DOMConversionMap | null {
    return {
      summary: () => ({
        conversion: () => ({ node: $createCollapsibleTitleNode() }),
        priority: 1,
      }),
    };
  }

  createDOM(): HTMLElement {
    const summary = document.createElement("summary");
    summary.className = styles.title ?? "";
    return summary;
  }

  updateDOM(): boolean {
    return false;
  }

  insertNewAfter(_: RangeSelection, restoreSelection = true): ElementNode {
    const container = this.getParentOrThrow();
    if (!$isCollapsibleContainerNode(container)) {
      const paragraph = $createParagraphNode();
      this.insertAfter(paragraph, restoreSelection);
      return paragraph;
    }
    if (container.getOpen()) {
      const content = this.getNextSibling();
      if ($isCollapsibleContentNode(content)) {
        const first = content.getFirstChild();
        if ($isElementNode(first)) return first;
        const paragraph = $createParagraphNode();
        content.append(paragraph);
        return paragraph;
      }
    }
    const paragraph = $createParagraphNode();
    container.insertAfter(paragraph, restoreSelection);
    return paragraph;
  }
}

export function $createCollapsibleTitleNode(): CollapsibleTitleNode {
  return $applyNodeReplacement(new CollapsibleTitleNode());
}

export function $isCollapsibleTitleNode(
  node: LexicalNode | null | undefined,
): node is CollapsibleTitleNode {
  return node?.getType() === CollapsibleTitleNode.getType();
}

export class CollapsibleContentNode extends ElementNode {
  static getType(): string {
    return "collapsible-content";
  }

  static clone(node: CollapsibleContentNode): CollapsibleContentNode {
    return new CollapsibleContentNode(node.__key);
  }

  static importJSON(serialized: SerializedElementNode): CollapsibleContentNode {
    return $createCollapsibleContentNode().updateFromJSON(serialized);
  }

  createDOM(): HTMLElement {
    const content = document.createElement("div");
    content.className = styles.content ?? "";
    return content;
  }

  updateDOM(): boolean {
    return false;
  }
}

export function $createCollapsibleContentNode(): CollapsibleContentNode {
  return $applyNodeReplacement(new CollapsibleContentNode());
}

export function $isCollapsibleContentNode(
  node: LexicalNode | null | undefined,
): node is CollapsibleContentNode {
  return node?.getType() === CollapsibleContentNode.getType();
}

export const COLLAPSE_NODES = [
  CollapsibleContainerNode,
  CollapsibleTitleNode,
  CollapsibleContentNode,
];

export function $inCollapsible(): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return false;
  return Boolean(
    $findMatchingParent(
      selection.anchor.getNode(),
      $isCollapsibleContainerNode,
    ),
  );
}

export function $insertCollapsible(): void {
  const title = $createParagraphNode();
  $insertNodeToNearestRoot(
    $createCollapsibleContainerNode(true).append(
      $createCollapsibleTitleNode().append(title),
      $createCollapsibleContentNode().append($createParagraphNode()),
    ),
  );
  title.selectEnd();
}

export function CollapsiblePlugin() {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    return mergeRegister(
      editor.registerNodeTransform(CollapsibleContentNode, (node) => {
        const parent = node.getParent();
        if (!$isCollapsibleContainerNode(parent)) {
          for (const child of node.getChildren()) node.insertBefore(child);
          node.remove();
        } else if (node.isEmpty()) {
          node.append($createParagraphNode());
        }
      }),
      editor.registerNodeTransform(CollapsibleTitleNode, (node) => {
        const parent = node.getParent();
        if (!$isCollapsibleContainerNode(parent)) {
          node.replace($createParagraphNode().append(...node.getChildren()));
        }
      }),
      editor.registerNodeTransform(CollapsibleContainerNode, (node) => {
        const children = node.getChildren();
        if (
          children.length !== 2 ||
          !$isCollapsibleTitleNode(children[0]) ||
          !$isCollapsibleContentNode(children[1])
        ) {
          for (const child of children) node.insertBefore(child);
          node.remove();
        }
      }),
    );
  }, [editor]);
  return null;
}
