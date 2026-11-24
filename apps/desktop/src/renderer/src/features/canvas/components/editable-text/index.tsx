import {
  IconBulletList,
  IconTextBold,
  IconTextItalic,
  IconTextUnderline,
} from "@pond/icons";
import { Button, Input } from "@pond/ui";
import { clsx as cn } from "clsx";
import { useEffect, useRef } from "react";
import { isRichNote, richNote } from "../../lib/rich-text";
import type { TextStyle } from "../../lib/text-style";
import { useBoard } from "../board/context";
import styles from "./styles.module.css";

interface EditableTextProps {
  id: string;
  text: string;
  label: string;
  placeholder: string;
  hint: string;
  variant: "note" | "text" | "figure" | "label" | "topic" | "section";
  style?: TextStyle;
  /** Notes store bold, italic, underline, and lists in their text. */
  rich?: boolean;
}

function looksOf(style: TextStyle | undefined) {
  return {
    "data-size": style?.textSize,
    "data-font": style?.font,
    "data-align": style?.align,
    "data-valign": style?.valign,
    "data-bold": style?.bold || undefined,
    "data-strike": style?.strike || undefined,
  };
}

export function EditableText({
  id,
  text,
  label,
  placeholder,
  hint,
  variant,
  style,
  rich,
}: EditableTextProps) {
  const board = useBoard();
  const editing = board.editingId === id;
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const element = field.current;
    if (!editing || !element) {
      return;
    }
    element.focus();
    element.setSelectionRange(element.value.length, element.value.length);
  }, [editing]);

  if (editing && rich) {
    return (
      <RichNote
        id={id}
        text={text}
        label={label}
        variant={variant}
        style={style}
      />
    );
  }
  if (editing) {
    return (
      <Input.Textarea
        ref={field}
        appearance="bare"
        className={cn(styles.field, "nodrag", "nowheel", "nopan")}
        data-variant={variant}
        {...looksOf(style)}
        aria-label={label}
        placeholder={placeholder}
        value={text}
        spellCheck
        rows={1}
        onChange={(event) => board.setText(id, event.currentTarget.value)}
        onBlur={() => board.finishEditing(id)}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.nativeEvent.isComposing) {
            return;
          }
          if (event.key === "Escape") {
            event.currentTarget.blur();
            return;
          }
          const ends = event.key === "Enter" && !event.shiftKey;
          if (variant === "topic" && (event.key === "Tab" || ends)) {
            event.preventDefault();
            board.branch(id, event.key === "Tab" ? "child" : "sibling");
          } else if (variant === "section" && ends) {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
      />
    );
  }
  return (
    <div
      className={styles.body}
      data-variant={variant}
      {...looksOf(style)}
      data-rich={rich && isRichNote(text) ? true : undefined}
      data-empty={text ? undefined : true}
      {...(rich && isRichNote(text)
        ? { dangerouslySetInnerHTML: { __html: richNote(text) } }
        : { children: text || hint })}
    />
  );
}

const MARKS = [
  { command: "bold", label: "Bold", Icon: IconTextBold },
  { command: "italic", label: "Italic", Icon: IconTextItalic },
  { command: "underline", label: "Underline", Icon: IconTextUnderline },
  {
    command: "insertUnorderedList",
    label: "Bulleted List",
    Icon: IconBulletList,
  },
] as const;

function RichNote({
  id,
  text,
  label,
  variant,
  style,
}: {
  id: string;
  text: string;
  label: string;
  variant: EditableTextProps["variant"];
  style?: TextStyle;
}) {
  const board = useBoard();
  const field = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const element = field.current;
    if (!element || started.current) {
      return;
    }
    started.current = true;
    if (isRichNote(text)) {
      element.innerHTML = richNote(text);
    } else {
      element.textContent = text;
    }
    element.focus();
  }, [text]);

  return (
    <div className={cn(styles.rich, "nodrag", "nowheel", "nopan")}>
      <div className={styles.format}>
        {MARKS.map(({ command, label: mark, Icon }) => (
          <Button
            key={command}
            icon
            size="xs"
            variant="ghost"
            aria-label={mark}
            onMouseDown={(event) => {
              event.preventDefault();
              document.execCommand(command);
            }}
          >
            <Icon size={12} />
          </Button>
        ))}
      </div>
      <div
        ref={field}
        className={styles.field}
        role="textbox"
        tabIndex={0}
        aria-multiline="true"
        aria-label={label}
        data-variant={variant}
        {...looksOf(style)}
        contentEditable
        suppressContentEditableWarning
        onInput={(event) =>
          board.setText(id, richNote(event.currentTarget.innerHTML))
        }
        onBlur={() => board.finishEditing(id)}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape") {
            event.currentTarget.blur();
          }
        }}
      />
    </div>
  );
}
