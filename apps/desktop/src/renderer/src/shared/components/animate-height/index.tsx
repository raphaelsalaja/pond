import { clsx as cn } from "clsx";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { gentleSpring } from "@/shared/lib/motion";
import styles from "./styles.module.css";

interface AnimateHeightProps {
  children: ReactNode;
  className?: string;
  initial?: false;
  /** Open from height 0 and close to 0 when used with AnimatePresence. */
  presence?: boolean;
}

export function AnimateHeight({
  children,
  className,
  initial,
  presence = false,
}: AnimateHeightProps) {
  const reduceMotion = useReducedMotion();
  const inner = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | "auto">("auto");
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    if (presence) {
      return;
    }
    const node = inner.current;
    if (!node) {
      return;
    }
    const sync = () => {
      const next = node.clientHeight;
      setHeight((current) => (current === next ? current : next));
    };
    sync();
    if (!("ResizeObserver" in globalThis)) {
      return;
    }
    const observer = new ResizeObserver(sync);
    observer.observe(node);
    return () => observer.disconnect();
  }, [presence]);
  useEffect(() => {
    if (presence) {
      return;
    }
    /** Flips after the first commit so the initial measurement lands without a spring. */
    let live = true;
    queueMicrotask(() => {
      if (live) {
        setReady(true);
      }
    });
    return () => {
      live = false;
    };
  }, [presence]);
  const skipEnter = initial === false || reduceMotion || !presence;
  const transition =
    reduceMotion || (!presence && !ready) ? { duration: 0 } : gentleSpring;
  return (
    <motion.div
      className={cn(styles.clip, className)}
      initial={presence && !skipEnter ? { height: 0, opacity: 0 } : false}
      animate={{
        height: presence || reduceMotion ? "auto" : height,
        opacity: 1,
      }}
      exit={presence ? { height: 0, opacity: 0 } : undefined}
      transition={transition}
    >
      <div ref={inner}>{children}</div>
    </motion.div>
  );
}
