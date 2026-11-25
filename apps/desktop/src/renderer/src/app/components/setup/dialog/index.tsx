import { Button, Dialog } from "@pond/ui";
import { isElement } from "@pond/ui/dom";
import { Calligraph } from "calligraph";
import { AnimatePresence, motion, useReducedMotionConfig } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { setupFlow } from "@/shared/state/setup";
import {
  connectAssistant,
  finishSetup,
  openExistingLibrary,
  relaunchesLibrary,
} from "../apply";
import { STEP_IDS } from "../model";
import type { Session, SetupChoices } from "../model";
import { setupResume } from "../resume";
import { stepSpec } from "../steps";
import styles from "./styles.module.css";

const EASE = [0.26, 0.08, 0.25, 1] as const;

/** Enter inside these keeps its own meaning instead of advancing the step. */
const OWNS_ENTER =
  'button, a, textarea, select, [role="switch"], [role="combobox"], [role="option"], [contenteditable="true"]';

const variants = {
  enter: (direction: number) => ({ opacity: 0, x: direction * 32 }),
  show: { opacity: 1, x: 0 },
  exit: (direction: number) => ({ opacity: 0, x: direction * -32 }),
};

export function SetupDialog({
  open,
  session,
  setSession,
}: {
  open: boolean;
  session: Session;
  setSession: (update: (current: Session | null) => Session | null) => void;
}) {
  const reduceMotion = useReducedMotionConfig() ?? false;
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const { profile, library, index, direction, choices, busy, error } = session;
  const id = STEP_IDS[index] ?? "welcome";
  const step = stepSpec(id);
  const last = index === STEP_IDS.length - 1;

  const previousIndex = useRef(index);
  useEffect(() => {
    if (previousIndex.current === index) return;
    previousIndex.current = index;
    headingRef.current?.focus({ preventScroll: true });
  }, [index]);

  const patch = (delta: Partial<Session>) =>
    setSession((current) => (current ? { ...current, ...delta } : current));

  const go = (delta: 1 | -1) =>
    setSession((current) =>
      current
        ? {
            ...current,
            index: current.index + delta,
            direction: delta,
            error: "",
          }
        : current,
    );

  const update = (delta: Partial<SetupChoices>) =>
    setSession((current) =>
      current
        ? { ...current, choices: { ...current.choices, ...delta }, error: "" }
        : current,
    );

  const run = async (operation: () => Promise<string>) => {
    patch({ busy: true, error: "" });
    const failure = await operation();
    patch({ busy: false, error: failure });
    return failure === "";
  };

  const [opening, setOpening] = useState(false);
  const canOpenExisting = id === "welcome" && profile === "new";

  const openExisting = async () => {
    if (busy || opening) return;
    setOpening(true);
    patch({ error: "" });
    const failure = await openExistingLibrary();
    if (failure === "") return;
    setOpening(false);
    if (failure) patch({ error: failure });
  };

  const next = async () => {
    if (busy || opening) {
      return;
    }
    if (id === "assistant" && !(await run(() => connectAssistant(choices)))) {
      return;
    }
    if (id === "library") {
      const relaunching = relaunchesLibrary(choices, library, profile);
      if (relaunching) setupResume.mark();
      const done = await run(() =>
        finishSetup(choices, session.initial, library, profile),
      );
      if (done) return go(1);
      if (relaunching) setupResume.clear();
      return;
    }
    if (!last) return go(1);
    setupFlow.close();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) {
      return;
    }
    if (isElement(event.target) && event.target.closest(OWNS_ENTER)) {
      return;
    }
    event.preventDefault();
    void next();
  };

  const label = step.primary[profile];
  const props = { profile, library, choices, update };
  const { Lead, Aside, Body, Extras } = step;
  const header = (
    <header className={styles.header}>
      {Lead ? <Lead {...props} /> : null}
      <h2
        id={headingId}
        ref={headingRef}
        tabIndex={-1}
        className={styles.title}
      >
        {step.title[profile]}
      </h2>
      <p className={styles.description}>{step.description[profile]}</p>
    </header>
  );

  return (
    <Dialog.Root
      open={open}
      disablePointerDismissal
      onOpenChangeComplete={(nextOpen) => {
        if (!nextOpen) setSession(() => null);
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup
          className={styles.popup}
          initialFocus={primaryRef}
          onKeyDown={onKeyDown}
        >
          <Dialog.Title className={styles["sr-only"]}>Set Up Pond</Dialog.Title>
          <div className={styles.viewport}>
            <AnimatePresence
              mode="popLayout"
              initial={false}
              custom={direction}
            >
              <motion.section
                key={id}
                className={styles.step}
                data-layout={step.layout}
                data-scroll-fade="vertical"
                aria-labelledby={headingId}
                custom={direction}
                variants={variants}
                initial="enter"
                animate="show"
                exit="exit"
                transition={{ duration: reduceMotion ? 0 : 0.24, ease: EASE }}
              >
                {step.layout === "bento" ? (
                  <Body {...props}>{header}</Body>
                ) : step.layout === "hero" ? (
                  <>
                    {header}
                    <Body {...props} />
                  </>
                ) : (
                  <>
                    <div className={styles.copy}>
                      {header}
                      {Aside ? <Aside {...props} /> : null}
                    </div>
                    <div className={styles.pane}>
                      <Body {...props} />
                    </div>
                  </>
                )}
              </motion.section>
            </AnimatePresence>
          </div>
          <footer className={styles.footer}>
            <div
              className={styles.progress}
              role="progressbar"
              aria-label="Setup progress"
              aria-valuemin={1}
              aria-valuemax={STEP_IDS.length}
              aria-valuenow={index + 1}
              aria-valuetext={`Step ${index + 1} of ${STEP_IDS.length}`}
            >
              {STEP_IDS.map((stepId, i) => (
                <span
                  key={stepId}
                  className={styles.dot}
                  data-done={i <= index || undefined}
                />
              ))}
            </div>
            <div className={styles.extras}>
              {error ? (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              ) : Extras ? (
                <Extras {...props} />
              ) : null}
            </div>
            <div className={styles.actions}>
              {index > 0 && id !== "import" ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => go(-1)}
                >
                  Back
                </Button>
              ) : null}
              {canOpenExisting ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  loading={opening}
                  onClick={() => void openExisting()}
                >
                  Open Existing Library
                </Button>
              ) : null}
              <Button
                ref={primaryRef}
                size="sm"
                loading={busy}
                disabled={opening}
                onClick={() => void next()}
              >
                <Calligraph>{label}</Calligraph>
              </Button>
            </div>
          </footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
