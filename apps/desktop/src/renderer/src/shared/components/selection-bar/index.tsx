import { IconXmark } from "@pond/icons";
import { Button, type ButtonProps, Keyboard, Menu, Tooltip } from "@pond/ui";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { SpecMenu } from "@/shared/components/spec-context-menu";
import { gentleSpring } from "@/shared/lib/motion";
import styles from "./styles.module.css";

interface RootProps {
  label: string;
  count: number;
  onClear: () => void;
  children: ReactNode;
}

/** Floats over the bottom of the nearest positioned ancestor while rows are selected. */
function Root({ label, count, onClear, children }: RootProps) {
  const reduceMotion = useReducedMotion();
  return (
    <Tooltip.Group>
      <div className={styles.dock}>
        <AnimatePresence initial={false}>
          {count > 0 ? (
            <motion.div
              key="selection"
              role="toolbar"
              aria-label={label}
              className={styles.bar}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{
                opacity: 0,
                y: 8,
                pointerEvents: "none",
                transition: { duration: reduceMotion ? 0 : 0.12 },
              }}
              transition={reduceMotion ? { duration: 0 } : gentleSpring}
            >
              <span className={styles.count} aria-live="polite">
                <span className={styles.number}>{count}</span> selected
              </span>
              <div className={styles.actions} data-scroll-fade="horizontal">
                {children}
              </div>
              <Tooltip
                label="Clear Selection"
                shortcut={<Keyboard.Cluster keys={["Esc"]} />}
                side="top"
              >
                <Button
                  icon
                  size="sm"
                  variant="ghost"
                  aria-label="Clear Selection"
                  onClick={onClear}
                >
                  <IconXmark size={12} />
                </Button>
              </Tooltip>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </Tooltip.Group>
  );
}

function shortcutHint(keys: readonly string[] | undefined) {
  return keys?.length ? <Keyboard.Cluster keys={[...keys]} /> : undefined;
}

interface ActionProps
  extends Omit<ButtonProps, "icon" | "size" | "variant" | "aria-label"> {
  label: string;
  shortcut?: readonly string[];
}

/** Stays focusable while disabled so its tooltip still names the icon. */
function Action({ label, shortcut, ...props }: ActionProps) {
  return (
    <Tooltip label={label} shortcut={shortcutHint(shortcut)} side="top">
      <Button
        icon
        size="sm"
        variant="ghost"
        aria-label={label}
        focusableWhenDisabled
        {...props}
      />
    </Tooltip>
  );
}

interface ActionMenuProps
  extends Pick<
    ComponentProps<typeof SpecMenu>,
    "buildItems" | "onOpen" | "search" | "searchLabel" | "minWidth"
  > {
  label: string;
  shortcut?: readonly string[];
  disabled?: boolean;
  children: ReactElement;
}

function ActionMenu({
  label,
  shortcut,
  disabled,
  children,
  ...menu
}: ActionMenuProps) {
  return (
    <SpecMenu align="center" {...menu}>
      <Tooltip label={label} shortcut={shortcutHint(shortcut)} side="top">
        <Menu.Trigger
          icon
          size="sm"
          variant="ghost"
          aria-label={label}
          disabled={disabled}
        >
          {children}
        </Menu.Trigger>
      </Tooltip>
    </SpecMenu>
  );
}

export const SelectionBar = { Root, Action, Menu: ActionMenu };
