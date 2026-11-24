import { AutoFocusPlugin } from "@lexical/react/LexicalAutoFocusPlugin";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import log from "electron-log/renderer";
import {
  $createTextNode,
  COMMAND_PRIORITY_LOW,
  INSERT_LINE_BREAK_COMMAND,
  INSERT_PARAGRAPH_COMMAND,
  KEY_ESCAPE_COMMAND,
  LineBreakNode,
  SKIP_DOM_SELECTION_TAG,
} from "lexical";
import { useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import {
  setSearchDraft,
  useSearchInput,
  useSearchNonce,
  useSearchText,
} from "@/features/library";
import { SpecContextMenu } from "@/shared/components/spec-context-menu";
import { stopAppHotkeysFromEditable } from "@/shared/lib/editable-target";
import { usePrefs } from "@/shared/state/prefs";
import { $readSearchString, $writeSearchString } from "./lib/editor-state";
import { buildSearchScopeItems } from "./search-scope-menu";
import styles from "./styles.module.css";

export interface SearchComposerProps {
  placeholder?: string;
  children?: ReactNode;
}

export function SearchComposer({
  placeholder = "Search…",
  children,
}: SearchComposerProps = {}) {
  const initialConfig = useMemo(
    () => ({
      namespace: "search-composer",
      theme: { paragraph: styles.paragraph },
      onError: (error: Error) => {
        log.error("[pond search]", error);
      },
    }),
    [],
  );

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <SearchField placeholder={placeholder} />
      {children}
    </LexicalComposer>
  );
}

function SearchField({ placeholder }: { placeholder: string }) {
  const [editor] = useLexicalComposerContext();
  const searchNonce = useSearchNonce();
  const [searchPrefs, patchSearchPrefs] = usePrefs("search");

  const seedInput = useSearchInput();
  const seedText = useSearchText();
  useEffect(() => {
    const serialized = seedInput.trim() || seedText;
    const current = editor.getEditorState().read($readSearchString);
    if (current === serialized.trim()) {
      return;
    }
    editor.update(
      () => {
        $writeSearchString(serialized);
      },
      { tag: ["search-store-sync", SKIP_DOM_SELECTION_TAG] },
    );
  }, [editor, seedInput, seedText]);

  useEffect(() => {
    return editor.registerUpdateListener(
      ({ editorState, prevEditorState, tags }) => {
        if (tags.has("search-store-sync")) {
          return;
        }
        editorState.read(() => {
          const raw = $readSearchString();
          if (raw === prevEditorState.read($readSearchString)) {
            return;
          }
          setSearchDraft(raw);
        });
      },
    );
  }, [editor]);

  useEffect(() => {
    if (searchNonce === 0) {
      return;
    }
    editor.focus();
  }, [editor, searchNonce]);

  useEffect(() => {
    return editor.registerCommand(
      KEY_ESCAPE_COMMAND,
      () => {
        editor.getRootElement()?.blur();
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor]);

  useEffect(() => {
    const swallow = () => true;
    const unregisterBreak = editor.registerCommand(
      INSERT_LINE_BREAK_COMMAND,
      swallow,
      COMMAND_PRIORITY_LOW,
    );
    const unregisterParagraph = editor.registerCommand(
      INSERT_PARAGRAPH_COMMAND,
      swallow,
      COMMAND_PRIORITY_LOW,
    );
    const unregisterTransform = editor.registerNodeTransform(
      LineBreakNode,
      (node) => {
        node.replace($createTextNode(" "));
      },
    );
    return () => {
      unregisterBreak();
      unregisterParagraph();
      unregisterTransform();
    };
  }, [editor]);

  return (
    <div className={styles.wrap}>
      <SpecContextMenu
        buildItems={() =>
          buildSearchScopeItems({
            scopes: searchPrefs.scopes,
            onChange: (scopes) => void patchSearchPrefs({ scopes }),
          })
        }
      >
        <div className={styles.bar}>
          <div className={styles.editor}>
            <PlainTextPlugin
              contentEditable={
                <ContentEditable
                  className={styles.input}
                  spellCheck={false}
                  ariaLabel="Search"
                  data-library-search=""
                  onKeyDown={stopAppHotkeysFromEditable}
                />
              }
              placeholder={
                <span className={styles.placeholder}>{placeholder}</span>
              }
              ErrorBoundary={LexicalErrorBoundary}
            />
            <HistoryPlugin />
            {searchNonce > 0 ? <AutoFocusPlugin /> : null}
          </div>
        </div>
      </SpecContextMenu>
    </div>
  );
}
