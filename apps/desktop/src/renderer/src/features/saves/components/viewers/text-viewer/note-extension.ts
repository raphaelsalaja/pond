import {
  AriaLiveRegionExtension,
  EditorModeAnnounceExtension,
  FocusManagerExtension,
  HistoryAnnounceExtension,
} from "@lexical/a11y";
import { CodeShikiExtension } from "@lexical/code-shiki";
import {
  buildEditorFromExtensions,
  ClickAfterLastBlockExtension,
  SelectBlockExtension,
  SelectionAlwaysOnDisplayExtension,
} from "@lexical/extension";
import { isElement, isHTMLTag } from "@pond/ui/dom";
import log from "electron-log/renderer";
import {
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  configExtension,
  defineExtension,
} from "lexical";
import type { LexicalEditor } from "lexical";
import { markdownEditorExtension } from "@/shared/markdown-editor/extension";
import { COLLAPSE_NODES } from "./collapsible";
import { FileNode } from "./file-node";
import { ImageNode } from "./image-node";
import { $writeMarkdown, pondMdastExtension } from "./markdown";
import { YouTubeNode } from "./youtube-node";
import styles from "./styles.module.css";

const NOTE_THEME = {
  paragraph: styles.p,
  heading: {
    h1: styles.h1,
    h2: styles.h2,
    h3: styles.h3,
    h4: styles.h4,
  },
  list: {
    ul: styles.ul,
    ol: styles.ol,
    listitem: styles.li,
    nested: { listitem: styles["nested-item"] },
    listitemChecked: styles.checked,
    listitemUnchecked: styles.unchecked,
  },
  quote: styles.quote,
  code: styles.code,
  text: {
    bold: styles.bold,
    italic: styles.italic,
    strikethrough: styles.strike,
    underline: styles.underline,
    code: styles["inline-code"],
  },
  link: styles.link,
  hr: styles.hr,
  table: styles.table,
  tableScrollableWrapper: styles["table-scroll"],
  tableCell: styles.cell,
  tableCellHeader: styles.header,
};

function registerOpenExternal(editor: LexicalEditor): () => void {
  return editor.registerCommand(
    CLICK_COMMAND,
    (event) => {
      const target = event.target;
      if (!isElement(target)) {
        return false;
      }
      const anchor = target.closest("a");
      if (!isHTMLTag(anchor, "a") || !anchor.href) {
        return false;
      }
      if (editor.isEditable() && !event.metaKey && !event.ctrlKey) {
        return false;
      }
      event.preventDefault();
      void window.pond.openExternal(anchor.href);
      return true;
    },
    COMMAND_PRIORITY_LOW,
  );
}

export function createNoteExtension(opts: {
  markdown: string;
  editable: boolean;
}) {
  return defineExtension({
    name: "@pond/note",
    namespace: "note",
    theme: NOTE_THEME,
    editable: opts.editable,
    nodes: () => [...COLLAPSE_NODES, ImageNode, FileNode, YouTubeNode],
    $initialEditorState: () => {
      $writeMarkdown(opts.markdown);
    },
    onError: (error: Error) => {
      log.error("[pond note]", error);
    },
    dependencies: [
      markdownEditorExtension,
      configExtension(CodeShikiExtension, {
        disabled: Boolean(import.meta.env.VITEST),
      }),
      SelectionAlwaysOnDisplayExtension,
      SelectBlockExtension,
      ClickAfterLastBlockExtension,
      AriaLiveRegionExtension,
      configExtension(HistoryAnnounceExtension, {
        undone: "Undone",
        redone: "Redone",
      }),
      configExtension(EditorModeAnnounceExtension, {
        editable: "Editing",
        readOnly: "Read only",
      }),
      FocusManagerExtension,
      pondMdastExtension,
    ],
    register: (editor) => registerOpenExternal(editor),
  });
}

export function createNoteEditor(markdown = "") {
  return buildEditorFromExtensions(
    createNoteExtension({ markdown, editable: true }),
  );
}
