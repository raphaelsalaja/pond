import { AutoFocusPlugin } from "@lexical/react/LexicalAutoFocusPlugin";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import { IconCircleXmarkFill } from "@pond/icons";
import { Button, Loader, Tooltip } from "@pond/ui";
import {
  $createTextNode,
  $getRoot,
  COMMAND_PRIORITY_LOW,
  INSERT_LINE_BREAK_COMMAND,
  INSERT_PARAGRAPH_COMMAND,
  KEY_ESCAPE_COMMAND,
  LineBreakNode,
  SKIP_DOM_SELECTION_TAG,
} from "lexical";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  setSearchDraft,
  setSearchInput,
  useFilterQuery,
  useSearchInput,
  useSearchNonce,
  useSearchText,
} from "@/features/library";
import {
  useNlCompiler,
  useNlFacets,
} from "@/features/search/hooks/use-nl-query";
import {
  dedupePredicates,
  flattenPredicates,
} from "@/features/search/lib/nl-query";
import { parseSearchInput } from "@/features/search/lib/syntax";
import { useTags } from "@/features/tags";
import { SpecContextMenu } from "@/shared/components/spec-context-menu";
import { stopAppHotkeysFromEditable } from "@/shared/lib/editable-target";
import { usePrefs } from "@/shared/state/prefs";
import { $readSearchString, $writeSearchString } from "./lib/editor-state";
import { FilterTokenNode } from "./lib/token-node";
import { FilterTokenPlugin } from "./lib/token-plugin";
import { FilterTypeahead } from "./lib/typeahead";
import { buildSearchScopeItems } from "./search-scope-menu";
import styles from "./styles.module.css";

export interface SearchComposerProps {
  compile?: ReturnType<typeof useNlCompiler>;
  placeholder?: string;
  children?: ReactNode;
}

export function SearchComposer({
  compile,
  placeholder = "Search your library…",
  children,
}: SearchComposerProps = {}) {
  const initialConfig = useMemo(
    () => ({
      namespace: "search-composer",
      nodes: [FilterTokenNode],
      theme: { paragraph: styles.paragraph },
      onError: (error: Error) => {
        console.error("[pond search]", error);
      },
    }),
    [],
  );

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <SearchField compileOverride={compile} placeholder={placeholder} />
      {children}
    </LexicalComposer>
  );
}

