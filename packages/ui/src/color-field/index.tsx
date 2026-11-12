import { clsx as cn } from "clsx";
import {
  type ComponentPropsWithoutRef,
  createContext,
  type ReactNode,
  use,
  useRef,
  useState,
} from "react";
import {
  useColorArea,
  useColorSlider,
  useFocusRing,
  useLocale,
  VisuallyHidden,
} from "react-aria";
import {
  type Color,
  parseColor,
  useColorAreaState,
  useColorSliderState,
} from "react-stately";
import { Input } from "../input";
import { Popover } from "../popover";
import styles from "./styles.module.css";

const AREA_SIZE = 156;
const TRACK_WIDTH = 12;

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

function toHsb(hex: string): Color {
  try {
    return parseColor(hex).toFormat("hsb");
  } catch {
    return parseColor("#000000").toFormat("hsb");
  }
}

interface RootProps
  extends Omit<
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

interface PickerContextValue {
  color: Color;
  ariaLabel: string;
  onChange: (color: Color) => void;
}

const PickerContext = createContext<PickerContextValue | null>(null);

function usePicker(): PickerContextValue {
  const context = use(PickerContext);
  if (!context) {
    throw new Error(
      "ColorField picker parts must be rendered within ColorField.PickerRoot",
    );
  }
  return context;
}

function PickerRoot({
  value,
  ariaLabel,
  onChange,
  children,
}: {
  value: string;
  ariaLabel: string;
  onChange: (hex: string) => void;
  children: ReactNode;
}) {
  /** Hex drops hue at zero saturation, so keep the last HSB color while it still matches `value`. */
  const [stored, setColor] = useState<Color>(() => toHsb(value));
  const color =
    stored.toString("hex").toLowerCase() === value.toLowerCase()
      ? stored
      : toHsb(value);

  const apply = (next: Color) => {
    setColor(next);
    onChange(next.toString("hex"));
  };

  return (
    <PickerContext value={{ color, ariaLabel, onChange: apply }}>
      {children}
    </PickerContext>
  );
}

function Picker({
  value,
  ariaLabel,
  onChange,
  areaWidth = AREA_SIZE,
  areaHeight = AREA_SIZE,
}: {
  value: string;
  ariaLabel: string;
  onChange: (hex: string) => void;
  areaWidth?: number;
  areaHeight?: number;
}) {
  return (
    <PickerRoot value={value} ariaLabel={ariaLabel} onChange={onChange}>
      <div className={styles.picker}>
        <div className={styles.body}>
          <Area width={areaWidth} height={areaHeight} />
          <Hue height={areaHeight} />
        </div>
      </div>
    </PickerRoot>
  );
}

function Area({
  width,
  height = AREA_SIZE,
  className,
  thumbClassName,
}: {
  width?: number;
  height?: number;
  className?: string;
  thumbClassName?: string;
}) {
  const { color, ariaLabel, onChange } = usePicker();
  const inputXRef = useRef<HTMLInputElement>(null);
  const inputYRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const state = useColorAreaState({
    value: color,
    onChange,
    xChannel: "saturation",
    yChannel: "brightness",
  });

  const { isFocusVisible, focusProps } = useFocusRing();
  const { colorAreaProps, xInputProps, yInputProps, thumbProps } = useColorArea(
    {
      "aria-label": `${ariaLabel} saturation and brightness`,
      inputXRef,
      inputYRef,
      containerRef,
    },
    state,
  );

  return (
    <div
      ref={containerRef}
      {...colorAreaProps}
      className={cn(styles.saturation, className)}
      style={{
        ...colorAreaProps.style,
        width: width ? `${width}px` : "100%",
        height,
      }}
    >
      <div
        {...thumbProps}
        className={cn(styles.handle, thumbClassName)}
        data-focus={isFocusVisible || undefined}
        style={thumbProps.style}
      >
        <VisuallyHidden>
          <input ref={inputXRef} {...xInputProps} {...focusProps} />
          <input ref={inputYRef} {...yInputProps} {...focusProps} />
        </VisuallyHidden>
      </div>
    </div>
  );
}

function Hue({
  height = AREA_SIZE,
  width = TRACK_WIDTH,
  orientation = "vertical",
  className,
  thumbClassName,
}: {
  height?: number;
  width?: number;
  orientation?: "horizontal" | "vertical";
  className?: string;
  thumbClassName?: string;
}) {
  const { color, ariaLabel, onChange } = usePicker();
  const { locale } = useLocale();
  const trackRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const state = useColorSliderState({
    value: color,
    onChange,
    channel: "hue",
    orientation,
    locale,
  });

  const { isFocusVisible, focusProps } = useFocusRing();
  const { trackProps, thumbProps, inputProps, labelProps } = useColorSlider(
    {
      "aria-label": `${ariaLabel} hue`,
      channel: "hue",
      orientation,
      trackRef,
      inputRef,
    },
    state,
  );

  return (
    <div
      {...trackProps}
      ref={trackRef}
      className={cn(styles.hue, className)}
      style={{ ...trackProps.style, width, height }}
    >
      <VisuallyHidden>
        <span {...labelProps}>{ariaLabel} hue</span>
      </VisuallyHidden>
      <div
        {...thumbProps}
        className={cn(styles.handle, thumbClassName)}
        data-focus={isFocusVisible || undefined}
        style={{
          ...thumbProps.style,
          ...(orientation === "vertical" ? { left: "50%" } : { top: "50%" }),
        }}
      >
        <VisuallyHidden>
          <input ref={inputRef} {...inputProps} {...focusProps} />
        </VisuallyHidden>
      </div>
    </div>
  );
}

export const ColorField = { Root, Picker, PickerRoot, Area, Hue };
