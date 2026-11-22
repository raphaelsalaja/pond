import { Badge, Toggle, Tooltip } from "@pond/ui";
import { type ReactNode, useRef } from "react";
import { ShortcutKeys } from "@/shared/components/shortcut-keys";
import type { ShortcutId } from "@/shared/lib/shortcuts";
import styles from "./styles.module.css";

interface ItemProps {
  value: string;
  label: string;
  icon: ReactNode;
  shortcut?: ShortcutId | undefined;
  count?: number | undefined;
  /** Overrides the count's accent dot: `live` for running work, `negative` for something that needs you. */
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
        {icon}
        {dot || count ? (
          <Badge.Dot
            className={styles.dot}
            tone={dot === "negative" ? "negative" : "accent"}
            live={dot === "live"}
          />
        ) : null}
      </Toggle>
    </Tooltip>
  );
}
