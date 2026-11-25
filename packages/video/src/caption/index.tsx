import type { ReactNode } from "react";
import { ease, mix, progress, scatter } from "../motion";
import styles from "./styles.module.css";

const GRAY = 196;
const INK = 17;

export interface Brand {
  color: string;
  /** An image URL for the mark, such as another app's icon. */
  logo?: string;
  /** A glyph drawn in `color`, sized by the caller to the caption's type size. */
  icon?: ReactNode;
}

interface CaptionProps {
  t: number;
  /** Words in `[brackets]` sit in a highlight chip; `{braces}` use the accent chip. */
  text: string;
  enter: number;
  exit: number;
  y?: number;
  size?: number;
  stagger?: number;
  /** Chips whose text matches a brand get its icon and color. */
  brands?: Record<string, Brand>;
}

interface Word {
  text: string;
  chip?: "plain" | "accent";
  group: number;
  /** Punctuation that hugs the word before it. */
  tight?: boolean;
}

function parse(text: string): Array<Word> {
  const words: Array<Word> = [];
  let group = 0;
  for (const match of text.matchAll(
    /\[([^\]]+)\](\S*)|\{([^}]+)\}(\S*)|(\S+)/g,
  )) {
    const [, plain, plainTail, accent, accentTail, bare] = match;
    const chip = plain ? "plain" : accent ? "accent" : undefined;
    const body = plain ?? accent ?? bare ?? "";
    group++;
    for (const part of body.split(" ")) words.push({ text: part, chip, group });
    const tail = plainTail || accentTail;
    if (tail) words.push({ text: tail, group: ++group, tight: true });
  }
  return words;
}

/** One line of centered type: words arrive gray and settle to ink, chips fill in, then the letters dissolve. */
export function Caption({
  t,
  text,
  enter,
  exit,
  y = 150,
  size = 58,
  stagger = 75,
  brands,
}: CaptionProps) {
  if (t < enter - 50 || t > exit + 500) {
    return null;
  }
  const groups: Array<Array<Word>> = [];
  for (const word of parse(text)) {
    const last = groups.at(-1);
    if (last && last[0]?.group === word.group) last.push(word);
    else groups.push([word]);
  }
  const laidOut: Array<{
    group: Array<Word>;
    first: number;
    words: Array<{ word: Word; at: number; letters: Array<[number, string]> }>;
  }> = [];
  let index = 0;
  let letter = 0;
  for (const group of groups) {
    const first = index;
    const words = [];
    for (const word of group) {
      const at = enter + index * stagger;
      index += 1;
      const letters: Array<[number, string]> = [];
      for (const char of Array.from(word.text)) {
        letters.push([letter, char]);
        letter += 1;
      }
      words.push({ word, at, letters });
    }
    laidOut.push({ group, first, words });
  }
  return (
    <div className={styles.caption} style={{ top: y, fontSize: size }}>
      {laidOut.map(({ group, first, words }) => {
        const chip = group[0]?.chip;
        const brand = chip
          ? brands?.[group.map((word) => word.text).join(" ")]
          : undefined;
        const tint =
          brand?.color ??
          (chip === "accent" ? "var(--ds-accent-hover)" : undefined);
        const fill = ease.out(progress(t, enter + first * stagger + 260, 420));
        const gone = ease.in(progress(t, exit + 60, 260));
        const inner = words.map(({ word, at, letters }) => {
          const show = progress(t, at, 360);
          const ink = ease.inOut(progress(t, at + 140, 480));
          const tone = Math.round(mix(GRAY, INK, ink));
          return (
            <span
              key={`${at}-${word.text}`}
              className={styles.word}
              data-tight={word.tight || undefined}
              style={{
                opacity: ease.out(show),
                color:
                  tint && ink > 0
                    ? `color-mix(in oklab, rgb(${tone} ${tone} ${tone}) ${100 - ink * 100}%, ${tint})`
                    : `rgb(${tone} ${tone} ${tone})`,
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
        });
        if (!chip) return inner;
        const mark = ease.outBack(
          progress(t, enter + first * stagger + 60, 520),
        );
        const markStyle = {
          opacity: Math.min(1, mark) * (1 - gone),
          transform: `scale(${mix(0.6, 1, mark) * mix(1, 0.8, gone)})`,
        };
        return (
          <span
            key={`chip-${first}`}
            className={styles.chip}
            data-accent={chip === "accent" || undefined}
            data-brand={brand ? true : undefined}
            data-mark={brand?.logo || brand?.icon ? true : undefined}
            style={{ "--fill": fill * (1 - gone), "--brand": brand?.color }}
          >
            {brand?.logo ? (
              <img
                className={styles.logo}
                src={brand.logo}
                alt=""
                style={markStyle}
              />
            ) : brand?.icon ? (
              <span className={styles.icon} style={markStyle}>
                {brand.icon}
              </span>
            ) : null}
            {inner}
          </span>
        );
      })}
    </div>
  );
}
