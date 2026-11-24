import { IconCheck, IconFolderPlus } from "@pond/icons";
import { Calligraph } from "calligraph";
import { AnimatePresence, motion } from "motion/react";
import { Art } from "../../../../demo";
import { POP, REPLY, SPRING, SWAP, WORD_S } from "../script";
import type { Phase } from "../script";
import styles from "./styles.module.css";

export function Review({ phase }: { phase: Phase }) {
  const applied = phase === "applied" || phase === "clearing";
  const delay = REPLY.length * WORD_S + 0.1;
  return (
    <motion.div
      className={styles.review}
      data-applied={applied || undefined}
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ ...SPRING, delay }}
    >
      <span className={styles.heading}>
        <Calligraph>
          {applied ? "Changes Applied" : "Review Changes"}
        </Calligraph>
        <AnimatePresence mode="popLayout" initial={false}>
          {applied ? (
            <motion.span key="applied" className={styles.done} {...POP}>
              <IconCheck size={10} />
            </motion.span>
          ) : (
            <motion.span key="count" className={styles.count} {...POP}>
              2
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      <motion.span
        className={styles.change}
        initial={{ opacity: 0, x: -4 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: delay + 0.12, duration: 0.25 }}
      >
        <span className={styles.folder}>
          <IconFolderPlus size={12} />
        </span>
        Create folder
        <span className={styles.target}>Summer</span>
      </motion.span>
      <motion.span
        className={styles.change}
        initial={{ opacity: 0, x: -4 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: delay + 0.2, duration: 0.25 }}
      >
        <span className={styles.stack}>
          <span>
            <Art kind="sunset" size="slot" />
          </span>
          <span>
            <Art kind="mountain" size="slot" />
          </span>
          <span>
            <Art kind="sunset" size="slot" />
          </span>
        </span>
        Move 3 Saves
        <span className={styles.target}>Summer</span>
      </motion.span>
      <span className={styles.actions}>
        <AnimatePresence mode="popLayout" initial={false}>
          {applied ? (
            <motion.span key="applied" className={styles.result} {...SWAP}>
              Moved 3 Saves to Summer
              <span className={styles.undo}>Undo</span>
            </motion.span>
          ) : (
            <motion.span key="pending" className={styles.buttons} {...SWAP}>
              <span className={styles.discard}>Discard</span>
              <span
                className={styles.apply}
                data-pressed={phase === "applying" || undefined}
              >
                Apply
              </span>
            </motion.span>
          )}
        </AnimatePresence>
      </span>
    </motion.div>
  );
}
