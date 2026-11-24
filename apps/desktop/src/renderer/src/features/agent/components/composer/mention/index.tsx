import { MdastImportExtension } from "@lexical/mdast";
import type {
  MdastExportRule,
  MdastImportRule,
  MdastNode,
  MdastParent,
} from "@lexical/mdast";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { Chip } from "@pond/ui";
import type { AssistantSource } from "@shared/assistant";
import {
  $applyNodeReplacement,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  configExtension,
  DecoratorNode,
} from "lexical";
import type {
  EditorConfig,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from "lexical";
import { useEffect, useEffectEvent, useRef } from "react";
import type { JSX } from "react";
import { SourceThumbnail, useSourceCovers } from "../../pane/save-preview";
import styles from "./styles.module.css";

export type SerializedSaveMentionNode = Spread<
  { saveId: string; title: string },
  SerializedLexicalNode
>;

export class SaveMentionNode extends DecoratorNode<JSX.Element> {
  __id: string;
  __title: string;

  constructor(id: string, title: string, key?: NodeKey) {
    super(key);
    this.__id = id;
    this.__title = title;
  }

  static getType(): string {
    return "save-mention";
  }

  static clone(node: SaveMentionNode): SaveMentionNode {
    return new SaveMentionNode(node.__id, node.__title, node.__key);
  }

  static importJSON(serialized: SerializedSaveMentionNode): SaveMentionNode {
    return $createSaveMentionNode(
      serialized.saveId,
      serialized.title,
    ).updateFromJSON(serialized);
  }

  exportJSON(): SerializedSaveMentionNode {
    return {
      ...super.exportJSON(),
      saveId: this.__id,
      title: this.__title,
    };
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const span = document.createElement("span");
    span.contentEditable = "false";
    return span;
  }

  updateDOM(): boolean {
    return false;
  }

  isInline(): true {
    return true;
  }

  isKeyboardSelectable(): boolean {
    return true;
  }

  getSaveId(): string {
    return this.__id;
  }

  getTitle(): string {
    return this.__title;
  }

  getTextContent(): string {
    return this.__title;
  }

  decorate(): JSX.Element {
    return <SaveMentionChip id={this.__id} title={this.__title} />;
  }
}

function $createSaveMentionNode(id: string, title: string): SaveMentionNode {
  return $applyNodeReplacement(new SaveMentionNode(id, title));
}

function $isSaveMentionNode(
  node: LexicalNode | null | undefined,
): node is SaveMentionNode {
  return node?.getType() === SaveMentionNode.getType();
}

export function $insertSaveMention(id: string, title: string): void {
  const mention = $createSaveMentionNode(id, title);
  const space = $createTextNode(" ");
  const selection = $getSelection();
  if ($isRangeSelection(selection)) {
    selection.insertNodes([mention, space]);
    return;
  }
  $getRoot().selectEnd();
  const end = $getSelection();
  if ($isRangeSelection(end)) {
    end.insertNodes([mention, space]);
  }
}

function $saveMentionIds(): Array<string> {
  const ids: Array<string> = [];
  const walk = (node: LexicalNode) => {
    if ($isSaveMentionNode(node)) {
      ids.push(node.getSaveId());
    }
    if ($isElementNode(node)) {
      for (const child of node.getChildren()) {
        walk(child);
      }
    }
  };
  walk($getRoot());
  return ids;
}

function saveMentionHref(id: string): string {
  return `pond-save:${encodeURIComponent(id)}`;
}

export function parseSaveMentionHref(href: string): string | null {
  if (!href.startsWith("pond-save:")) {
    return null;
  }
  try {
    return decodeURIComponent(href.slice("pond-save:".length)) || null;
  } catch {
    return null;
  }
}

function mentionLabel(node: MdastParent): string {
  return node.children
    .map((child) => ("value" in child ? String(child.value ?? "") : ""))
    .join("");
}

function $importSaveMention(node: MdastParent & { url?: string }) {
  const id = parseSaveMentionHref(node.url ?? "");
  if (!id) {
    return null;
  }
  return $createSaveMentionNode(id, mentionLabel(node) || "Untitled");
}

function $exportSaveMention(node: LexicalNode): MdastNode | null {
  if (!$isSaveMentionNode(node)) {
    return null;
  }
  return {
    type: "link",
    url: saveMentionHref(node.getSaveId()),
    children: [{ type: "text", value: node.getTitle() }],
  };
}

const importRules: Array<MdastImportRule> = [
  { type: "link", $import: $importSaveMention },
];

const exportRules: Array<MdastExportRule> = [
  { type: "save-mention", $export: $exportSaveMention },
];

export const composerMdastExtension = configExtension(MdastImportExtension, {
  importRules,
  exportRules,
});

export function SaveMentionChip({
  id,
  title,
  onOpen,
}: {
  id: string;
  title: string;
  onOpen?: (id: string) => void;
}) {
  useSourceCovers([id]);
  const content = (
    <>
      <Chip.Icon>
        <span className={styles.cover}>
          <SourceThumbnail id={id} />
        </span>
      </Chip.Icon>
      <Chip.Label>{title}</Chip.Label>
    </>
  );
  if (onOpen) {
    return (
      <Chip.Action
        tone="mention"
        className={styles.mention}
        aria-label={`Open ${title}`}
        onClick={() => onOpen(id)}
      >
        {content}
      </Chip.Action>
    );
  }
  return (
    <span className={styles.mention}>
      <Chip.Item tone="mention" contentEditable={false}>
        {content}
      </Chip.Item>
    </span>
  );
}

export function ComposerMentions({
  attachments,
  onRemove,
}: {
  attachments: Array<AssistantSource>;
  onRemove: (id: string) => void;
}) {
  const [editor] = useLexicalComposerContext();
  const remove = useEffectEvent(onRemove);
  const seen = useRef(new Set<string>());
  const previous = useRef(new Set<string>());
  useEffect(() => {
    const added = attachments.filter((save) => !seen.current.has(save.id));
    seen.current = new Set(attachments.map((save) => save.id));
    if (!added.length) {
      return;
    }
    editor.update(() => {
      const present = new Set($saveMentionIds());
      for (const save of added) {
        if (!present.has(save.id)) {
          $insertSaveMention(save.id, save.title || "Untitled");
        }
      }
    });
  }, [attachments, editor]);
  useEffect(
    () =>
      editor.registerUpdateListener(({ editorState, tags }) => {
        const ids = new Set(editorState.read(() => $saveMentionIds()));
        if (!tags.has("external-draft")) {
          for (const id of previous.current) {
            if (!ids.has(id)) {
              remove(id);
            }
          }
        }
        previous.current = ids;
      }),
    [editor],
  );
  return null;
}
