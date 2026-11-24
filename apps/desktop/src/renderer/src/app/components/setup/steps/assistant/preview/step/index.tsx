import { IconCheck } from "@pond/icons";
import { Shimmer } from "@pond/ui";
import { AnimatePresence, motion } from "motion/react";
import { POP, SWAP } from "../script";
import type { STEPS } from "../script";
import styles from "./styles.module.css";

export function Step({
  step,
  done,
}: {
  step: (typeof STEPS)[number];
  done: boolean;
}) {
  return (
    <motion.li
      className={styles.step}
      initial={{ opacity: 0, y: 6, filter: "blur(2px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      <span className={styles.icon}>
        <AnimatePresence mode="popLayout" initial={false}>
          {done ? (
            <motion.span key="done" className={styles.glyph} {...POP}>
              <IconCheck size={12} />
            </motion.span>
          ) : (
            <motion.span key="running" className={styles.spinner} {...POP} />
          )}
        </AnimatePresence>
      </span>
      <AnimatePresence mode="popLayout" initial={false}>
        {done ? (
          <motion.span key="done" className={styles.label} {...SWAP}>
            {step.done}
            <motion.span
              className={styles.detail}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.15, duration: 0.25 }}
            >
              {step.detail}
            </motion.span>
          </motion.span>
        ) : (
          <motion.span key="running" className={styles.label} {...SWAP}>
            <Shimmer.Root>{step.running}</Shimmer.Root>
          </motion.span>
        )}
      </AnimatePresence>
    </motion.li>
  );
}
