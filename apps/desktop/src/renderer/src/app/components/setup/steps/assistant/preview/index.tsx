import { IconXmark } from "@pond/icons";
import { motion, useReducedMotionConfig } from "motion/react";
import { useEffect, useState } from "react";
import { Composer } from "./composer";
import { Review } from "./review";
import {
  ASK,
  PHASES,
  REPLY,
  REVIEW_INDEX,
  SPRING,
  STEPS,
  TIMELINE,
  WORD_S,
} from "./script";
import type { Phase } from "./script";
import { Step } from "./step";
import styles from "./styles.module.css";

/** Reduced motion holds on the review so every part of the run stays visible. */
function useTimeline(): Phase {
  const reduceMotion = useReducedMotionConfig();
  const [index, setIndex] = useState(reduceMotion ? REVIEW_INDEX : 0);
  useEffect(() => {
    if (reduceMotion) {
      return;
    }
    const id = setTimeout(
      () => setIndex((current) => (current + 1) % TIMELINE.length),
      TIMELINE[index]?.ms,
    );
    return () => clearTimeout(id);
  }, [index, reduceMotion]);
  return PHASES[index] ?? "reply";
}

function useTyped(text: string, active: boolean): string {
  const [count, setCount] = useState(0);
  const [wasActive, setWasActive] = useState(active);
  if (active !== wasActive) {
    setWasActive(active);
    if (!active) {
      setCount(0);
    }
  }
  useEffect(() => {
    if (!active) {
      return;
    }
    const id = setInterval(
      () => setCount((current) => Math.min(current + 1, text.length)),
      16,
    );
    return () => clearInterval(id);
  }, [active, text]);
  return text.slice(0, count);
}

export function AssistantPreview() {
  const phase = useTimeline();
  const at = PHASES.indexOf(phase);
  const typed = useTyped(ASK, phase === "typing");
  const asked = at >= PHASES.indexOf("sent");
  const replied = at >= REVIEW_INDEX;
  const working = asked && !replied;
  const started = Math.max(0, Math.min(at - 1, STEPS.length));
  const finished = replied ? STEPS.length : Math.max(0, at - 2);

  return (
    <div className={styles.preview} aria-hidden>
      <div className={styles.header}>
        Beach Photos
        <IconXmark size={12} />
      </div>
      <motion.div
        className={styles.thread}
        animate={
          phase === "clearing"
            ? { opacity: 0, y: -8, filter: "blur(2px)" }
            : { opacity: 1, y: 0, filter: "blur(0px)" }
        }
        transition={{ duration: phase === "clearing" ? 0.4 : 0 }}
      >
        {asked ? (
          <motion.span
            className={styles.ask}
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={SPRING}
          >
            {ASK}
          </motion.span>
        ) : null}
        {started > 0 ? (
          <ol className={styles.steps}>
            {STEPS.slice(0, started).map((step, index) => (
              <Step key={step.done} step={step} done={index < finished} />
            ))}
          </ol>
        ) : null}
        {replied ? (
          <>
            <p className={styles.reply}>
              {REPLY.map((word, index) => (
                <motion.span
                  key={word.id}
                  initial={{ opacity: 0, filter: "blur(4px)" }}
                  animate={{ opacity: 1, filter: "blur(0px)" }}
                  transition={{ delay: index * WORD_S, duration: 0.25 }}
                >
                  {`${word.text} `}
                </motion.span>
              ))}
            </p>
            <Review phase={phase} />
          </>
        ) : null}
      </motion.div>
      <Composer typed={typed} working={working} />
    </div>
  );
}
