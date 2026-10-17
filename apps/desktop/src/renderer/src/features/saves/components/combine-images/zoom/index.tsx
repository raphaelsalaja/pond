import { IconArrowsExpandDiagonal, IconMinus, IconPlus } from "@pond/icons";
import { Button, Menu, type MenuItemSpec, Slider } from "@pond/ui";
import { platformGlyphs } from "@/shared/lib/shortcuts";
import styles from "./styles.module.css";

const PRESETS = [0.05, 0.1, 0.25, 0.5, 1, 1.25, 1.5, 2, 3, 4, 8] as const;
const ZOOM_MIN = 0.05;
const ZOOM_MAX = 8;
const SLIDER_MAX = 1000;

export function clampZoom(scale: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, scale));
}

export function stepZoom(scale: number, direction: 1 | -1): number {
  if (direction > 0)
    return PRESETS.find((preset) => preset > scale * 1.001) ?? ZOOM_MAX;
  return (
    [...PRESETS].reverse().find((preset) => preset < scale * 0.999) ?? ZOOM_MIN
  );
}

/** Logarithmic so each slider step feels the same at 5% and at 800%. */
function toSlider(scale: number): number {
  return Math.round(
    (Math.log(clampZoom(scale) / ZOOM_MIN) / Math.log(ZOOM_MAX / ZOOM_MIN)) *
      SLIDER_MAX,
  );
}

function fromSlider(value: number): number {
  return ZOOM_MIN * (ZOOM_MAX / ZOOM_MIN) ** (value / SLIDER_MAX);
}

function percent(scale: number): string {
  return `${Math.round(scale * 100)}%`;
}

export function ZoomBar({
  scale,
  fit,
  onZoom,
  onFit,
}: {
  scale: number;
  fit: boolean;
  onZoom: (scale: number) => void;
  onFit: () => void;
}) {
  const items: MenuItemSpec[] = [
    ...PRESETS.map(
      (preset): MenuItemSpec => ({
        type: "checkbox",
        indicator: "check",
        label: percent(preset),
        checked: !fit && Math.abs(scale - preset) < 0.0005,
        onCheckedChange: () => onZoom(preset),
      }),
    ),
    { type: "separator" },
    {
      type: "checkbox",
      indicator: "check",
      label: "Actual Size",
      shortcut: platformGlyphs(["⌘", "0"]),
      checked: !fit && scale === 1,
      onCheckedChange: () => onZoom(1),
    },
    {
      type: "checkbox",
      indicator: "check",
      label: "Zoom to Fit",
      shortcut: platformGlyphs(["⌘", "9"]),
      checked: fit,
      onCheckedChange: onFit,
    },
  ];
  return (
    <div className={styles.bar}>
      <Button
        icon
        size="xs"
        variant="ghost"
        aria-label="Zoom Out"
        onClick={() => onZoom(stepZoom(scale, -1))}
      >
        <IconMinus size={12} />
      </Button>
      <Slider.Root
        className={styles.slider}
        min={0}
        max={SLIDER_MAX}
        value={toSlider(scale)}
        onValueChange={(value) =>
          onZoom(fromSlider(Array.isArray(value) ? (value[0] ?? 0) : value))
        }
      >
        <Slider.Control>
          <Slider.Track>
            <Slider.Indicator />
            <Slider.Thumb aria-label="Zoom" />
          </Slider.Track>
        </Slider.Control>
      </Slider.Root>
      <Button
        icon
        size="xs"
        variant="ghost"
        aria-label="Zoom In"
        onClick={() => onZoom(stepZoom(scale, 1))}
      >
        <IconPlus size={12} />
      </Button>
      <span className={styles.divider} aria-hidden="true" />
      <Menu.Root>
        <Menu.Trigger
          className={styles.percent}
          size="xs"
          variant="ghost"
          aria-label="Zoom Level"
        >
          {percent(scale)}
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner side="top" align="center">
            <Menu.Popup>
              <Menu.Items items={items} />
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
      <span className={styles.divider} aria-hidden="true" />
      <Button
        icon
        size="xs"
        variant="ghost"
        aria-label="Zoom to Fit"
        aria-pressed={fit}
        onClick={onFit}
      >
        <IconArrowsExpandDiagonal size={12} />
      </Button>
    </div>
  );
}
