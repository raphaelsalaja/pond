import {
  COLOR_PRESETS,
  DEFAULT_COLOR_TOLERANCE,
  readColorMatch,
} from "@pond/schema/filters/color";
import type { Predicate } from "@pond/schema/filters/types";
import { Button, Chip, ColorField, Input, Slider } from "@pond/ui";
import { useState } from "react";
import { z } from "zod";
import { stopMenuKeys } from "../menu-keys";
import styles from "./styles.module.css";

export function ColorFilter({
  current,
  onApply,
  onClear,
}: {
  current?: Predicate;
  onApply: (predicate: Predicate) => void;
  onClear: () => void;
}) {
  const match = readColorMatch(current?.value);
  const [hex, setHex] = useState(match?.hex ?? "#0087ef");
  const [text, setText] = useState(match?.hex ?? "");
  const [tolerance, setTolerance] = useState(
    match?.tolerance ?? DEFAULT_COLOR_TOLERANCE,
  );
  const apply = (color: string, distance = tolerance) => {
    setHex(color);
    setText(color);
    setTolerance(distance);
    onApply({
      field: "color",
      operator: "near",
      value: { hex: color, tolerance: distance },
      negate: current?.negate || undefined,
    });
  };
  return (
    <fieldset
      className={styles.root}
      aria-label="Color Filter"
      onKeyDown={stopMenuKeys}
    >
      <ColorField.PickerRoot
        value={hex}
        ariaLabel="Filter Color"
        onChange={apply}
      >
        <div className={styles.picker}>
          <ColorField.Area
            width={150}
            height={150}
            className={styles.area}
            thumbClassName={styles.thumb}
          />
          <ColorField.Hue
            width={12}
            height={150}
            className={styles.hue}
            thumbClassName={styles.thumb}
          />
        </div>
      </ColorField.PickerRoot>
      <fieldset className={styles.palette} aria-label="Preset Colors">
        <Button
          icon
          variant="bare"
          className={styles.clear}
          aria-label="Clear Color Filter"
          title="Clear Color Filter"
          aria-pressed={!match}
          onClick={() => {
            setText("");
            onClear();
          }}
        />
        {COLOR_PRESETS.map(({ label, hex: preset }) => (
          <Button
            key={preset}
            icon
            variant="bare"
            aria-label={label}
            aria-pressed={!!match && preset === match.hex}
            title={label}
            data-color={label}
            style={{ backgroundColor: preset }}
            onClick={() => apply(preset)}
          />
        ))}
      </fieldset>
      <form
        className={styles.hex}
        onSubmit={(event) => {
          event.preventDefault();
          const next = readColorMatch(text);
          if (next) apply(next.hex);
        }}
      >
        <Input.Root size="sm" variant="secondary" className={styles.input}>
          <Input.Icon>
            <span
              className={styles.preview}
              style={{
                backgroundColor: match ? hex : "var(--ds-foreground-tertiary)",
              }}
            />
          </Input.Icon>
          <Input.Field
            className={styles.value}
            aria-label="Color Hex"
            value={text}
            placeholder="#FF0000"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            aria-invalid={!!text && !readColorMatch(text)}
            onBlur={() => {
              if (!readColorMatch(text)) setText(match?.hex ?? "");
            }}
            onValueChange={(value) => {
              setText(value);
              const next = readColorMatch(value);
              if (next) apply(next.hex);
            }}
          />
          <Input.Action className={styles["native-picker"]}>
            <Chip.Swatch />
            <input
              type="color"
              aria-label="Choose Color"
              title="Choose Color"
              value={hex}
              onChange={(event) => apply(event.target.value)}
            />
          </Input.Action>
        </Input.Root>
      </form>

      <Slider.Root
        className={styles.range}
        disabled={!match}
        min={0}
        max={150}
        step={1}
        value={150 - tolerance}
        onValueChange={(value) => {
          const next = z.number().safeParse(value);
          if (next.success) apply(hex, 150 - next.data);
        }}
      >
        <Slider.Label className={styles.label}>Accuracy</Slider.Label>
        <Slider.Control className={styles.control}>
          <Slider.Track className={styles.track}>
            <Slider.Thumb
              className={styles.thumb}
              aria-label="Color Accuracy"
            />
          </Slider.Track>
        </Slider.Control>
      </Slider.Root>
    </fieldset>
  );
}
