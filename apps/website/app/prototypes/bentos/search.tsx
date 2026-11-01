"use client";

import { IconMagnifier } from "@pond/icons";
import { Input } from "@pond/ui";
import { Message } from "@pond/ui/message";
import type { CSSProperties } from "react";
import { findSave } from "@/lib/library";
import { FishMark } from "../../components/replica/fish-mark";
import { Panel, type Play, Stage, Thumb, useStage, visit } from "./pieces";
import styles from "./styles.module.css";

const YOU = "user";
const FISH = "assistant";
const WORD = "stagger";
const ASK = "flowing";

const SWATCHES = [
  { id: "blue", name: "Blue", hex: "#7ca0ef", save: "flower-painting" },
  { id: "clay", name: "Clay", hex: "#b45019", save: "breakfast-potatoes" },
  { id: "moss", name: "Moss", hex: "#3e4b26", save: "moss-forest" },
  { id: "rose", name: "Rose", hex: "#c8afb7", save: "pink-roses" },
  { id: "fog", name: "Fog", hex: "#73808b", save: "fog-city" },
] as const;

const SLIDES = [
  "chrome-chair",
  "breakfast-potatoes",
  "flower-painting",
  "motion-code",
  "stuffed-monkey",
] as const;

const LINES = [
  {
    id: "yolk",
    before: "Crispy on the edges, then the ",
    word: "yolk",
    after: ".",
  },
  {
    id: "salt",
    before: "Salt the ",
    word: "potatoes",
    after: " before the pan is hot.",
  },
  {
    id: "color",
    before: "They take the ",
    word: "color",
    after: " in about a minute.",
  },
  {
    id: "once",
    before: "Turn them ",
    word: "once",
    after: ", and leave them.",
  },
] as const;

const GARDENS = ["moss-forest", "garden-gate", "blossom-garden"] as const;

const playWord: Play<number> = async (set, wait) => {
  await wait(700);
  set(0);
  await wait(180);
  for (let count = 1; count <= WORD.length; count += 1) {
    set(count);
    await wait(68);
  }
  await wait(1300);
};

const playAsk: Play<number> = async (set, wait) => {
  await wait(600);
  set(0);
  await wait(160);
  for (let count = 1; count <= ASK.length; count += 1) {
    set(count);
    await wait(55);
  }
  await wait(1400);
};

const playFish: Play<number> = async (set, wait) => {
  await wait(900);
  set(0);
  await wait(220);
  for (let shown = 1; shown <= GARDENS.length; shown += 1) {
    set(shown);
    await wait(240);
  }
  await wait(1400);
};

export function ColorSwatches() {
  const { ref, state } = useStage(0, visit([1, 2, 3, 4, 0], 860));
  return (
    <Stage nodeRef={ref} size="small" mask="bottom">
      {SWATCHES.map((swatch, index) => (
        <div
          key={swatch.id}
          className={styles.bleed}
          data-on={index === state || undefined}
        >
          <Thumb id={swatch.save} />
        </div>
      ))}
      <div className={styles.swatchBar}>
        {SWATCHES.map((swatch, index) => (
          <span
            key={swatch.id}
            className={styles.swatch}
            data-on={index === state || undefined}
            style={{ background: swatch.hex }}
          />
        ))}
      </div>
    </Stage>
  );
}

export function ColorRail() {
  const { ref, state } = useStage(0, visit([2, 4, 1, 0], 900));
  return (
    <Stage nodeRef={ref} size="wide">
      <div className={styles.railPhoto}>
        {SWATCHES.map((swatch, index) => (
          <div
            key={swatch.id}
            className={styles.bleed}
            data-on={index === state || undefined}
          >
            <Thumb id={swatch.save} />
          </div>
        ))}
      </div>
      <div className={styles.swatchCol}>
        {SWATCHES.map((swatch, index) => (
          <span
            key={swatch.id}
            className={styles.swatchRow}
            data-on={index === state || undefined}
          >
            <span
              className={styles.swatch}
              style={{ background: swatch.hex }}
              data-on={index === state || undefined}
            />
            <span className={styles.copy}>
              <strong>{swatch.name}</strong>
              <span className={styles.detail}>
                {findSave(swatch.save).title}
              </span>
            </span>
          </span>
        ))}
      </div>
    </Stage>
  );
}

