import { Chip, FileIcon } from "@pond/ui";
import { $applyNodeReplacement, DecoratorNode } from "lexical";
import type {
  EditorConfig,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from "lexical";
import type { JSX } from "react";
import styles from "./styles.module.css";

export type SerializedFileNode = Spread<
  { href: string; name: string },
  SerializedLexicalNode
>;

export class FileNode extends DecoratorNode<JSX.Element> {
  __href: string;
  __name: string;

  constructor(href: string, name: string, key?: NodeKey) {
    super(key);
    this.__href = href;
    this.__name = name;
  }

  static getType(): string {
    return "file";
  }

  static clone(node: FileNode): FileNode {
    return new FileNode(node.__href, node.__name, node.__key);
  }

  static importJSON(serialized: SerializedFileNode): FileNode {
    return $createFileNode({
      href: serialized.href,
      name: serialized.name,
    }).updateFromJSON(serialized);
  }

  exportJSON(): SerializedFileNode {
    return { ...super.exportJSON(), href: this.__href, name: this.__name };
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const span = document.createElement("span");
    span.className = styles.file ?? "";
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

  getHref(): string {
    return this.__href;
  }

  getName(): string {
    return this.__name;
  }

  decorate(): JSX.Element {
    return (
      <Chip.Link
        href={this.__href}
        onClick={(event) => {
          event.preventDefault();
          void window.pond.openExternal(this.__href);
        }}
      >
        <Chip.Icon>
          <FileIcon name={this.__name} />
        </Chip.Icon>
        <Chip.Label>{this.__name}</Chip.Label>
      </Chip.Link>
    );
  }
}

export function $createFileNode(opts: {
  href: string;
  name: string;
}): FileNode {
  return $applyNodeReplacement(new FileNode(opts.href, opts.name));
}

export function $isFileNode(
  node: LexicalNode | null | undefined,
): node is FileNode {
  return node?.getType() === FileNode.getType();
}
