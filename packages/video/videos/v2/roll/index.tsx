import { isHTMLElement } from "@pond/ui/dom";
import { ease, mix, progress } from "@pond/video";
import { useLayoutEffect, useRef, useState } from "react";
import type { Source } from "../data";
import styles from "./styles.module.css";

const GRAY = 196;
const INK = 17;
const MOVE = 380;
const STAGGER = 75;

interface RollProps {
  t: number;
  prefix: string;
  suffix?: string;
  items: Array<Source>;
  enter: number;
  /** When the chip leaves its first item; each later item lands `step` ms after the last. */
  roll: number;
  step: number;
  exit: number;
  y?: number;
  size?: number;
}

/** One line of type whose brand chip rolls through `items`, resizing the line around it. */
export function Roll({
  t,
  prefix,
  suffix,
  items,
  enter,
  roll,
  step,
  exit,
  y = 540,
  size = 64,
}: RollProps) {
  const measure = useRef<HTMLSpanElement>(null);
  const [widths, setWidths] = useState<Array<number>>([]);
  useLayoutEffect(() => {
    const next = [...(measure.current?.children ?? [])].map((item) =>
      isHTMLElement(item) ? item.offsetWidth : 0,
    );
    if (next.join() !== widths.join()) {
      setWidths(next);
    }
  }, [t, prefix, suffix, items, enter, roll, step, exit, y, size, widths]);
  if (t < enter - 50 || t > exit + 600) {
    return null;
  }

  let index = 0;
  for (let i = 0; i < items.length - 1; i++) {
    index += ease.inOut(progress(t, roll + i * step, MOVE));
  }
  const from = Math.floor(index);
  const to = Math.min(from + 1, items.length - 1);
  const k = index - from;
  const width = mix(widths[from] ?? 0, widths[to] ?? 0, k);
  const tint = `color-mix(in oklab, ${items[from]?.color}, ${items[to]?.color} ${k * 100}%)`;

  const before = prefix.split(" ");
  const after = suffix?.split(" ") ?? [];
  const gone = ease.in(progress(t, exit, 320));
  const word = (order: number) => {
    const show = progress(t, enter + order * STAGGER, 360);
    const tone = Math.round(
      mix(
        GRAY,
        INK,
        ease.inOut(progress(t, enter + order * STAGGER + 140, 480)),
      ),
    );
    return {
      opacity: ease.out(show),
      color: `rgb(${tone} ${tone} ${tone})`,
      transform: `translateY(${(1 - ease.outQuint(show)) * 10}px)`,
    };
  };
  const mark = ease.outBack(progress(t, enter + before.length * STAGGER, 520));

  return (
    <div
      className={styles.line}
      style={{
        top: y,
        fontSize: size,
        opacity: 1 - gone,
        filter: gone > 0.01 ? `blur(${gone * 8}px)` : undefined,
      }}
    >
      {before.map((text, order) => (
        <span key={`b${text}`} className={styles.word} style={word(order)}>
          {text}
        </span>
      ))}
      <span
        className={styles.chip}
        style={{
          width,
          "--brand": tint,
          "--fill": ease.out(
            progress(t, enter + before.length * STAGGER + 260, 420),
          ),
          opacity: Math.min(1, mark),
          transform: `scale(${mix(0.6, 1, mark)})`,
        }}
      >
        {items.map((item, i) => {
          const distance = Math.abs(i - index);
          if (distance >= 1) {
            return null;
          }
          return (
            <span
              key={item.name}
              className={styles.item}
              style={{
                color: item.color,
                opacity: Math.max(0, 1 - distance * 1.15),
                transform: `translateY(${(i - index) * 1.1}em)`,
                filter: distance > 0.02 ? `blur(${distance * 6}px)` : undefined,
              }}
            >
              <span
                className={styles.tile}
                data-glyph={item.tile ? true : undefined}
                style={{ background: item.tile }}
              >
                <item.Icon aria-hidden />
              </span>
              {item.name}
            </span>
          );
        })}
      </span>
      {after.map((text, order) => (
        <span
          key={`a${text}`}
          className={styles.word}
          style={word(before.length + 1 + order)}
        >
          {text}
        </span>
      ))}
      <span ref={measure} aria-hidden className={styles.measure}>
        {items.map((item) => (
          <span key={item.name} className={styles.item}>
            <span className={styles.tile} />
            {item.name}
          </span>
        ))}
      </span>
    </div>
  );
}
