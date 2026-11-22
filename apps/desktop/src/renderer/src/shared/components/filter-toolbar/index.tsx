import { IconBarsFilter } from "@pond/icons";
import { Button, Tooltip } from "@pond/ui";
import { clsx as cn } from "clsx";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ComponentProps, ReactNode } from "react";
import { gentleSpring } from "@/shared/lib/motion";
import styles from "./styles.module.css";

export interface ToggleProps
  extends Omit<ComponentProps<typeof Button>, "children" | "onClick"> {
  open: boolean;
  active?: boolean;
  controlsId: string;
  onToggle: () => void;
}

function Toggle({
  open,
  active,
  controlsId,
  onToggle,
  className,
  ...props
}: ToggleProps) {
  return (
    <Tooltip label={open ? "Hide Filters" : "Show Filters"} side="bottom">
      <Button
        icon
        size="sm"
        variant="ghost"
        className={cn(styles.toggle, className)}
        data-pressed={open || active || undefined}
        aria-label="Filter"
        aria-expanded={open}
        aria-controls={controlsId}
        onClick={onToggle}
        {...props}
      >
        <IconBarsFilter />
      </Button>
    </Tooltip>
  );
}

export interface BarProps
  extends Omit<ComponentProps<typeof motion.fieldset>, "children" | "id"> {
  open: boolean;
  id: string;
  label: string;
  children: ReactNode;
  actions?: ReactNode;
}

function Bar({
  open,
  id,
  label,
  children,
  actions,
  className,
  ...props
}: BarProps) {
  const reduceMotion = useReducedMotion();
  const transition = reduceMotion ? { duration: 0 } : gentleSpring;
  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.fieldset
          key={id}
          id={id}
          className={cn(styles.shell, className)}
          aria-label={label}
          exit={{ height: 0, opacity: 0, pointerEvents: "none" }}
          transition={transition}
          {...props}
        >
          <div className={styles.bar}>
            <div className={styles.viewport}>
              <div className={styles.filters} data-scroll-fade="horizontal">
                {children}
              </div>
            </div>
            {actions ? <div className={styles.actions}>{actions}</div> : null}
          </div>
        </motion.fieldset>
      ) : null}
    </AnimatePresence>
  );
}

export const FilterToolbar = { Toggle, Bar };
