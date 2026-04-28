import { Tooltip as Base } from "@base-ui-components/react/tooltip";
import type { ReactElement, ReactNode } from "react";
import styles from "./tooltip.module.css";

interface TooltipProps {
  /**
   * The element that triggers the tooltip on hover/focus. Must be a
   * single React element (Base UI's `render` prop merges its props
   * onto this element).
   */
  children: ReactElement<Record<string, unknown>>;
  /** Tooltip body. Skipping this disables the tooltip. */
  content?: ReactNode;
  /** Where to anchor the popup relative to the trigger (default `top`). */
  side?: "top" | "right" | "bottom" | "left";
  /** Override the default open delay (ms) inherited from the provider. */
  delay?: number;
  /** Force the tooltip open. */
  open?: boolean;
}

/**
 * Compact text tooltip. Wrap any focusable element:
 *
 *   <Tooltip content="Move to Trash">
 *     <Button iconOnly>…</Button>
 *   </Tooltip>
 *
 * `disabled` triggers won't fire pointer events; for those, render a
 * thin `<span>` wrapper as the trigger so hover still works:
 *
 *   <Tooltip content="No file yet">
 *     <span><Button disabled>Reveal</Button></span>
 *   </Tooltip>
 */
export function Tooltip({
  children,
  content,
  side = "top",
  delay,
  open,
}: TooltipProps) {
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

/**
 * Mount once near the React root. Provides shared open/close timing
 * so adjacent tooltips chain instead of independently delaying.
 */
export function TooltipProvider({
  children,
  delay = 200,
  closeDelay = 0,
}: {
  children: ReactNode;
  delay?: number;
  closeDelay?: number;
}) {
  return (
    <Base.Provider delay={delay} closeDelay={closeDelay}>
      {children}
    </Base.Provider>
  );
}
