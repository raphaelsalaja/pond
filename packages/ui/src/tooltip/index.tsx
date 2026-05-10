import { Tooltip as Base } from "@base-ui/react/tooltip";
import type { ReactElement, ReactNode } from "react";
import styles from "./styles.module.css";

interface RootProps {
  /**
   * The element that triggers the tooltip on hover/focus. Must be a
   * single React element (Base UI's `render` prop merges its props
   * onto this element).
   */
  children: ReactElement<Record<string, unknown>>;
  content?: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  delay?: number;
  open?: boolean;
}

function Root({ children, content, side = "top", delay, open }: RootProps) {
  if (!content) return children;
  return (
    <Base.Root open={open}>
      <Base.Trigger render={children} delay={delay} />
      <Base.Portal>
        <Base.Positioner
          sideOffset={6}
          side={side}
          className={styles.positioner}
        >
          <Base.Popup className={styles.popup}>{content}</Base.Popup>
        </Base.Positioner>
      </Base.Portal>
    </Base.Root>
  );
}

interface ProviderProps {
  children: ReactNode;
  delay?: number;
  closeDelay?: number;
}

function Provider({ children, delay = 200, closeDelay = 0 }: ProviderProps) {
  return (
    <Base.Provider delay={delay} closeDelay={closeDelay}>
      {children}
    </Base.Provider>
  );
}

export const Tooltip = {
  Root,
  Provider,
};
