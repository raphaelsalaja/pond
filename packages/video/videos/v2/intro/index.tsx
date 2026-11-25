import { isHTMLElement } from "@pond/ui/dom";
import { App, ease, mix, progress, scatter } from "@pond/video";
import { useLayoutEffect, useRef, useState } from "react";
import { KOI_SPOT } from "../data";
import { CUES } from "../timeline";
import styles from "./styles.module.css";

const GRAY = 196;
const INK = 17;
const STAGGER = 75;
const SIZE = 72;
const KOI = 160;
const INLINE = 78;
const Y = 540;

interface Word {
  text: string;
  accent?: boolean;
}

const BEFORE: Array<Word> = [{ text: "Introducing" }];
const AFTER: Array<Word> = [
  { text: "Fish" },
  { text: "in" },
  { text: "Pond" },
  { text: "2.0", accent: true },
];

interface IntroProps {
  t: number;
  /** When the line's words arrive and when they dissolve, leaving Koi. */
  enter: number;
  exit: number;
  /** Where Koi flies as the chat rises at `CUES.chatRise`, in stage pixels. */
  dock: { x: number; y: number; size: number };
  fly: number;
}

/** Koi leaves the school for the gap in "Introducing Fish in Pond 2.0", stays as the words dissolve, then flies into the chat. */
export function Intro({ t, enter, exit, dock, fly }: IntroProps) {
  const slot = useRef<HTMLSpanElement>(null);
  const [spot, setSpot] = useState({ x: 960, y: Y });
  useLayoutEffect(() => {
    const node = slot.current;
    if (!node) {
      return;
    }
    const parent = node.offsetParent;
    const next = {
      x: isHTMLElement(parent) ? parent.offsetLeft : 0,
      y: Y,
    };
    next.x += node.offsetLeft + node.offsetWidth / 2;
    if (next.x !== spot.x) {
      setSpot(next);
    }
  }, [t, enter, exit, dock, fly, spot.x]);

  const flight = ease.inOut(progress(t, CUES.chatRise, fly));
  const arrive = ease.outQuint(progress(t, CUES.schoolIn + 300, 1700));
  const settle = ease.inOut(progress(t, CUES.schoolOut, 850));
  const size = mix(mix(KOI, INLINE, settle), dock.size, flight);
  const x = mix(
    mix(KOI_SPOT.x - (1 - arrive) * 1300, spot.x, settle),
    dock.x,
    flight,
  );
  const y = mix(
    mix(KOI_SPOT.y + Math.sin(t / 1300) * 8, spot.y, settle),
    dock.y,
    flight,
  );
  const alone = t >= exit + 200;

  const laidOut: Array<{
    word: Word;
    at: number;
    letters: Array<[number, string]>;
  }> = [];
  let index = 0;
  let letter = 0;
  for (const entry of [...BEFORE, ...AFTER]) {
    const letters: Array<[number, string]> = [];
    for (const char of Array.from(entry.text)) {
      letters.push([letter, char]);
      letter += 1;
    }
    laidOut.push({ word: entry, at: enter + index * STAGGER, letters });
    index += 1;
  }
  const word = ({
    word: { text, accent },
    at,
    letters,
  }: (typeof laidOut)[number]) => {
    const show = progress(t, at, 360);
    const tone = Math.round(
      mix(GRAY, INK, ease.inOut(progress(t, at + 140, 480))),
    );
    return (
      <span
        key={text}
        className={styles.word}
        data-accent={accent || undefined}
        style={{
          opacity: ease.out(show),
          color: accent ? undefined : `rgb(${tone} ${tone} ${tone})`,
          transform: `translateY(${(1 - ease.outQuint(show)) * 10}px)`,
        }}
      >
        {letters.map(([k, char]) => {
          const out = progress(t, exit + scatter(k) * 280, 160);
          return (
            <span key={k} style={{ opacity: 1 - out }}>
              {char}
            </span>
          );
        })}
      </span>
    );
  };

  return (
    <>
      {t < exit + 600 ? (
        <div className={styles.line} style={{ top: Y, fontSize: SIZE }}>
          {laidOut.slice(0, BEFORE.length).map(word)}
          <span ref={slot} className={styles.slot} style={{ width: INLINE }} />
          {laidOut.slice(BEFORE.length).map(word)}
        </div>
      ) : null}
      {flight < 1 ? (
        <span
          className={styles.koi}
          style={{
            opacity: Math.min(1, arrive * 2),
            transform: `translate(${x - size / 2}px, ${y - size / 2}px)`,
          }}
        >
          <App.Fish
            t={t}
            species="koi"
            color="orange"
            size={size}
            seed={7}
            busy={arrive < 0.85 || (settle > 0 && settle < 1)}
            face={alone ? "happy" : "neutral"}
            pleased={alone}
          />
        </span>
      ) : null}
    </>
  );
}
