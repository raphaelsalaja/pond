import { Badge, Toggle, Tooltip } from "@pond/ui";
import { useRef } from "react";
import type { ReactNode } from "react";
import { ShortcutKeys } from "@/shared/components/shortcut-keys";
import type { ShortcutId } from "@/shared/lib/shortcuts";
import styles from "./styles.module.css";

interface ItemProps {
  value: string;
  label: string;
  icon: ReactNode;
  shortcut?: ShortcutId | undefined;
  count?: number | undefined;
  /** Shows the dot without a count: `live` for running work, `negative` turns it red for something that needs you. */
  dot?: "live" | "negative" | undefined;
  current?: boolean;
  onSelect: () => void;
}

export function Item({
  value,
  label,
  icon,
  shortcut,
  count,
  dot,
  current,
  onSelect,
}: ItemProps) {
  const name = count ? `${label}, ${count}` : label;
  const signal = Boolean(dot || count);
  const pressed = useRef(false);

  return (
    <Tooltip
      label={name}
      shortcut={shortcut ? <ShortcutKeys id={shortcut} /> : undefined}
      side="right"
    >
      <Toggle
        className={styles.item}
        icon
        value={value}
        aria-label={name}
        aria-current={current ? "page" : undefined}
        onPointerDown={(event) => {
          /** Switching on press hides the press-to-release gap; Control-click opens the context menu on macOS. */
          if (event.button !== 0 || event.ctrlKey) return;
          pressed.current = true;
          onSelect();
        }}
        onPointerLeave={() => {
          pressed.current = false;
        }}
        onClick={() => {
          /** Keyboard and accessibility activation click without a pointer press first. */
          if (!pressed.current) onSelect();
          pressed.current = false;
        }}
      >
        <span className={styles.icon} data-cutout={signal || undefined}>
          {icon}
        </span>
        {signal ? (
          <Badge.Dot
            className={styles.dot}
            tone={dot === "negative" ? "negative" : "accent"}
          />
        ) : null}
      </Toggle>
    </Tooltip>
  );
}
