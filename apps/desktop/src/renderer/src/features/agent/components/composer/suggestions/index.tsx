import { $isCodeNode } from "@lexical/code";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  type MenuTextMatch,
} from "@lexical/react/LexicalTypeaheadMenuPlugin";
import { $findMatchingParent } from "@lexical/utils";
import {
  IconBlockquote,
  IconBulletList,
  IconCheckList,
  IconCode2,
  IconFile,
  IconHeading1,
  IconHeading2,
  IconHeading3,
  IconOrderedList,
  IconSquareCode,
} from "@pond/icons";
import type { IconComponent } from "@pond/icons/types";
import { Menu, Popover } from "@pond/ui";
import { type AssistantSource, assistantSources } from "@shared/assistant";
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_NORMAL,
  KEY_ESCAPE_COMMAND,
} from "lexical";
import {
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import { z } from "zod";
import { IS_MAC } from "@/shared/lib/platform";
import { platformGlyphs } from "@/shared/lib/shortcuts";
import {
  $applyMarkdownBlock,
  type MarkdownBlock,
} from "@/shared/markdown-editor/blocks";
import { findComposerTrigger } from "../../pane/composer-trigger";
import { SourceThumbnail } from "../../pane/save-preview";
import { $insertSaveMention } from "../mention";
import styles from "./styles.module.css";

type ComposerCommand =
  | { kind: "block"; block: MarkdownBlock }
  | { kind: "save"; save: AssistantSource };

export interface ComposerFormattingOption {
  key: string;
  label: string;
  glyph: IconComponent;
  block: MarkdownBlock;
  shortcut?: string[];
}

class ComposerOption extends MenuOption {
  constructor(
    key: string,
    public label: string,
    public glyph: IconComponent,
    public command: ComposerCommand,
    public shortcut?: string[],
  ) {
    super(key);
  }
}
const COMPOSER_FORMATTING: ComposerFormattingOption[] = [
  {
    key: "bullet",
    label: "Bulleted List",
    glyph: IconBulletList,
    block: "bullet",
    shortcut: ["⌘", "⇧", "8"],
  },
  {
    key: "number",
    label: "Numbered List",
    glyph: IconOrderedList,
    block: "number",
    shortcut: ["⌘", "⇧", "9"],
  },
  {
    key: "check",
    label: "Checklist",
    glyph: IconCheckList,
    block: "check",
    shortcut: ["⌘", "⇧", "7"],
  },
  {
    key: "code",
    label: "Code Block",
    glyph: IconCode2,
    block: "code",
    shortcut: ["⌘", "⇧", "\\"],
  },
  {
    key: "quote",
    label: "Blockquote",
    glyph: IconBlockquote,
    block: "quote",
    shortcut: ["⌥", "⇧", "."],
  },
  {
    key: "table",
    label: "Table",
    glyph: IconSquareCode,
    block: "table",
  },
  {
    key: "h1",
    label: "Heading 1",
    glyph: IconHeading1,
    block: "h1",
  },
  {
    key: "h2",
    label: "Heading 2",
    glyph: IconHeading2,
    block: "h2",
  },
  {
    key: "h3",
    label: "Heading 3",
    glyph: IconHeading3,
    block: "h3",
  },
  {
    key: "paragraph",
    label: "Plain Text",
    glyph: IconFile,
    block: "paragraph",
  },
];
const FORMATTING = COMPOSER_FORMATTING.map(
  (option) =>
    new ComposerOption(
      option.key,
      option.label,
      option.glyph,
      { kind: "block", block: option.block },
      option.shortcut,
    ),
);
const searchSchema = z.object({ saves: assistantSources });

export function ComposerSuggestions({
  attachments,
  anchorRef,
  onAttach,
}: {
  attachments: AssistantSource[];
  anchorRef: RefObject<HTMLDivElement | null>;
  onAttach: (saves: AssistantSource[]) => void;
}) {
  const [editor] = useLexicalComposerContext();
  const listId = useId();
  const [query, setQuery] = useState<string | null>(null);
  const [result, setResult] = useState<{
    query: string;
    saves: AssistantSource[];
    error?: string;
  } | null>(null);
  const mention = query?.startsWith("@") ?? false;
  const term = query?.slice(1).trim() ?? "";
  useEffect(() => {
    if (!mention) return;
    let active = true;
    const timer = setTimeout(() => {
      void window.pond
        .query("agent.searchSaves", { query: term, limit: 12 })
        .then((data) => {
          if (active)
            setResult({ query: term, saves: searchSchema.parse(data).saves });
        })
        .catch(() => {
          if (active)
            setResult({
              query: term,
              saves: [],
              error: "Could not search Saves. Type to try again.",
            });
        });
    }, 150);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [mention, term]);
  const groups = useMemo(() => {
    if (mention)
      return [
        {
          label: "Saves",
          options: (result?.query === term && attachments.length < 24
            ? result.saves
            : []
          )
            .filter(
              (save) =>
                !attachments.some((attached) => attached.id === save.id),
            )
            .map(
              (save) =>
                new ComposerOption(
                  save.id,
                  save.title || "Untitled",
                  IconFile,
                  { kind: "save", save },
                ),
            ),
        },
      ];
    return [{ label: "Formatting", options: FORMATTING }]
      .map((group) => ({
        ...group,
        options: group.options.filter((option) =>
          `${option.label} ${option.key}`
            .toLowerCase()
            .includes(term.toLowerCase()),
        ),
      }))
      .filter((group) => group.options.length);
  }, [mention, term, result, attachments]);
  const options = useMemo(
    () => groups.flatMap((group) => group.options),
    [groups],
  );
  const trigger = useCallback(
    (text: string): MenuTextMatch | null => {
      const selection = $getSelection();
      if (
        !editor.isEditable() ||
        editor.isComposing() ||
        !$isRangeSelection(selection) ||
        $findMatchingParent(selection.anchor.getNode(), $isCodeNode)
      )
        return null;
      const match = findComposerTrigger(text, text.length);
      return match
        ? {
            leadOffset: match.start,
            matchingString: `${match.kind}${match.query}`,
            replaceableString: `${match.kind}${match.query}`,
          }
        : null;
    },
    [editor],
  );
  return (
    <LexicalTypeaheadMenuPlugin<ComposerOption>
      options={options}
      triggerFn={trigger}
      onQueryChange={setQuery}
      commandPriority={COMMAND_PRIORITY_NORMAL}
      preselectFirstItem
      onSelectOption={(option, node, close) => {
        editor.update(() => {
          node?.remove();
          if (option.command.kind === "block")
            $applyMarkdownBlock(option.command.block);
          if (option.command.kind === "save")
            $insertSaveMention(
              option.command.save.id,
              option.command.save.title || "Untitled",
            );
        });
        close();
        if (option.command.kind === "save") onAttach([option.command.save]);
      }}
      menuRenderFn={(
        anchor,
        { selectedIndex, setHighlightedIndex, selectOptionAndCleanUp },
        _matchingString,
      ) => (
        <MenuOwnership
          anchorRef={anchor}
          listId={listId}
          label={mention ? "Saves" : "Composer Commands"}
        >
          <Popover.Root
            open
            modal={false}
            onOpenChange={(open) => {
              if (!open)
                editor.dispatchCommand(
                  KEY_ESCAPE_COMMAND,
                  new KeyboardEvent("keydown", { key: "Escape" }),
                );
            }}
          >
            <Popover.Portal>
              <Popover.Positioner
                anchor={anchorRef}
                side="top"
                align="start"
                sideOffset={8}
              >
                <Popover.Popup
                  initialFocus={false}
                  finalFocus={false}
                  render={<Menu.Surface className={styles.suggestions} />}
                >
                  <Menu.List id={listId} className={styles.options}>
                    {groups.map((group) => (
                      <Menu.Group key={group.label}>
                        {group.options.map((option) => {
                          const index = options.indexOf(option);
                          return (
                            <Menu.Row
                              key={option.key}
                              ref={option.setRefElement}
                              id={`typeahead-item-${index}`}
                              role="option"
                              tabIndex={-1}
                              aria-selected={selectedIndex === index}
                              highlighted={selectedIndex === index}
                              onMouseDown={(event) => event.preventDefault()}
                              onPointerMove={() => setHighlightedIndex(index)}
                              onClick={() => selectOptionAndCleanUp(option)}
                            >
                              <Menu.ItemIcon className={styles.media}>
                                {option.command.kind === "save" ? (
                                  <SourceThumbnail
                                    id={option.command.save.id}
                                    source={option.command.save}
                                  />
                                ) : (
                                  <option.glyph />
                                )}
                              </Menu.ItemIcon>
                              <Menu.ItemLabel className={styles.label}>
                                {option.label}
                              </Menu.ItemLabel>
                              {option.shortcut ? (
                                <Menu.ItemKeyboard>
                                  {IS_MAC
                                    ? option.shortcut.join("")
                                    : platformGlyphs(option.shortcut)}
                                </Menu.ItemKeyboard>
                              ) : null}
                            </Menu.Row>
                          );
                        })}
                      </Menu.Group>
                    ))}
                    {!options.length ? (
                      <p className={styles.empty} role="status">
                        {mention
                          ? attachments.length >= 24
                            ? "You can attach up to 24 Saves."
                            : result?.query !== term
                              ? "Searching your library"
                              : (result.error ??
                                "No Saves found. Try another search.")
                          : "No matching commands."}
                      </p>
                    ) : null}
                  </Menu.List>
                </Popover.Popup>
              </Popover.Positioner>
            </Popover.Portal>
          </Popover.Root>
        </MenuOwnership>
      )}
    />
  );
}

function MenuOwnership({
  anchorRef,
  listId,
  label,
  children,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  listId: string;
  label: string;
  children: ReactNode;
}) {
  useEffect(() => {
    const anchor = anchorRef.current;
    anchor?.setAttribute("aria-owns", listId);
    anchor?.setAttribute("aria-label", label);
    return () => {
      anchor?.removeAttribute("aria-owns");
    };
  }, [anchorRef, listId, label]);
  return children;
}
