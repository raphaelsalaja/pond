import { IconArrowUp } from "@pond/icons";
import { Button } from "@pond/ui/button";
import { isHTMLElement } from "@pond/ui/dom";
import { Message } from "@pond/ui/message";
import { Prompt } from "@pond/ui/prompt";
import { App, ease, keyed, mix, Pointer, progress } from "@pond/video";
import { useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { CONSULTED, media } from "../data";
import { CUES } from "../timeline";
import styles from "./styles.module.css";

const WIDTH = 460;
const HEIGHT = 470;
const ZOOM = 1.55;
const HEADER = 52;
const COMPOSER = 64;
const VIEWPORT = HEIGHT - HEADER - COMPOSER;
const MARK = 22;
const LEFT = (1920 - WIDTH * ZOOM) / 2;
const TOP = 190;

/** Where Koi's mark sits in the header, in stage pixels, so the school can fly it in. */
export const DOCK = {
  x: LEFT + (18 + MARK / 2) * ZOOM,
  y: TOP + (HEADER / 2) * ZOOM,
  size: MARK * ZOOM,
};
/** How long Koi takes to fly from the school into the header. */
export const FLY = 750;

const USER = "user";
const KOI = "assistant";

const QUESTION = "What did I save for the cabin?";
const ANSWER =
  "Three saves fit the cabin: the Kiladalen roofline and two chairs for inside.";
const REPLY = "Four of them are chairs. I can tag them for the cabin.";

/** Words up to `k` of `text`, with the newest one fading in. */
function reveal(text: string, k: number) {
  const words = text.split(" ");
  const shown = k * words.length;
  return words.map((word, index) => (
    <span
      // oxlint-disable-next-line react/no-array-index-key -- words never reorder, so position is their identity
      key={index}
      style={{ opacity: Math.max(0, Math.min(1, shown - index)) }}
    >
      {index ? " " : ""}
      {word}
    </span>
  ));
}

/** Messages pop in like the app's bubbles: up, out of a slight shrink. */
function Enter({
  t,
  at,
  children,
  origin = "0 0",
}: {
  t: number;
  at: number;
  children: ReactNode;
  origin?: string;
}) {
  const k = ease.outBack(progress(t, at, 420));
  return (
    <div
      style={{
        opacity: Math.min(1, ease.out(progress(t, at, 220))),
        transform: `translateY(${(1 - k) * 12}px) scale(${mix(0.92, 1, k)})`,
        transformOrigin: origin,
      }}
    >
      {children}
    </div>
  );
}

function offsetWithin(element: HTMLElement | null, root: HTMLElement | null) {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = element;
  while (node && node !== root) {
    x += node.offsetLeft;
    y += node.offsetTop;
    const parent = node.offsetParent;
    node = isHTMLElement(parent) ? parent : null;
  }
  return { x, y };
}

interface Layout {
  routine: number;
  review: number;
  apply: { x: number; y: number };
}

/** Koi's chat: a question, the saves it read, a routine run, and a change waiting for review. */
export function Chat({ t }: { t: number }) {
  const root = useRef<HTMLDivElement>(null);
  const routine = useRef<HTMLDivElement>(null);
  const review = useRef<HTMLDivElement>(null);
  const reviewBody = useRef<HTMLDivElement>(null);
  const apply = useRef<HTMLButtonElement>(null);
  const [layout, setLayout] = useState<Layout>({
    routine: 0,
    review: 0,
    apply: { x: 0, y: 0 },
  });
  useLayoutEffect(() => {
    const top = offsetWithin(review.current, root.current).y;
    const button = offsetWithin(apply.current, root.current);
    const next = {
      routine: offsetWithin(routine.current, root.current).y,
      review: top + (reviewBody.current?.offsetHeight ?? 0) + 48,
      apply: {
        x: button.x + (apply.current?.offsetWidth ?? 0) / 2,
        y: button.y + (apply.current?.offsetHeight ?? 0) / 2,
      },
    };
    if (JSON.stringify(next) !== JSON.stringify(layout)) {
      setLayout(next);
    }
  }, [t, layout]);

  const rise = ease.outQuint(progress(t, CUES.chatRise, 1000));
  const away = ease.inOut(progress(t, CUES.chatAway, 550));
  if (t < CUES.chatRise - 50 || away >= 1) return null;

  const scroll = keyed(t, [
    { at: 0, y: 0, move: 1 },
    {
      at: CUES.routineEvent,
      y: Math.max(0, layout.routine - HEADER - 12),
      move: 650,
    },
    {
      at: CUES.reviewCard + 450,
      y: Math.max(0, layout.review - HEADER - VIEWPORT + 14),
      move: 600,
    },
  ]).y;

  const typed = Math.round(
    QUESTION.length * progress(t, CUES.askSend - 950, 800),
  );
  const draft = t < CUES.askSend ? QUESTION.slice(0, typed) : "";
  const thinking = t >= CUES.thinking && t < CUES.answer;
  const applied = t >= CUES.applyClick + 80;
  const close = ease.inOut(progress(t, CUES.applyClick + 120, 380));
  const docked = t >= CUES.chatRise + FLY;

  const target = { x: layout.apply.x, y: layout.apply.y - scroll };
  const pointer = keyed(t, [
    {
      at: CUES.applyClick - 900,
      x: target.x + 120,
      y: target.y + 110,
      move: 1,
    },
    { at: CUES.applyClick - 40, ...target, move: 700 },
    {
      at: CUES.applyClick + 900,
      x: target.x + 40,
      y: target.y + 70,
      move: 700,
    },
  ]);
  const pointerOpacity =
    ease.out(progress(t, CUES.applyClick - 900, 250)) *
    (1 - ease.in(progress(t, CUES.applyClick + 700, 400)));

  return (
    <div
      className={styles.stage}
      style={{
        left: LEFT,
        top: TOP,
        width: WIDTH * ZOOM,
        height: HEIGHT * ZOOM,
        opacity: Math.min(1, rise * 2.5) * (1 - away),
        transform: `translateY(${(1 - rise) * 160}px) scale(${mix(1, 0.94, away)})`,
        filter: away > 0.01 ? `blur(${away * 10}px)` : undefined,
      }}
    >
      <div
        ref={root}
        className={styles.chat}
        style={{ width: WIDTH, height: HEIGHT, transform: `scale(${ZOOM})` }}
      >
        <header className={styles.header} style={{ height: HEADER }}>
          <span style={{ opacity: docked ? 1 : 0 }}>
            <App.Fish
              t={t}
              species="koi"
              color="orange"
              size={MARK}
              busy={thinking}
              face={thinking ? "think" : applied ? "happy" : "neutral"}
              pleased={applied}
            />
          </span>
          <span className={styles.name}>Koi</span>
        </header>
        <div
          className={styles.viewport}
          style={{ top: HEADER, height: VIEWPORT }}
        >
          <div
            className={styles.thread}
            style={{ transform: `translateY(${-scroll}px)` }}
          >
            <Enter t={t} at={CUES.askSend} origin="100% 100%">
              <Message.View from={USER}>
                <Message.Bubble>{QUESTION}</Message.Bubble>
              </Message.View>
            </Enter>
            <div
              className={styles.status}
              style={{
                opacity:
                  ease.out(progress(t, CUES.thinking, 200)) *
                  (1 - ease.out(progress(t, CUES.answer - 120, 160))),
                display: t < CUES.answer ? undefined : "none",
                backgroundPosition: `${100 - ((t % 1800) / 1800) * 200}% 0`,
              }}
            >
              Searching your library
            </div>
            <Enter t={t} at={CUES.answer}>
              <Message.View from={KOI}>
                <Message.Bubble>
                  {reveal(ANSWER, progress(t, CUES.answer, 900))}
                </Message.Bubble>
              </Message.View>
            </Enter>
            <Enter t={t} at={CUES.consulted}>
              <section className={styles.consulted}>
                {CONSULTED.map((save, index) => (
                  <div
                    key={save.id}
                    className={styles.row}
                    style={{
                      opacity: ease.out(
                        progress(t, CUES.consulted + index * 70, 300),
                      ),
                    }}
                  >
                    <span className={styles.thumb}>
                      <img alt="" src={media(save.id)} />
                    </span>
                    <span className={styles.title}>{save.title}</span>
                    <span className={styles.meta}>
                      <span className={styles.type}>JPG</span>
                      {save.date}
                    </span>
                  </div>
                ))}
              </section>
            </Enter>
            <div ref={routine}>
              <Enter t={t} at={CUES.routineEvent}>
                <time className={styles.time}>Today 9:28 AM</time>
                <p className={styles.event}>
                  <App.Fish t={t} species="koi" color="orange" size={16} />
                  Koi looked at 12 new Saves
                </p>
              </Enter>
            </div>
            <Enter t={t} at={CUES.routineReply}>
              <Message.View from={KOI}>
                <Message.Bubble>
                  {reveal(REPLY, progress(t, CUES.routineReply, 700))}
                </Message.Bubble>
              </Message.View>
            </Enter>
            <div ref={review}>
              <Enter t={t} at={CUES.reviewCard}>
                <section className={styles.prompt}>
                  <div ref={reviewBody}>
                    <Prompt.Body>
                      <Prompt.Title>
                        {applied
                          ? "Applied 4 changes"
                          : "Apply 4 changes to your library?"}
                      </Prompt.Title>
                      <Prompt.Description>Retags 4 Saves</Prompt.Description>
                    </Prompt.Body>
                  </div>
                  <div
                    className={styles.collapse}
                    style={{ height: mix(56, 0, close), opacity: 1 - close }}
                  >
                    <Prompt.Footer>
                      <Button size="md" variant="tertiary">
                        Dismiss
                      </Button>
                      <Button
                        ref={apply}
                        size="md"
                        style={{
                          scale:
                            t >= CUES.applyClick && t < CUES.applyClick + 110
                              ? 0.96
                              : 1,
                        }}
                      >
                        Apply
                      </Button>
                    </Prompt.Footer>
                  </div>
                </section>
              </Enter>
            </div>
          </div>
        </div>
        <footer className={styles.composer} style={{ height: COMPOSER }}>
          <div className={styles.field}>
            <span className={styles.draft} data-empty={!draft || undefined}>
              {draft || "Message Koi"}
            </span>
            <Button icon size="xs" aria-label="Send" disabled={!draft}>
              <IconArrowUp size={14} />
            </Button>
          </div>
        </footer>
        <Pointer
          x={pointer.x}
          y={pointer.y}
          opacity={pointerOpacity}
          pressed={t >= CUES.applyClick && t < CUES.applyClick + 110}
        />
      </div>
    </div>
  );
}
