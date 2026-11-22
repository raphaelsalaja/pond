import { $isCodeNode } from "@lexical/code";
import { $isLinkNode, $toggleLink } from "@lexical/link";
import {
  $convertToMarkdownString,
  $generateNodesFromMarkdownString,
} from "@lexical/mdast";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $findMatchingParent, mergeRegister } from "@lexical/utils";
import { Button, Input } from "@pond/ui";
import {
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  $setSelection,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  COMMAND_PRIORITY_NORMAL,
  FORMAT_TEXT_COMMAND,
  INSERT_PARAGRAPH_COMMAND,
  KEY_DOWN_COMMAND,
  KEY_ENTER_COMMAND,
  PASTE_COMMAND,
  type RangeSelection,
} from "lexical";
import { useEffect, useRef, useState } from "react";
import {
  $applyMarkdownBlock,
  type MarkdownBlock,
} from "@/shared/markdown-editor/blocks";
import styles from "./styles.module.css";

export function ComposerEditing({
  running,
  onSend,
  onQueue,
}: {
  running: boolean;
  onSend: (markdown: string) => void;
  /** Enter while a reply runs; without it, Enter waits for the reply. */
  onQueue?: (markdown: string) => void;
}) {
  const [editor] = useLexicalComposerContext();
  const savedSelection = useRef<RangeSelection | null>(null);
  const [link, setLink] = useState<string | null>(null);
  useEffect(
    () =>
      mergeRegister(
        editor.registerCommand(
          KEY_ENTER_COMMAND,
          (event) =>
            Boolean(
              event?.isComposing ||
                event?.keyCode === 229 ||
                editor.isComposing(),
            ),
          COMMAND_PRIORITY_HIGH,
        ),
        editor.registerCommand(
          KEY_ENTER_COMMAND,
          (event) => {
            if (
              !event ||
              event.isComposing ||
              event.keyCode === 229 ||
              editor.isComposing()
            )
              return false;
            event.preventDefault();
            if (event.shiftKey)
              return editor.dispatchCommand(
                INSERT_PARAGRAPH_COMMAND,
                undefined,
              );
            if (editor.getRootElement()?.hasAttribute("aria-controls"))
              return true;
            if (!running) onSend($convertToMarkdownString());
            else onQueue?.($convertToMarkdownString());
            return true;
          },
          COMMAND_PRIORITY_LOW,
        ),
        editor.registerCommand(
          KEY_DOWN_COMMAND,
          (event) => {
            if (event.isComposing || editor.isComposing()) return false;
            const mod = event.metaKey || event.ctrlKey;
            const headings = new Map<string, MarkdownBlock>([
              ["Digit0", "paragraph"],
              ["Digit1", "h1"],
              ["Digit2", "h2"],
              ["Digit3", "h3"],
              ["Digit4", "h4"],
            ]);
            const blocks = new Map<string, MarkdownBlock>([
              ["Digit8", "bullet"],
              ["Digit9", "number"],
              ["Digit7", "check"],
              ["Backslash", "code"],
            ]);
            const block =
              mod && event.altKey
                ? headings.get(event.code)
                : mod && event.shiftKey
                  ? blocks.get(event.code)
                  : event.altKey && event.shiftKey && event.code === "Period"
                    ? "quote"
                    : undefined;
            if (block) {
              event.preventDefault();
              $applyMarkdownBlock(block);
              return true;
            }
            if (mod && event.code === "KeyK") {
              const selection = $getSelection();
              if (!$isRangeSelection(selection)) return false;
              const linkNode = $findMatchingParent(
                selection.anchor.getNode(),
                $isLinkNode,
              );
              event.preventDefault();
              savedSelection.current = selection.clone();
              setLink($isLinkNode(linkNode) ? linkNode.getURL() : "");
              return true;
            }
            if (
              mod &&
              (event.code === "KeyE" ||
                (event.shiftKey && event.code === "KeyS"))
            ) {
              event.preventDefault();
              editor.dispatchCommand(
                FORMAT_TEXT_COMMAND,
                event.code === "KeyE" ? "code" : "strikethrough",
              );
              return true;
            }
            return false;
          },
          COMMAND_PRIORITY_NORMAL,
        ),
        editor.registerCommand(
          PASTE_COMMAND,
          (event) => {
            if (
              !(event instanceof ClipboardEvent) ||
              !event.clipboardData ||
              event.clipboardData.getData("text/html")
            )
              return false;
            const text = event.clipboardData.getData("text/plain");
            const selection = $getSelection();
            if (!text || !$isRangeSelection(selection)) return false;
            event.preventDefault();
            if ($findMatchingParent(selection.anchor.getNode(), $isCodeNode)) {
              selection.insertText(text);
              return true;
            }
            selection.insertNodes($generateNodesFromMarkdownString(text));
            return true;
          },
          COMMAND_PRIORITY_LOW,
        ),
      ),
    [editor, running, onSend, onQueue],
  );
  if (link === null) return null;
  return (
    <form
      className={styles.link}
      onSubmit={(event) => {
        event.preventDefault();
        const saved = savedSelection.current;
        const value = link.trim();
        editor.update(() => {
          if (
            !saved ||
            !$getNodeByKey(saved.anchor.key) ||
            !$getNodeByKey(saved.focus.key)
          )
            return;
          $setSelection(saved);
          $toggleLink(value || null);
        });
        setLink(null);
        editor.focus();
      }}
    >
      <Input.Root size="sm">
        <Input.Field
          aria-label="Link"
          placeholder="https://example.com"
          value={link}
          autoFocus
          onValueChange={setLink}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            setLink(null);
            editor.focus();
          }}
        />
      </Input.Root>
      <Button size="sm" type="submit">
        Apply
      </Button>
    </form>
  );
}
