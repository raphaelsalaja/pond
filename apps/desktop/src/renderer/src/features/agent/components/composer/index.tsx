import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
} from "@lexical/mdast";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalExtensionComposer } from "@lexical/react/LexicalExtensionComposer";
import type { AssistantSource } from "@shared/assistant";
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  CLEAR_HISTORY_COMMAND,
  SKIP_DOM_SELECTION_TAG,
} from "lexical";
import {
  type Ref,
  type RefObject,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { stopAppHotkeysFromEditable } from "@/shared/lib/editable-target";
import { ComposerDrop } from "./drop";
import { ComposerEditing } from "./editing";
import { createComposerExtension } from "./editor-extension";
import { ComposerMentions } from "./mention";
import styles from "./styles.module.css";
import { ComposerSuggestions } from "./suggestions";

export interface ComposerEditorHandle {
  focus: () => void;
  /** Types `@` at the cursor so the Save search opens. */
  mention: () => void;
}

export interface ComposerEditorProps {
  value: string;
  disabled: boolean;
  running: boolean;
  placeholder: string;
  attachments: AssistantSource[];
  anchorRef: RefObject<HTMLDivElement | null>;
  ref?: Ref<ComposerEditorHandle>;
  onChange: (markdown: string) => void;
  onSend: (markdown: string) => void;
  onQueue?: (markdown: string) => void;
  onAttach: (saves: AssistantSource[]) => void;
  onRemove: (id: string) => void;
  onDropIds: (ids: string[]) => void;
}

export function ComposerEditor(props: ComposerEditorProps) {
  const [extension] = useState(() =>
    createComposerExtension(props.value, !props.disabled),
  );
  return (
    <LexicalExtensionComposer extension={extension} contentEditable={null}>
      <div className={styles.root}>
        <ContentEditable
          className={styles.editor}
          aria-label="Message"
          aria-multiline
          aria-placeholder={props.placeholder}
          placeholder={
            <div className={styles.placeholder}>{props.placeholder}</div>
          }
          onKeyDown={stopAppHotkeysFromEditable}
        />
      </div>
      <ComposerDraft {...props} />
      <ComposerEditing
        running={props.running}
        onSend={props.onSend}
        onQueue={props.onQueue}
      />
      <ComposerDrop onDropIds={props.onDropIds} />
      <ComposerMentions
        attachments={props.attachments}
        onRemove={props.onRemove}
      />
      <ComposerSuggestions
        attachments={props.attachments}
        anchorRef={props.anchorRef}
        onAttach={props.onAttach}
      />
    </LexicalExtensionComposer>
  );
}

function ComposerDraft({
  value,
  disabled,
  onChange,
  ref,
}: ComposerEditorProps) {
  const [editor] = useLexicalComposerContext();
  const published = useRef(value);
  const change = useRef(onChange);
  change.current = onChange;
  useImperativeHandle(
    ref,
    () => ({
      focus: () => editor.focus(),
      mention: () => {
        editor.update(() => {
          const current = $getSelection();
          const selection = $isRangeSelection(current)
            ? current
            : $getRoot().selectEnd();
          const before = selection.anchor
            .getNode()
            .getTextContent()
            .slice(0, selection.anchor.offset);
          selection.insertText(before && !/\s$/.test(before) ? " @" : "@");
        });
        editor.focus();
      },
    }),
    [editor],
  );
  useEffect(() => {
    editor.setEditable(!disabled);
  }, [editor, disabled]);
  useEffect(() => {
    if (value === published.current) return;
    published.current = value;
    editor.update(
      () => {
        $convertFromMarkdownString(value);
      },
      { tag: ["external-draft", SKIP_DOM_SELECTION_TAG] },
    );
    editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined);
  }, [editor, value]);
  useEffect(
    () =>
      editor.registerUpdateListener(
        ({
          editorState,
          prevEditorState,
          dirtyElements,
          dirtyLeaves,
          tags,
        }) => {
          if (
            tags.has("external-draft") ||
            (!dirtyElements.size && !dirtyLeaves.size)
          )
            return;
          const markdown = editorState.read(() => $convertToMarkdownString(), {
            editor,
          });
          if (markdown.length > 32000) {
            editor.setEditorState(prevEditorState, { tag: "external-draft" });
            return;
          }
          published.current = markdown;
          change.current(markdown);
        },
      ),
    [editor],
  );
  return null;
}
