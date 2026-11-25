import {
  ColorPicker,
  ColorPickerArea,
  ColorPickerAreaThumb,
  ColorPickerSlider,
  ColorPickerSliderThumb,
} from "@ui-sdk/react/color-picker";
import { clsx as cn } from "clsx";
import { createContext, use, useState } from "react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { Input } from "../input";
import { Popover } from "../popover";
import styles from "./styles.module.css";

const AREA_SIZE = 156;
const TRACK_WIDTH = 12;

type HueOrientation = "horizontal" | "vertical";

/**
 * A finished color is six hex digits. Three-digit shorthand is an unfinished
 * edit (`#FCF` while replacing `#FCFBF8`, `#0A0` while replacing `#0A0A0A`).
 * Expanding those digits commits a different color before the sixth exists.
 */
function defaultNormalize(input: string): string | null {
  const hex = input.trim().replace(/^#/, "");
  return /^[0-9a-f]{6}$/i.test(hex) ? `#${hex.toLowerCase()}` : null;
}

function sameHex(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

interface RootProps extends Omit<
  ComponentPropsWithoutRef<"div">,
  "onChange" | "aria-label" | "aria-describedby"
> {
  value: string;
  onChange: (hex: string) => void;
  "aria-label": string;
  "aria-describedby"?: string;
  normalize?: (input: string) => string | null;
}

function Root({
  value,
  onChange,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
  normalize = defaultNormalize,
  className,
  ...props
}: RootProps) {
  /**
   * `draft` is the text in the field. It stays while `value` is unchanged or
   * catches up to this draft, so selecting the whole value and replacing it
   * is not overwritten before the applied color round-trips.
   */
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    const committed = normalize(draft);
    if (!committed || !sameHex(committed, value)) setDraft(value);
  }

  const applied = normalize(value);

  const commit = (next: string, display: string) => {
    setDraft(display);
    const normalized = normalize(next);
    if (normalized && !sameHex(normalized, value)) onChange(normalized);
  };

  const handleBlur = () => {
    const normalized = normalize(draft);
    if (!normalized || sameHex(normalized, value)) setDraft(value);
  };

  return (
    <div className={cn(styles.root, className)} {...props}>
      <Popover.Root>
        <Popover.Trigger
          type="button"
          aria-label={`${ariaLabel} picker`}
          aria-describedby={ariaDescribedBy}
          className={styles.swatch}
          data-empty={!applied || undefined}
          style={applied ? { background: applied } : undefined}
        />
        <Popover.Portal>
          <Popover.Positioner sideOffset={6} align="start">
            <Popover.Popup className={styles.popup}>
              <Picker
                value={applied ?? "#000000"}
                ariaLabel={ariaLabel}
                onChange={(hex) => commit(hex, normalize(hex) ?? hex)}
              />
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
      <Input.Root className={styles.input}>
        <Input.Field
          className={styles.hex}
          aria-label={`${ariaLabel} hex`}
          aria-describedby={ariaDescribedBy}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          value={draft}
          onBlur={handleBlur}
          onChange={(e) => commit(e.target.value, e.target.value)}
        />
      </Input.Root>
    </div>
  );
}

const LabelContext = createContext<string | null>(null);

function useLabel(): string {
  const label = use(LabelContext);
  if (label === null) {
    throw new Error(
      "ColorField picker parts must be rendered within ColorField.PickerRoot",
    );
  }
  return label;
}

interface PickerRootProps extends Omit<
  ComponentPropsWithoutRef<"div">,
  "onChange" | "onSelect" | "defaultValue" | "children"
> {
  value: string;
  ariaLabel: string;
  onChange: (hex: string) => void;
  children: ReactNode;
}

function PickerRoot({
  value,
  ariaLabel,
  onChange,
  children,
  ...props
}: PickerRootProps) {
  return (
    <LabelContext value={ariaLabel}>
      <ColorPicker
        aria-label={ariaLabel}
        value={value}
        onValueChange={(next) => onChange(next)}
        {...props}
      >
        {children}
      </ColorPicker>
    </LabelContext>
  );
}

interface PickerProps extends Omit<PickerRootProps, "children"> {
  areaWidth?: number;
  areaHeight?: number;
}

function Picker({
  areaWidth = AREA_SIZE,
  areaHeight = AREA_SIZE,
  className,
  ...props
}: PickerProps) {
  return (
    <PickerRoot className={cn(styles.picker, className)} {...props}>
      <Area width={areaWidth} height={areaHeight} />
      <Hue height={areaHeight} />
    </PickerRoot>
  );
}

interface AreaProps extends Omit<ComponentPropsWithoutRef<"div">, "children"> {
  width?: number;
  height?: number;
  thumbClassName?: string;
}

function Area({
  width,
  height = AREA_SIZE,
  className,
  thumbClassName,
  style,
  ...props
}: AreaProps) {
  const label = useLabel();
  return (
    <ColorPickerArea
      className={cn(styles.area, className)}
      style={{ width: width ?? "100%", height, ...style }}
      {...props}
    >
      <ColorPickerAreaThumb
        aria-label={`${label} saturation and brightness`}
        className={cn(styles.thumb, thumbClassName)}
      />
    </ColorPickerArea>
  );
}

interface HueProps extends Omit<ComponentPropsWithoutRef<"div">, "children"> {
  width?: number;
  height?: number;
  orientation?: HueOrientation;
  thumbClassName?: string;
}

function Hue({
  width = TRACK_WIDTH,
  height = AREA_SIZE,
  orientation = "vertical",
  className,
  thumbClassName,
  style,
  ...props
}: HueProps) {
  const label = useLabel();
  return (
    <ColorPickerSlider
      channel="hue"
      orientation={orientation}
      className={cn(styles.hue, className)}
      style={{ width, height, ...style }}
      {...props}
    >
      <ColorPickerSliderThumb
        aria-label={`${label} hue`}
        className={cn(styles.thumb, thumbClassName)}
      />
    </ColorPickerSlider>
  );
}

export const ColorField = { Root, Picker, PickerRoot, Area, Hue };
