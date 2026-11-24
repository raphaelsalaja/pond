import { $createCodeNode, $isCodeNode } from "@lexical/code";
import { $createLinkNode, $isLinkNode } from "@lexical/link";
import { $isListItemNode, $isListNode } from "@lexical/list";
import { $isHeadingNode, $isQuoteNode } from "@lexical/rich-text";
import { $setBlocksType } from "@lexical/selection";
import { $findMatchingParent, $insertNodeToNearestRoot } from "@lexical/utils";
import {
  $createParagraphNode,
  $createRangeSelection,
  $createTextNode,
  $getSelection,
  $isRangeSelection,
  $setSelection,
  createCommand,
} from "lexical";
import type { LexicalEditor } from "lexical";
import { $applyMarkdownBlock } from "@/shared/markdown-editor/blocks";
import { $insertCollapsible } from "./collapsible";
import { $createFileNode } from "./file-node";
import { $createImageNode } from "./image-node";
import { $createYouTubeNode } from "./youtube-node";

export const OPEN_NOTE_LINK_COMMAND = createCommand("OPEN_NOTE_LINK");

export type NoteBlock =
  | "paragraph"
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "bullet"
  | "number"
  | "check"
  | "quote"
  | "code"
  | "diagram"
  | "hr"
  | "collapse";

const IMAGE_NAME = /\.(gif|png|jpe?g|webp|avif|svg|heic|bmp)$/i;

export function $getNoteBlock(): NoteBlock {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    return "paragraph";
  }
  const anchor = selection.anchor.getNode();
  const list = $findMatchingParent(anchor, $isListNode);
  if ($isListNode(list) || $isListItemNode(anchor)) {
    const node = $isListNode(list)
      ? list
      : $findMatchingParent(anchor, $isListNode);
    if ($isListNode(node)) {
      const type = node.getListType();
      if (type === "number") {
        return "number";
      }
      if (type === "check") {
        return "check";
      }
      return "bullet";
    }
  }
  const element = anchor.getTopLevelElement();
  if ($isHeadingNode(element)) {
    const tag = element.getTag();
    if (tag === "h1" || tag === "h2" || tag === "h3" || tag === "h4") {
      return tag;
    }
  }
  if ($isQuoteNode(element)) {
    return "quote";
  }
  if ($isCodeNode(element)) {
    return element.getLanguage() === "mermaid" ? "diagram" : "code";
  }
  return "paragraph";
}

export function $linkHref(): string | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    return null;
  }
  const start = $findMatchingParent(selection.anchor.getNode(), $isLinkNode);
  const end = $findMatchingParent(selection.focus.getNode(), $isLinkNode);
  if ($isLinkNode(start) && start === end) {
    return start.getURL();
  }
  return null;
}

export function $restoreRange(saved: {
  anchor: { key: string; offset: number; type: "text" | "element" };
  focus: { key: string; offset: number; type: "text" | "element" };
}): void {
  const next = $createRangeSelection();
  next.anchor.set(saved.anchor.key, saved.anchor.offset, saved.anchor.type);
  next.focus.set(saved.focus.key, saved.focus.offset, saved.focus.type);
  $setSelection(next);
}

export function $applyNoteBlock(block: NoteBlock): void {
  if (block === "collapse") {
    $insertCollapsible();
  } else if (block === "diagram") {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      $setBlocksType(selection, () => $createCodeNode("mermaid"));
    }
  } else {
    $applyMarkdownBlock(block);
  }
}

export function applyNoteBlock(editor: LexicalEditor, block: NoteBlock): void {
  editor.update(() => {
    $applyNoteBlock(block);
  });
}

export function promptYouTube(editor: LexicalEditor): void {
  editor.update(() => {
    $insertNodeToNearestRoot($createYouTubeNode(""));
  });
}

export async function insertNoteFiles(
  editor: LexicalEditor,
  kind: "media" | "gif" | "files" = "files",
): Promise<void> {
  const picked = await window.pond.query("saves.pickImportPaths", {
    kind: "files",
  });
  if (!picked.paths.length) {
    return;
  }
  editor.update(() => {
    for (const path of picked.paths) {
      const name = path.split("/").filter(Boolean).at(-1) ?? path;
      const href = path.startsWith("/") ? `file://${encodeURI(path)}` : path;
      if (kind !== "files" && IMAGE_NAME.test(name)) {
        $insertNodeToNearestRoot($createImageNode({ src: href, alt: name }));
        continue;
      }
      if (kind === "files") {
        $insertNodeToNearestRoot(
          $createParagraphNode().append($createFileNode({ href, name })),
        );
        continue;
      }
      const link = $createLinkNode(href);
      link.append($createTextNode(name));
      $insertNodeToNearestRoot($createParagraphNode().append(link));
    }
  });
}