export function TextSearch() {
  const { ref, state } = useStage(WORD.length, playWord);
  const found = state === WORD.length;
  return (
    <Stage nodeRef={ref} size="wide" mask="right">
      <div className={styles.railPhoto}>
        <Thumb id="motion-code" />
      </div>
      <Panel place="start">
        <Input.Root className={styles.field} size="md" variant="secondary">
          <Input.Icon>
            <IconMagnifier size={16} />
          </Input.Icon>
          <Input.Field
            readOnly
            tabIndex={-1}
            value={WORD.slice(0, state)}
            placeholder="Text in the picture"
          />
        </Input.Root>
        <p className={styles.hit} data-on={found || undefined}>
          {findSave("motion-code").title}
        </p>
      </Panel>
    </Stage>
  );
}

export function TranscriptLines() {
  const { ref, state } = useStage(0, visit([1, 2, 3, 0], 1000));
  return (
    <Stage nodeRef={ref} size="tall" mask="bottom">
      <div className={styles.video}>
        <Thumb id="breakfast-potatoes" />
      </div>
      <div className={styles.script}>
        {LINES.map((entry, index) => (
          <p key={entry.id} data-on={index === state || undefined}>
            {entry.before}
            <span className={styles.word}>{entry.word}</span>
            {entry.after}
          </p>
        ))}
      </div>
    </Stage>
  );
}

export function SimilarImages() {
  const { ref, state } = useStage(2, visit([0, 3, 4, 1, 2], 820));
  return (
    <Stage nodeRef={ref} size="small">
      <div
        className={styles.track}
        style={{ "--center": state } as CSSProperties}
      >
        {SLIDES.map((id, index) => (
          <span
            key={id}
            className={styles.slide}
            data-on={index === state || undefined}
          >
            <Thumb id={id} />
          </span>
        ))}
      </div>
    </Stage>
  );
}

export function ReadText() {
  const { ref, state } = useStage(3, visit([0, 1, 2, 3], 520));
  const save = findSave("motion-code");
  return (
    <Stage nodeRef={ref} size="wide">
      <div className={styles.bleed} data-on>
        <Thumb id="motion-code" />
      </div>
      <span
        className={styles.scan}
        style={{ "--scan": state } as CSSProperties}
      />
      <div className={styles.extract} data-on={state >= 2 || undefined}>
        <span className={styles.detail}>Read from the picture</span>
        <strong>{save.title}</strong>
      </div>
    </Stage>
  );
}

export function FishThread() {
  const { ref, state } = useStage(GARDENS.length, playFish);
  return (
    <Stage nodeRef={ref} size="tall">
      <Panel place="start" fill>
        <div className={styles.chatHead}>
          <FishMark color="orange" species="koi" size={48} mood="pleased" />
          <span className={styles.chatMeta}>
            <strong>Koi</strong>
            <span>On this Mac</span>
          </span>
        </div>
        <div className={styles.thread}>
          <Message.View role={YOU}>From the gardens.</Message.View>
          <Message.View role={FISH}>
            <Message.Bubble>Three saves from this month.</Message.Bubble>
          </Message.View>
          <div className={styles.watches}>
            {GARDENS.map((id, index) => (
              <span
                key={id}
                className={styles.watch}
                data-on={index < state || undefined}
              >
                <Thumb id={id} />
              </span>
            ))}
          </div>
        </div>
        <Input.Root className={styles.composer} size="md" variant="secondary">
          <Input.Field
            readOnly
            tabIndex={-1}
            placeholder="Ask about your Saves"
          />
        </Input.Root>
      </Panel>
    </Stage>
  );
}

export function FishCommand() {
  const { ref, state } = useStage(ASK.length, playAsk);
  const ready = state === ASK.length;
  return (
    <Stage nodeRef={ref} size="wide">
      <Panel place="bottom-end">
        <Input.Root className={styles.field} size="md" variant="secondary">
          <Input.Icon>
            <FishMark color="orange" species="koi" size={16} />
          </Input.Icon>
          <Input.Field
            readOnly
            tabIndex={-1}
            value={ASK.slice(0, state)}
            placeholder="Ask your fish"
          />
        </Input.Root>
        <div className={styles.reply} data-on={ready || undefined}>
          <span className={styles.replyShot}>
            <Thumb id="chrome-chair" />
          </span>
          <span className={styles.copy}>
            <strong>Flowing chair</strong>
            <span className={styles.detail}>Closest save in the library.</span>
          </span>
        </div>
      </Panel>
    </Stage>
  );
}
