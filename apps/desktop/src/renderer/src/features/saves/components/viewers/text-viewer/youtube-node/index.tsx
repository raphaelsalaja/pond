import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { IconArrowUpRight } from "@pond/icons";
import { Button, Input } from "@pond/ui";
import { $applyNodeReplacement, $getNodeByKey, DecoratorNode } from "lexical";
import type {
  EditorConfig,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from "lexical";
import { useState } from "react";
import type { JSX } from "react";
import styles from "./styles.module.css";

const YOUTUBE_ID =
  /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;

export type SerializedYouTubeNode = Spread<
  { id: string },
  SerializedLexicalNode
>;

export function parseYouTubeId(value: string): string | null {
  const match = YOUTUBE_ID.exec(value);
  return match?.[1] ?? null;
}

export function youtubeWatchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

function youtubeEmbedUrl(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}`;
}

export class YouTubeNode extends DecoratorNode<JSX.Element> {
  __id: string;

  constructor(id: string, key?: NodeKey) {
    super(key);
    this.__id = id;
  }

  static getType(): string {
    return "youtube";
  }

  static clone(node: YouTubeNode): YouTubeNode {
    return new YouTubeNode(node.__id, node.__key);
  }

  static importJSON(serialized: SerializedYouTubeNode): YouTubeNode {
    return $createYouTubeNode(serialized.id).updateFromJSON(serialized);
  }

  exportJSON(): SerializedYouTubeNode {
    return { ...super.exportJSON(), id: this.__id };
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const figure = document.createElement("figure");
    figure.className = styles.media ?? "";
    return figure;
  }

  updateDOM(): boolean {
    return false;
  }

  isInline(): false {
    return false;
  }

  isKeyboardSelectable(): boolean {
    return true;
  }

  getId(): string {
    return this.__id;
  }

  setId(id: string): this {
    const writable = this.getWritable();
    writable.__id = id;
    return writable;
  }

  decorate(): JSX.Element {
    if (!this.__id) {
      return <YouTubeDraft nodeKey={this.getKey()} />;
    }
    const watch = youtubeWatchUrl(this.__id);
    return (
      <div className={styles.youtube}>
        <iframe
          className={styles.frame}
          src={youtubeEmbedUrl(this.__id)}
          title="YouTube"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        />
        <Button
          size="xs"
          variant="ghost"
          aria-label="Open"
          onClick={() => {
            void window.pond.openExternal(watch);
          }}
        >
          <IconArrowUpRight />
          Open
        </Button>
      </div>
    );
  }
}

function YouTubeDraft({ nodeKey }: { nodeKey: NodeKey }) {
  const [editor] = useLexicalComposerContext();
  const [value, setValue] = useState("");
  const [invalid, setInvalid] = useState(false);

  function embed() {
    const id = parseYouTubeId(value);
    if (!id) {
      setInvalid(true);
      return;
    }
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if ($isYouTubeNode(node)) {
        node.setId(id);
      }
    });
  }

  return (
    <form
      className={styles.draft}
      onSubmit={(event) => {
        event.preventDefault();
        embed();
      }}
    >
      <Input.Root size="sm">
        <Input.Field
          aria-label="YouTube link"
          placeholder="https://www.youtube.com/watch?v="
          value={value}
          aria-invalid={invalid || undefined}
          onValueChange={(next) => {
            setInvalid(false);
            setValue(next);
          }}
        />
      </Input.Root>
      <Button size="sm" type="submit">
        Embed
      </Button>
    </form>
  );
}

export function $createYouTubeNode(id: string): YouTubeNode {
  return $applyNodeReplacement(new YouTubeNode(id));
}

export function $isYouTubeNode(
  node: LexicalNode | null | undefined,
): node is YouTubeNode {
  return node?.getType() === YouTubeNode.getType();
}
