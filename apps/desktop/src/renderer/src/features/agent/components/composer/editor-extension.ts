import { $convertFromMarkdownString } from "@lexical/mdast";
import log from "electron-log/renderer";
import { defineExtension } from "lexical";
import { markdownEditorExtension } from "@/shared/markdown-editor/extension";
import { composerMdastExtension, SaveMentionNode } from "./mention";
import styles from "./theme/styles.module.css";

export function createComposerExtension(markdown: string, editable: boolean) {
  return defineExtension({
    name: "@pond/agent-composer",
    namespace: "agent-composer",
    nodes: [SaveMentionNode],
    dependencies: [markdownEditorExtension, composerMdastExtension],
    editable,
    theme: {
      paragraph: styles.paragraph,
      heading: {
        h1: styles.heading,
        h2: styles.heading,
        h3: styles.heading,
        h4: styles.heading,
      },
      list: {
        ul: styles.list,
        ol: styles.list,
        nested: { listitem: styles.nested },
        listitemChecked: styles.checked,
        listitemUnchecked: styles.unchecked,
      },
      quote: styles.quote,
      code: styles.code,
      text: {
        bold: styles.bold,
        italic: styles.italic,
        strikethrough: styles.strike,
        code: styles["inline-code"],
      },
      link: styles.link,
      table: styles.table,
      tableScrollableWrapper: styles["table-scroll"],
      tableCell: styles.cell,
      tableCellHeader: styles.header,
    },
    $initialEditorState: () => $convertFromMarkdownString(markdown),
    onError: (error: Error) => {
      log.error("[pond composer]", error);
    },
  });
}
