import {
  AnimatePresence,
  animate,
  type MotionValue,
  motion,
  type PanInfo,
  useIsPresent,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import {
  type CSSProperties,
  type ReactNode,
  useId,
  useLayoutEffect,
  useRef,
} from "react";
import { ReviewActions } from "@/features/library/components/inbox-review/actions";
import {
  type Departure,
  type Review,
  useReview,
} from "@/features/library/components/inbox-review/use-review";
import type { ReviewQueue } from "@/features/library/lib/review-queue";
import { Card, CardThumb, useSaveCardModel } from "@/features/saves";
import { useSave } from "@/features/saves/pool";
import type { Save } from "@/features/saves/types";
import styles from "./styles.module.css";

interface MediaStyle extends CSSProperties {
  "--media-aspect": string;
}

const DEPTH = 3;
const PEEK = 18;
const SHRINK = 0.05;
const THROW = 120;
/** Past this many pixels the drag's own direction decides the axis, not a velocity spike at release. */
const NUDGE = 24;
/** Seconds of release velocity added to the offset, so a short flick counts as a full swipe. */
const PROJECT = 0.18;
const MAX_FLING = 4000;
const SETTLE = { stiffness: 420, damping: 36, mass: 0.9 };
const RETURN = { type: "spring", stiffness: 520, damping: 34 } as const;
const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const FLY = 640;

function fly(velocity: number) {
  return {
    type: "spring",
    velocity,
    stiffness: 220,
    damping: 30,
    restDelta: 4,
  } as const;
}

const slot = {
  gone: (departure: Departure | null) => {
    const fade = { opacity: { duration: 0.2, ease: EASE_OUT } };
    if (!departure) return { opacity: 0, transition: { duration: 0.12 } };
    const { outcome, fling } = departure;
    if (outcome === "keep" || outcome === "trash") {
      const side = outcome === "keep" ? 1 : -1;
      return {
        x: side * FLY,
        y: fling.y * PROJECT,
        rotate: side * 8,
        opacity: 0,
        zIndex: DEPTH + 1,
        transition: {
          x: fly(fling.x),
          y: fly(fling.y),
          rotate: fly(0),
          opacity: { duration: 0.24, delay: 0.06, ease: EASE_OUT },
        },
      };
    }
    if (outcome === "skip")
      return {
        y: FLY * 0.6,
        opacity: 0,
        zIndex: DEPTH + 1,
        transition: { y: fly(fling.y), ...fade },
      };
    return {
      y: 220,
      scale: 0.4,
      opacity: 0,
      zIndex: DEPTH + 1,
      transition: { duration: 0.24, ease: EASE_OUT },
    };
  },
};

/** Each card settles toward its place in the stack and rises with the top card's pull. */
function useDepth(depth: number, pull: MotionValue<number>, arrive: boolean) {
  const reduce = useReducedMotion();
  const level = useSpring(arrive ? depth + 1 : depth, SETTLE);
  useLayoutEffect(() => {
    level.jump(Math.max(depth, level.get() - pull.get()));
    if (reduce) level.jump(depth);
    else level.set(depth);
  }, [depth, level, pull, reduce]);
  const shown = useTransform([level, pull], ([at, by]: number[]) =>
    Math.max(0, (at ?? 0) - (depth > 0 ? (by ?? 0) : 0)),
  );
  return {
    y: useTransform(shown, (at) => at * PEEK),
    scale: useTransform(shown, (at) => 1 - at * SHRINK),
    opacity: useTransform(shown, [0, DEPTH - 1, DEPTH], [1, 1, 0]),
    face: useTransform(shown, [0, 1], [1, 0]),
  };
}

function Face({ save, children }: { save: Save; children?: ReactNode }) {
  const model = useSaveCardModel(save, true);
  const media: MediaStyle = { "--media-aspect": String(model.aspect) };
  return (
    <>
      <Card.Media className={styles.media} style={media}>
        <Card.Frame>
          <CardThumb save={save} width={720} />
          {children}
        </Card.Frame>
      </Card.Media>
      {model.title || model.time ? (
        <div className={styles.caption}>
          {model.title ? (
            <span className={styles.title}>{model.title}</span>
          ) : null}
          {model.time ? (
            <span className={styles.time}>{model.time}</span>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function Stamp({
  tone,
  value,
  children,
}: {
  tone: "keep" | "trash" | "folder" | "skip";
  value: MotionValue<number>;
  children: string;
}) {
  const scale = useTransform(value, [0, 1], [0.92, 1]);
  return (
    <motion.span
      className={styles.stamp}
      data-tone={tone}
      style={{ opacity: value, scale }}
      aria-hidden
    >
      {children}
    </motion.span>
  );
}

interface ReviewCardProps {
  id: string;
  depth: number;
  pull: MotionValue<number>;
  arrive: boolean;
  review: Review;
}

function ReviewCard({ id, depth, pull, arrive, review }: ReviewCardProps) {
  const save = useSave(id);
  const present = useIsPresent();
  const top = depth === 0 && present;
  const { face, ...place } = useDepth(depth, pull, arrive);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-320, 320], [-12, 12]);
  const keep = useTransform(x, [24, THROW], [0, 1]);
  const trash = useTransform(x, [-24, -THROW], [0, 1]);
  const folder = useTransform(y, [-24, -THROW], [0, 1]);
  const skip = useTransform(y, [24, THROW], [0, 1]);

  function track() {
    if (top) pull.set(Math.min(1, Math.hypot(x.get(), y.get()) / THROW));
  }
  useMotionValueEvent(x, "change", track);
  useMotionValueEvent(y, "change", track);

  function settle(velocity: { x: number; y: number }) {
    animate(x, 0, { ...RETURN, velocity: velocity.x });
    animate(y, 0, { ...RETURN, velocity: velocity.y });
  }

  function onDragEnd(_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) {
    const { offset } = info;
    const fling = {
      x: Math.max(-MAX_FLING, Math.min(MAX_FLING, info.velocity.x)),
      y: Math.max(-MAX_FLING, Math.min(MAX_FLING, info.velocity.y)),
    };
    const lead = Math.hypot(offset.x, offset.y) > NUDGE ? offset : fling;
    const across = Math.abs(lead.x) > Math.abs(lead.y);
    const dx = offset.x + fling.x * PROJECT;
    const dy = offset.y + fling.y * PROJECT;
    if (across && dx > THROW) review.actions.keep(fling);
    else if (across && dx < -THROW) review.actions.trash(fling);
    else if (!across && dy > THROW) review.actions.skip(fling);
    else {
      settle(fling);
      if (!across && dy < -THROW) review.setChoosing(true);
    }
  }

  return (
    <motion.div
      className={styles.slot}
      style={{ zIndex: DEPTH - depth }}
      variants={slot}
      exit="gone"
      aria-hidden={top ? undefined : true}
    >
      <motion.div className={styles.place} style={place}>
        <motion.div
          className={styles.card}
          data-top={top || undefined}
          style={{ x, y, rotate }}
          drag={top}
          dragMomentum={false}
          whileDrag={{ scale: 1.02 }}
          onDragEnd={onDragEnd}
          onDoubleClick={top ? review.actions.preview : undefined}
        >
          <motion.div className={styles.face} style={{ opacity: face }}>
            {save ? (
              <Face save={save}>
                {depth === 0 ? (
                  <>
                    <Stamp tone="keep" value={keep}>
                      Keep
                    </Stamp>
                    <Stamp tone="trash" value={trash}>
                      Trash
                    </Stamp>
                    <Stamp tone="folder" value={folder}>
                      Folder
                    </Stamp>
                    <Stamp tone="skip" value={skip}>
                      Skip
                    </Stamp>
                  </>
                ) : null}
              </Face>
            ) : null}
          </motion.div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

interface ReviewDeckProps {
  queue: ReviewQueue;
  onExit: () => void;
  finished: ReactNode;
}

export function ReviewDeck({ queue, onExit, finished }: ReviewDeckProps) {
  const review = useReview(queue, onExit);
  const instructionsId = useId();
  const pull = useMotionValue(0);
  const shown = useRef(false);
  const stack = queue.ids.slice(queue.index, queue.index + DEPTH);

  /** Runs after each card's own layout effect has read the pull it was released at. */
  useLayoutEffect(() => {
    shown.current = true;
    if (review.id) pull.jump(0);
  }, [review.id, pull]);

  return (
    <div
      ref={review.ref}
      className={styles.stage}
      role="application"
      aria-label="Review Inbox"
      aria-describedby={instructionsId}
      tabIndex={-1}
      onKeyDown={review.onKeyDown}
    >
      <span id={instructionsId} className={styles.instructions}>
        Drag the save right to keep it, left to move it to the Trash, up to
        choose a folder, or down to skip it. The arrow keys do the same, 1 to 4
        file it, Z goes back, Space opens the preview, and Escape closes the
        Inbox.
      </span>
      {review.id ? (
        <>
          <div className={styles.deck}>
            <AnimatePresence custom={review.departure} initial={false}>
              {stack
                .map((id, depth) => (
                  <ReviewCard
                    key={id}
                    id={id}
                    depth={depth}
                    pull={pull}
                    arrive={shown.current}
                    review={review}
                  />
                ))
                .reverse()}
            </AnimatePresence>
          </div>
          <ReviewActions review={review} />
        </>
      ) : (
        <div className={styles.center}>{finished}</div>
      )}
    </div>
  );
}