function SearchField({
  compileOverride,
  placeholder,
}: {
  compileOverride?: ReturnType<typeof useNlCompiler>;
  placeholder: string;
}) {
  const [editor] = useLexicalComposerContext();
  const tags = useTags();
  const facets = useNlFacets();
  const defaultCompile = useNlCompiler();
  const compile = compileOverride ?? defaultCompile;
  const searchNonce = useSearchNonce();
  const hostRef = useRef<HTMLDivElement>(null);
  const [typeaheadOpen, setTypeaheadOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "thinking" | "error">("idle");
  const compileRef = useRef(compile);
  compileRef.current = compile;
  const statusRef = useRef(status);
  statusRef.current = status;
  const typeaheadOpenRef = useRef(typeaheadOpen);
  typeaheadOpenRef.current = typeaheadOpen;
  const runRef = useRef(0);
  const [searchPrefs, patchSearchPrefs] = usePrefs("search");

  const tagNames = useMemo(() => tags.map((t) => t.name), [tags]);

  const seedInput = useSearchInput();
  const seedQuery = useFilterQuery();
  const seedText = useSearchText();
  const lastQueryRef = useRef(seedQuery);
  useEffect(() => {
    const serialized = seedInput.trim() || seedText;
    const current = editor.getEditorState().read($readSearchString);
    const queryChanged = lastQueryRef.current !== seedQuery;
    lastQueryRef.current = seedQuery;
    if (!queryChanged && current === serialized.trim()) return;
    runRef.current += 1;
    setStatus("idle");
    if (current === serialized.trim()) return;
    editor.update(
      () => {
        $writeSearchString(serialized);
      },
      { tag: ["search-store-sync", SKIP_DOM_SELECTION_TAG] },
    );
  }, [editor, seedInput, seedQuery, seedText]);

  useEffect(() => {
    return editor.registerUpdateListener(
      ({ editorState, prevEditorState, tags }) => {
        if (tags.has("search-store-sync")) return;
        editorState.read(() => {
          const raw = $readSearchString();
          const commitFilters =
            /\s$/.test($getRoot().getTextContent()) &&
            (raw.match(/"/g)?.length ?? 0) % 2 === 0 &&
            parseSearchInput(raw).predicates.length > 0;
          if (raw === prevEditorState.read($readSearchString) && !commitFilters)
            return;
          runRef.current += 1;
          setStatus("idle");
          setSearchDraft(raw, commitFilters);
        });
      },
    );
  }, [editor]);

  useEffect(() => {
    if (searchNonce === 0) return;
    editor.focus();
  }, [editor, searchNonce]);

  const cancelAi = useCallback(() => {
    runRef.current += 1;
    setStatus("idle");
  }, []);

  const submitAi = async () => {
    if (statusRef.current === "thinking") return;
    let raw = "";
    editor.getEditorState().read(() => {
      raw = $readSearchString();
    });
    if (!raw) return;
    const parsed = parseSearchInput(raw);
    if (!parsed.text.trim()) {
      setSearchDraft(raw, true);
      return;
    }
    runRef.current += 1;
    const nonce = runRef.current;
    setStatus("thinking");
    try {
      const compiled = await compileRef.current(parsed.text);
      if (runRef.current !== nonce) return;
      const residual = compiled.residual.trim();
      const predicates = dedupePredicates([
        ...flattenPredicates(seedQuery),
        ...parsed.predicates,
        ...flattenPredicates(compiled.plan.filter),
      ]);
      setSearchInput(predicates, residual, residual);
      editor.update(() => $writeSearchString(residual), {
        tag: "search-store-sync",
      });
      setStatus("idle");
    } catch {
      if (runRef.current !== nonce) return;
      setStatus("error");
    }
  };

  const submitAiRef = useRef(submitAi);
  submitAiRef.current = submitAi;

  useEffect(() => {
    return editor.registerCommand(
      KEY_ESCAPE_COMMAND,
      () => {
        if (statusRef.current === "thinking") {
          cancelAi();
          return true;
        }
        if (typeaheadOpenRef.current) return true;
        editor.getRootElement()?.blur();
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor, cancelAi]);

  useEffect(() => {
    const submitOrSwallow = () => {
      void submitAiRef.current();
      return true;
    };
    const unregisterBreak = editor.registerCommand(
      INSERT_LINE_BREAK_COMMAND,
      submitOrSwallow,
      COMMAND_PRIORITY_LOW,
    );
    const unregisterParagraph = editor.registerCommand(
      INSERT_PARAGRAPH_COMMAND,
      submitOrSwallow,
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

  const hasText = seedInput.trim().length > 0;

  const clearField = () => {
    cancelAi();
    setSearchDraft("");
    editor.update(() => {
      $writeSearchString("");
    });
  };

  return (
    <div ref={hostRef} className={styles.wrap}>
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
                  aria-busy={status === "thinking"}
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
            <FilterTokenPlugin />
            <FilterTypeahead
              hostRef={hostRef}
              onOpenChange={setTypeaheadOpen}
              tags={tagNames}
              sources={facets.sources}
              creators={facets.creators}
            />
          </div>
          {status === "thinking" ? (
            <Loader.Root className={styles.thinking}>
              <Loader.Dots />
              Finding filters
            </Loader.Root>
          ) : null}
          {hasText ? (
            <Tooltip label="Clear Search" side="bottom">
              <Button
                icon
                size="xs"
                variant="text"
                className={styles.clear}
                aria-label="Clear Search"
                onMouseDown={(event) => event.preventDefault()}
                onClick={clearField}
              >
                <IconCircleXmarkFill />
              </Button>
            </Tooltip>
          ) : null}
        </div>
      </SpecContextMenu>
      {status === "error" ? (
        <div className={styles.status}>
          <span role="status">
            Couldn't interpret filters. Keyword search is still active.
            <Button
              size="xs"
              variant="ghost"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void submitAi()}
            >
              Retry
            </Button>
          </span>
        </div>
      ) : null}
    </div>
  );
}
