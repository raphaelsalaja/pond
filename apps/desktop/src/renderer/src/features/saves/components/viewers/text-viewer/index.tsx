import { EditorStateExtension } from "@lexical/extension";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalExtensionComposer } from "@lexical/react/LexicalExtensionComposer";
import { useExtensionDependency } from "@lexical/react/useExtensionComponent";
import { useSignalValue } from "@lexical/react/useExtensionSignalValue";
import { Input } from "@pond/ui";
import { Debouncer } from "@tanstack/pacer";
import { useEffect, useMemo, useRef, useState } from "react";
import { ViewerHud } from "@/features/saves/components/viewers/hud";
import {
  ChromePortal,
  ViewerChrome,
} from "@/features/saves/components/viewers/media-viewer/chrome";
import { ViewerSaveNav } from "@/features/saves/components/viewers/viewer-save-nav";
import { ensureTextCover } from "@/features/saves/lib/ensure-text-cover";
import { mutateSave } from "@/features/saves/lib/mutate";
import {
  displayTitleForSave,
  noteBodyForSave,
} from "@/features/saves/lib/text";
import { pool } from "@/features/saves/state/pool";
import type { Save } from "@/features/saves/types";
import { stopAppHotkeysFromEditable } from "@/shared/lib/editable-target";
import { CollapsiblePlugin } from "./collapsible";
import { DraggableBlockPlugin } from "./draggable-block";
import { FormatToolbar } from "./format-toolbar";
import { markdownFromEditor } from "./markdown";
import { MermaidPreview } from "./mermaid-preview";
import { createNoteExtension } from "./note-extension";
import { NoteShortcuts } from "./shortcuts";
import { SlashMenu } from "./slash-menu";
import styles from "./styles.module.css";
import { YouTubeEmbed } from "./youtube-embed";

export const NOTE_TITLE_PLACEHOLDER = "Untitled";
export const NOTE_BODY_PLACEHOLDER = "Write anything, or type / for commands";

export function TextViewer({ save }: { save: Save }) {
  return (
    <ViewerChrome>
      <TextViewerSession
        key={`${save.id}:${save.source === "local" ? "edit" : "read"}`}
        save={save}
      />
    </ViewerChrome>
  );
}

function TextViewerSession({ save }: { save: Save }) {
  const editable = save.source === "local";
  const [anchor, setAnchor] = useState<HTMLDivElement | null>(null);
  const markdown = noteBodyForSave(save);
  const empty = !save.title?.trim() && !markdown;
  const [extension] = useState(() =>
    createNoteExtension({ markdown, editable }),
  );

  useEffect(() => {
    ensureTextCover(save);
  }, [save]);

  return (
    <div className={styles.root} data-scroll-fade="vertical">
      <ChromePortal slot="top">
        <ViewerHud.Bar
          label="Text"
          start={<ViewerSaveNav saveId={save.id} />}
        />
      </ChromePortal>
      <LexicalExtensionComposer
        key={save.id}
        extension={extension}
        contentEditable={null}
      >
        <div className={styles.document} ref={setAnchor}>
          {editable ? (
            <TitleField
              saveId={save.id}
              title={save.title ?? ""}
              autoFocus={empty}
            />
          ) : (
            <h1 className={styles.title}>{displayTitleForSave(save)}</h1>
          )}
          <div className={styles.body}>
            {editable ? (
              <ContentEditable
                className={styles.editor}
                aria-label="Note"
                aria-placeholder={NOTE_BODY_PLACEHOLDER}
                placeholder={
                  <div className={styles.placeholder}>
                    {NOTE_BODY_PLACEHOLDER}
                  </div>
                }
                onKeyDown={stopAppHotkeysFromEditable}
              />
            ) : (
              <ContentEditable
                className={styles.editor}
                aria-label="Note"
                onKeyDown={stopAppHotkeysFromEditable}
              />
            )}
          </div>
        </div>
        {editable ? (
          <>
            <NoteShortcuts />
            <SlashMenu />
            <FormatToolbar />
            <CollapsiblePlugin />
            <YouTubeEmbed />
            <MermaidPreview />
            {anchor ? <DraggableBlockPlugin anchor={anchor} /> : null}
            <PersistPlugin save={save} />
          </>
        ) : null}
      </LexicalExtensionComposer>
    </div>
  );
}

function TitleField({
  saveId,
  title,
  autoFocus,
}: {
  saveId: string;
  title: string;
  autoFocus: boolean;
}) {
  const [editor] = useLexicalComposerContext();
  const [draft, setDraft] = useState(title);
  const [syncedTitle, setSyncedTitle] = useState(title);
  if (title !== syncedTitle) {
    setSyncedTitle(title);
    if (title.trim() !== draft.trim()) setDraft(title);
  }
  const inputRef = useRef<HTMLInputElement>(null);
  const persist = useMemo(
    () =>
      new Debouncer(
        (id: string, next: string) => {
          const value = next.trim() || null;
          const current = pool.get(id)?.title?.trim() || null;
          if (value === current) return;
          void mutateSave(id, { title: value }, { actorReason: "user:rename" });
        },
        { wait: 400 },
      ),
    [],
  );

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => () => persist.flush(), [persist]);

  return (
    <Input.Field
      ref={inputRef}
      appearance="bare"
      className={styles.title}
      value={draft}
      placeholder={NOTE_TITLE_PLACEHOLDER}
      aria-label="Title"
      onChange={(event) => {
        const next = event.target.value;
        setDraft(next);
        persist.maybeExecute(saveId, next);
      }}
      onBlur={() => persist.flush()}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.nativeEvent.isComposing) {
          event.preventDefault();
          editor.focus();
        }
        stopAppHotkeysFromEditable(event);
      }}
    />
  );
}

function PersistPlugin({ save }: { save: Save }) {
  const [editor] = useLexicalComposerContext();
  const saveRef = useRef(save);
  saveRef.current = save;
  const last = useRef(noteBodyForSave(save));
  const { output } = useExtensionDependency(EditorStateExtension);
  const editorState = useSignalValue(output);
  const persist = useMemo(
    () =>
      new Debouncer(
        (id: string, markdown: string) => {
          const current = saveRef.current;
          const next = markdown.trim() || null;
          const prev = current.description?.trim() || null;
          if (next === prev) return;
          void mutateSave(
            id,
            { description: next },
            { actorReason: "user:edit-description" },
          );
          ensureTextCover({ ...current, description: next }, { force: true });
        },
        { wait: 400 },
      ),
    [],
  );

  useEffect(() => () => persist.flush(), [persist]);

  useEffect(() => {
    if (!editorState) return;
    const markdown = markdownFromEditor(editor);
    if (markdown === last.current) return;
    last.current = markdown;
    persist.maybeExecute(save.id, markdown);
  }, [editor, editorState, persist, save.id]);

  return null;
}
