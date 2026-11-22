import { clsx as cn } from "clsx";
import {
  AnimatePresence,
  motion,
  type Transition,
  useIsPresent,
  useReducedMotionConfig,
} from "motion/react";
import type { Key, ReactNode } from "react";
import { pageHidden } from "../shared/page-hidden";
import styles from "./styles.module.css";

type SwapVariant = "text" | "icon";

interface SwapProps extends React.ComponentPropsWithoutRef<"span"> {
  value: Key;
  variant?: SwapVariant;
}

export function Swap({
  value,
  variant = "text",
  className,
  children,
  ...props
}: SwapProps) {
  return (
    <span
      className={cn(styles.root, className)}
      data-variant={variant}
      {...props}
    >
      {pageHidden() ? (
        <span key={value} className={styles.item}>
          {children}
        </span>
      ) : (
        <AnimatePresence initial={false}>
          <Item key={value} variant={variant}>
            {children}
          </Item>
        </AnimatePresence>
      )}
    </span>
  );
}

const TEXT_TRANSITION: Transition = { duration: 0.15, ease: "easeInOut" };
const ICON_TRANSITION: Transition = { type: "spring", duration: 0.3, bounce: 0 };

function Item({
  variant,
  children,
}: {
  variant: SwapVariant;
  children: ReactNode;
}) {
  const reduced = useReducedMotionConfig();
  const present = useIsPresent();
  const icon = variant === "icon";
  const rest = icon ? "scale(1)" : "translateY(0px)";
  const blur = reduced ? "blur(0px)" : icon ? "blur(4px)" : "blur(2px)";
  const enter = reduced ? rest : icon ? "scale(0.25)" : "translateY(4px)";
  const leave = reduced ? rest : icon ? "scale(0.25)" : "translateY(-4px)";
  return (
    <motion.span
      className={styles.item}
      inert={!present}
      initial={{ opacity: 0, transform: enter, filter: blur }}
      animate={{ opacity: 1, transform: rest, filter: "blur(0px)" }}
      exit={{ opacity: 0, transform: leave, filter: blur }}
      transition={icon ? ICON_TRANSITION : TEXT_TRANSITION}
    >
      {children}
    </motion.span>
  );
}
