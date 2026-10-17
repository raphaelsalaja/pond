import { TOGGLE_LINK_COMMAND } from "@lexical/link";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalFocusManagerRef } from "@lexical/react/useLexicalFocusManagerRef";
import { mergeRegister } from "@lexical/utils";
import {
  IconArrowUpRight,
  IconBlockquote,
  IconBulletList,
  IconCaretMinimize,
  IconChatBubble,
  IconCheckList,
  IconChevronDown,
  IconCode,
  IconCode2,
  IconHeading1,
  IconHeading2,
  IconHeading3,
  IconHeading4,
  IconLink2,
  IconOrderedList,
  IconTextBold,
  IconTextItalic,
  IconTextStrikethrough,
  IconTextUnderline,
  IconTrash,
} from "@pond/icons";
import { Button, Keyboard, Menu, Popover, Toolbar, Tooltip } from "@pond/ui";
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  FORMAT_TEXT_COMMAND,
  SELECTION_CHANGE_COMMAND,
  type TextFormatType,
} from "lexical";
import {
  type ComponentType,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { saveLibraryBridge } from "@/features/saves/lib/library-bridge";
import { platformGlyphs } from "@/shared/lib/shortcuts";
import { $inCollapsible } from "../collapsible";
import {
  $getNoteBlock,
  $linkHref,
  $restoreRange,
  applyNoteBlock,
  type NoteBlock,
  OPEN_NOTE_LINK_COMMAND,
} from "../commands";
import styles from "./styles.module.css";

interface Formats {
  bold: boolean;
  italic: boolean;
  strikethrough: boolean;
  underline: boolean;
  code: boolean;
  href: string;
  collapse: boolean;
  block: NoteBlock;
}

const EMPTY: Formats = {
  bold: false,
  italic: false,
  strikethrough: false,
  underline: false,
  code: false,
  href: "",
  collapse: false,
  block: "paragraph",
};

type SavedRange = {
  anchor: { key: string; offset: number; type: "text" | "element" };
  focus: { key: string; offset: number; type: "text" | "element" };
};

function hrefFromDraft(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function httpHref(value: string): string | null {
  const href = hrefFromDraft(value);
  if (!href) return null;
  try {
    const url = new URL(href);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.toString();
    }
  } catch {
    return null;
  }
  return null;
}

const STYLES: {
  block: NoteBlock;
  label: string;
  shortcut: string[];
  Icon?: ComponentType;
}[] = [
  { block: "paragraph", label: "Regular Text", shortcut: ["⌘", "⌥", "0"] },
  {
    block: "h1",
    label: "Heading 1",
    shortcut: ["⌘", "⌥", "1"],
    Icon: IconHeading1,
  },
  {
    block: "h2",
    label: "Heading 2",
    shortcut: ["⌘", "⌥", "2"],
    Icon: IconHeading2,
  },
  {
    block: "h3",
    label: "Heading 3",
    shortcut: ["⌘", "⌥", "3"],
    Icon: IconHeading3,
  },
  {
    block: "h4",
    label: "Heading 4",
    shortcut: ["⌘", "⌥", "4"],
    Icon: IconHeading4,
  },
];

function StyleGlyph({ block }: { block: NoteBlock }) {
  const Icon = STYLES.find((item) => item.block === block)?.Icon;
  return Icon ? <Icon /> : "Aa";
}

function ListGlyph({ block }: { block: NoteBlock }) {
  if (block === "number") return <IconOrderedList />;
  if (block === "check") return <IconCheckList />;
  return <IconBulletList />;
}

const LISTS: {
  block: NoteBlock;
  label: string;
  shortcut: string[];
  icon: ReactNode;
}[] = [
  {
    block: "bullet",
    label: "Bulleted List",
    shortcut: ["⌘", "⇧", "8"],
    icon: <IconBulletList />,
  },
  {
    block: "number",
    label: "Numbered List",
    shortcut: ["⌘", "⇧", "9"],
    icon: <IconOrderedList />,
  },
  {
    block: "check",
    label: "Checklist",
    shortcut: ["⌘", "⇧", "7"],
    icon: <IconCheckList />,
  },
];

export function FormatToolbar() {
  const [editor] = useLexicalComposerContext();
  const toolbarRef = useLexicalFocusManagerRef();
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [open, setOpen] = useState(false);
  const [formats, setFormats] = useState<Formats>(EMPTY);
  const [linkMode, setLinkMode] = useState(false);
  const [draft, setDraft] = useState("");
  const explicit = useRef(false);
  const skipBlur = useRef(false);
  const urlRef = useRef<HTMLInputElement>(null);
  const rangeRef = useRef<SavedRange | null>(null);
  const anchor = useMemo(
    () => (rect ? { getBoundingClientRect: () => rect } : null),
    [rect],
  );

  useEffect(() => {
    const sync = () => {
      editor.getEditorState().read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || selection.isCollapsed()) {
          if (urlRef.current === document.activeElement) return;
          explicit.current = false;
          setLinkMode(false);
          setOpen(false);
          return;
        }
        rangeRef.current = {
          anchor: {
            key: selection.anchor.key,
            offset: selection.anchor.offset,
            type: selection.anchor.type,
          },
          focus: {
            key: selection.focus.key,
            offset: selection.focus.offset,
            type: selection.focus.type,
          },
        };
        const native = window.getSelection();
        setRect(
          native && native.rangeCount > 0
            ? native.getRangeAt(0).getBoundingClientRect()
            : new DOMRect(),
        );
        const href = $linkHref() ?? "";
        setFormats({
          bold: selection.hasFormat("bold"),
          italic: selection.hasFormat("italic"),
          strikethrough: selection.hasFormat("strikethrough"),
          underline: selection.hasFormat("underline"),
          code: selection.hasFormat("code"),
          href,
          collapse: $inCollapsible(),
          block: $getNoteBlock(),
        });
        if (urlRef.current !== document.activeElement) {
          setDraft(href);
          setLinkMode(Boolean(href) || explicit.current);
        }
        setOpen(true);
      });
    };
    sync();
    return mergeRegister(
      editor.registerUpdateListener(sync),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          sync();
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        OPEN_NOTE_LINK_COMMAND,
        () => {
          explicit.current = true;
          setLinkMode(true);
          queueMicrotask(() => urlRef.current?.focus());
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
    );
  }, [editor]);

  const toggle = (format: TextFormatType) => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, format);
  };

  const applyHref = (value: string) => {
    const href = hrefFromDraft(value);
    editor.update(() => {
      if (rangeRef.current) $restoreRange(rangeRef.current);
    });
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, href);
  };

  const enterLink = () => {
    explicit.current = true;
    setDraft(formats.href);
    setLinkMode(true);
    queueMicrotask(() => urlRef.current?.focus());
  };

  const heading = Boolean(
    STYLES.find((item) => item.block === formats.block)?.Icon,
  );
  const listed =
    formats.block === "bullet" ||
    formats.block === "number" ||
    formats.block === "check";
  const openHref = httpHref(draft);

  return (
    <Popover.Root open={open} modal={false}>
      <Popover.Portal>
        <Popover.Positioner
          anchor={anchor}
          side="top"
          align="center"
          sideOffset={8}
        >
          <Popover.Popup
            className={styles.bubble}
            data-link={linkMode || undefined}
            aria-label={linkMode ? "Link" : "Formatting"}
            initialFocus={false}
            finalFocus={false}
            onMouseDown={(event) => {
              if (event.target instanceof HTMLInputElement) return;
              event.preventDefault();
            }}
          >
            <div ref={toolbarRef} className={styles.focus}>
              {linkMode ? (
                <Toolbar.Root className={styles.toolbar} aria-label="Link">
                  <Toolbar.Input
                    ref={urlRef}
                    className={styles.url}
                    placeholder="Enter link URL"
                    aria-label="Enter link URL"
                    value={draft}
                    onChange={(event) => setDraft(event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        skipBlur.current = true;
                        applyHref(draft);
                        editor.focus();
                      }
                      if (event.key === "Escape") {
                        event.preventDefault();
                        skipBlur.current = true;
                        explicit.current = false;
                        setDraft(formats.href);
                        setLinkMode(Boolean(formats.href));
                        editor.focus();
                      }
                    }}
                    onBlur={() => {
                      if (skipBlur.current) {
                        skipBlur.current = false;
                        return;
                      }
                      applyHref(draft);
                    }}
                  />
                  <Toolbar.Separator />
                  <FormatButton
                    label="Open"
                    onClick={() => {
                      skipBlur.current = true;
                      if (openHref) void window.pond.openExternal(openHref);
                    }}
                  >
                    <IconArrowUpRight />
                  </FormatButton>
                  <FormatButton
                    label="Remove Link"
                    onClick={() => {
                      skipBlur.current = true;
                      explicit.current = false;
                      setDraft("");
                      setLinkMode(false);
                      applyHref("");
                    }}
                  >
                    <IconTrash />
                  </FormatButton>
                </Toolbar.Root>
              ) : (
                <Toolbar.Root
                  className={styles.toolbar}
                  aria-label="Formatting"
                >
                  <Menu.Root>
                    <Tooltip label="Text Style" side="top">
                      <Toolbar.Button
                        render={
                          <Menu.Trigger
                            size="xs"
                            variant="ghost"
                            aria-label="Text Style"
                            aria-pressed={heading}
                            data-pressed={heading || undefined}
                            className={styles.aa}
                          />
                        }
                      >
                        <StyleGlyph block={formats.block} />
                        <IconChevronDown size={12} />
                      </Toolbar.Button>
                    </Tooltip>
                    <Menu.Portal>
                      <Menu.Positioner
                        className={styles.menu}
                        side="bottom"
                        align="start"
                      >
                        <Menu.Popup>
                          {STYLES.map((item) => (
                            <Menu.Item
                              key={item.block}
                              onClick={() => applyNoteBlock(editor, item.block)}
                            >
                              <Menu.ItemIcon>
                                {item.Icon ? <item.Icon /> : "Aa"}
                              </Menu.ItemIcon>
                              <Menu.ItemLabel>{item.label}</Menu.ItemLabel>
                              <Menu.ItemKeyboard>
                                {platformGlyphs(item.shortcut)}
                              </Menu.ItemKeyboard>
                            </Menu.Item>
                          ))}
                        </Menu.Popup>
                      </Menu.Positioner>
                    </Menu.Portal>
                  </Menu.Root>
                  <FormatButton
                    label="Bold"
                    shortcut={["⌘", "B"]}
                    pressed={formats.bold}
                    onClick={() => toggle("bold")}
                  >
                    <IconTextBold />
                  </FormatButton>
                  <FormatButton
                    label="Italic"
                    shortcut={["⌘", "I"]}
                    pressed={formats.italic}
                    onClick={() => toggle("italic")}
                  >
                    <IconTextItalic />
                  </FormatButton>
                  <FormatButton
                    label="Strikethrough"
                    shortcut={["⌘", "⇧", "S"]}
                    pressed={formats.strikethrough}
                    onClick={() => toggle("strikethrough")}
                  >
                    <IconTextStrikethrough />
                  </FormatButton>
                  <FormatButton
                    label="Underline"
                    shortcut={["⌘", "U"]}
                    pressed={formats.underline}
                    onClick={() => toggle("underline")}
                  >
                    <IconTextUnderline />
                  </FormatButton>
                  <FormatButton
                    label="Link"
                    shortcut={["⌘", "K"]}
                    pressed={Boolean(formats.href)}
                    onClick={enterLink}
                  >
                    <IconLink2 />
                  </FormatButton>
                  <FormatButton
                    label="Quote"
                    shortcut={["⌥", "⇧", "."]}
                    pressed={formats.block === "quote"}
                    onClick={() =>
                      applyNoteBlock(
                        editor,
                        formats.block === "quote" ? "paragraph" : "quote",
                      )
                    }
                  >
                    <IconBlockquote />
                  </FormatButton>
                  <FormatButton
                    label="Collapse"
                    shortcut={["⌘", "⇧", "6"]}
                    pressed={formats.collapse}
                    onClick={() => applyNoteBlock(editor, "collapse")}
                  >
                    <IconCaretMinimize />
                  </FormatButton>
                  <FormatButton
                    label="Inline Code"
                    shortcut={["⌘", "E"]}
                    pressed={formats.code}
                    onClick={() => toggle("code")}
                  >
                    <IconCode />
                  </FormatButton>
                  <FormatButton
                    label="Code Block"
                    shortcut={["⌘", "⇧", "\\"]}
                    pressed={formats.block === "code"}
                    onClick={() =>
                      applyNoteBlock(
                        editor,
                        formats.block === "code" ? "paragraph" : "code",
                      )
                    }
                  >
                    <IconCode2 />
                  </FormatButton>
                  <Menu.Root>
                    <Tooltip label="List" side="top">
                      <Toolbar.Button
                        render={
                          <Menu.Trigger
                            size="xs"
                            variant="ghost"
                            aria-label="List"
                            aria-pressed={listed}
                            data-pressed={listed || undefined}
                            className={styles.list}
                          />
                        }
                      >
                        <ListGlyph block={formats.block} />
                        <IconChevronDown size={12} />
                      </Toolbar.Button>
                    </Tooltip>
                    <Menu.Portal>
                      <Menu.Positioner
                        className={styles.menu}
                        side="bottom"
                        align="end"
                      >
                        <Menu.Popup>
                          {LISTS.map((item) => (
                            <Menu.Item
                              key={item.block}
                              onClick={() => applyNoteBlock(editor, item.block)}
                            >
                              <Menu.ItemIcon>{item.icon}</Menu.ItemIcon>
                              <Menu.ItemLabel>{item.label}</Menu.ItemLabel>
                              <Menu.ItemKeyboard>
                                {platformGlyphs(item.shortcut)}
                              </Menu.ItemKeyboard>
                            </Menu.Item>
                          ))}
                        </Menu.Popup>
                      </Menu.Positioner>
                    </Menu.Portal>
                  </Menu.Root>
                  <Toolbar.Separator />
                  <FormatButton
                    label="Assistant"
                    onClick={() => saveLibraryBridge.setAgentOpen(true)}
                  >
                    <IconChatBubble />
                  </FormatButton>
                </Toolbar.Root>
              )}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function FormatButton({
  label,
  shortcut,
  pressed,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string[];
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip
      label={label}
      shortcut={
        shortcut ? (
          <Keyboard.Shortcut density="flat">
            {platformGlyphs(shortcut)}
          </Keyboard.Shortcut>
        ) : undefined
      }
      side="top"
    >
      <Toolbar.Button
        render={
          <Button
            icon
            size="xs"
            variant="ghost"
            aria-label={label}
            aria-pressed={pressed}
            data-pressed={pressed || undefined}
          />
        }
        onClick={onClick}
      >
        {children}
      </Toolbar.Button>
    </Tooltip>
  );
}
