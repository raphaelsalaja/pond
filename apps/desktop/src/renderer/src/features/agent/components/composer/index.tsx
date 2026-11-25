import { TokenInput } from "@pond/ui/token-input";
import { assistantSources } from "@shared/assistant";
import type { AssistantSource } from "@shared/assistant";
import {
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { z } from "zod";
import { isLibrarySaveDrag, saveDropIds } from "@/features/saves";
import { stopAppHotkeysFromEditable } from "@/shared/lib/editable-target";
import { SourceThumbnail } from "../pane/save-preview";
import { SaveMentionChip, saveMentionCodec, saveMentionIds } from "./mention";
import styles from "./styles.module.css";

const MAX_LENGTH = 32_000;
const MAX_SAVES = 24;
const searchSchema = z.object({ saves: assistantSources });

export interface ComposerEditorHandle {
  focus: () => void;
  /** Types `@` at the caret so the Save search opens. */
  mention: () => void;
}

export interface ComposerEditorProps {
  value: string;
  disabled: boolean;
  running: boolean;
  placeholder: string;
  attachments: Array<AssistantSource>;
  anchorRef: RefObject<HTMLDivElement | null>;
  ref?: Ref<ComposerEditorHandle>;
  onChange: (markdown: string) => void;
  onSend: (markdown: string) => void;
  onQueue?: (markdown: string) => void;
  onAttach: (saves: Array<AssistantSource>) => void;
  onRemove: (id: string) => void;
  onDropIds: (ids: Array<string>) => void;
}

interface SearchResult {
  saves: Array<AssistantSource>;
  error?: string;
}

export function ComposerEditor({
  value,
  disabled,
  running,
  placeholder,
  attachments,
  anchorRef,
  ref,
  onChange,
  onSend,
  onQueue,
  onAttach,
  onRemove,
  onDropIds,
}: ComposerEditorProps) {
  const [input] = useState(TokenInput.createController);
  const [menu] = useState(TokenInput.createMenuController);
  const [initial] = useState(() =>
    TokenInput.fromText(value, saveMentionCodec),
  );
  const [result, setResult] = useState<SearchResult>({ saves: [] });
  const published = useRef(value);
  const restoring = useRef(false);
  const seen = useRef(new Set(attachments.map((save) => save.id)));
  const attached = useRef(attachments);
  attached.current = attachments;

  useImperativeHandle(
    ref,
    () => ({
      focus: () => input.focus(),
      mention: () => {
        input.focus();
        void menu.open({ trigger: "@" });
      },
    }),
    [input, menu],
  );

  useEffect(() => {
    if (value === published.current) {
      return;
    }
    published.current = value;
    restoring.current = true;
    input.setValue(TokenInput.fromText(value, saveMentionCodec));
    restoring.current = false;
  }, [input, value]);

  useEffect(() => {
    const added = attachments.filter((save) => !seen.current.has(save.id));
    seen.current = new Set(attachments.map((save) => save.id));
    const present = saveMentionIds(input.getText(saveMentionCodec));
    for (const save of added) {
      if (present.has(save.id)) {
        continue;
      }
      input.insert([
        { type: "save", value: save.id, label: save.title || "Untitled" },
        " ",
      ]);
    }
  }, [attachments, input]);

  const triggers = useMemo(
    () => [
      {
        char: "@",
        type: "save",
        items: async (query: string, { signal }: { signal: AbortSignal }) => {
          if (attached.current.length >= MAX_SAVES) {
            setResult({ saves: [] });
            return [];
          }
          try {
            const data = await window.pond.query("agent.searchSaves", {
              query: query.trim(),
              limit: 12,
            });
            const taken = new Set(attached.current.map((save) => save.id));
            const saves = searchSchema
              .parse(data)
              .saves.filter((save) => !taken.has(save.id));
            if (!signal.aborted) {
              setResult({ saves });
            }
            return saves.map((save) => ({
              value: save.id,
              label: save.title || "Untitled",
            }));
          } catch {
            if (!signal.aborted) {
              setResult({
                saves: [],
                error: "Could not search Saves. Type to try again.",
              });
            }
            return [];
          }
        },
      },
    ],
    [],
  );

  const anchor = useMemo(
    () => ({
      getBoundingClientRect: () =>
        anchorRef.current?.getBoundingClientRect() ?? new DOMRect(),
    }),
    [anchorRef],
  );

  return (
    <div
      className={styles.root}
      onDragOverCapture={(event) => {
        if (!isLibrarySaveDrag(event.dataTransfer)) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDropCapture={(event) => {
        const ids = saveDropIds(event.dataTransfer);
        if (!ids.length) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        onDropIds(ids);
      }}
    >
      <TokenInput.Root
        controller={input}
        defaultValue={initial}
        codec={saveMentionCodec}
        disabled={disabled}
        getTokenDescription={() => "Save"}
        renderToken={(token) => (
          <TokenInput.Token>
            <SaveMentionChip id={token.value} title={token.label} />
          </TokenInput.Token>
        )}
        onValueChange={(next, details) => {
          const markdown = TokenInput.toText(next, saveMentionCodec);
          if (markdown.length > MAX_LENGTH) {
            details.cancel();
            return;
          }
          if (!restoring.current) {
            const kept = saveMentionIds(markdown);
            for (const token of details.removed) {
              if (token.type === "save" && !kept.has(token.value)) {
                onRemove(token.value);
              }
            }
          }
          if (markdown === published.current) {
            return;
          }
          published.current = markdown;
          onChange(markdown);
        }}
        onSubmit={(next) => {
          const markdown = TokenInput.toText(next, saveMentionCodec);
          if (!running) {
            onSend(markdown);
          } else {
            onQueue?.(markdown);
          }
        }}
      >
        <TokenInput.Editor
          className={styles.editor}
          aria-label="Message"
          placeholder={placeholder}
          onKeyDown={stopAppHotkeysFromEditable}
        />
        <TokenInput.Menu
          controller={menu}
          triggers={triggers}
          onSelect={(id) => {
            const save = result.saves.find((item) => item.id === id);
            if (!save) {
              return;
            }
            seen.current.add(save.id);
            onAttach([save]);
          }}
        >
          <TokenInput.Popup anchor={anchor}>
            <TokenInput.Status />
            <TokenInput.Empty>
              {(state) =>
                state.loading
                  ? "Searching your library"
                  : attachments.length >= MAX_SAVES
                    ? "You can attach up to 24 Saves."
                    : (result.error ?? "No Saves found. Try another search.")
              }
            </TokenInput.Empty>
            <TokenInput.List aria-label="Saves">
              {result.saves.map((save) => (
                <TokenInput.Item
                  key={save.id}
                  value={save.id}
                  label={save.title || "Untitled"}
                >
                  <TokenInput.ItemIcon className={styles.media}>
                    <SourceThumbnail id={save.id} source={save} />
                  </TokenInput.ItemIcon>
                  <TokenInput.ItemLabel>
                    {save.title || "Untitled"}
                  </TokenInput.ItemLabel>
                </TokenInput.Item>
              ))}
            </TokenInput.List>
          </TokenInput.Popup>
        </TokenInput.Menu>
      </TokenInput.Root>
    </div>
  );
}
