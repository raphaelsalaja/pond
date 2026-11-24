import {
  IconAlign2Bottom,
  IconAlign2Horizontal,
  IconAlign2Left,
  IconAlign2Right,
  IconAlign2Top,
  IconAlign2Vertical,
  IconArrowsExpandX,
  IconArrowsExpandY,
  IconGridLayoutCols,
  IconGridLayoutRows,
  IconXmark,
} from "@pond/icons";
import {
  Button,
  ColorField,
  Input,
  Select,
  Switch,
  Toggle,
  ToggleGroup,
} from "@pond/ui";
import type { CombineImagesOptions } from "@shared/combine-images-contracts";
import type { CombineLayout } from "@shared/combine-images-layout";
import { useId, useState } from "react";
import type { ReactNode } from "react";
import { clamp } from "@/shared/lib/math";
import {
  LIMITS,
  QUALITIES,
  sizeKeys,
  supportsTransparency,
  withDirection,
  withSize,
} from "../options";
import type { Highlight, SizeKey } from "../options";
import styles from "./styles.module.css";

const OUTPUTS = [
  { value: "create", label: "Create" },
  { value: "export", label: "Export" },
] as const;
const DIRECTIONS = [
  {
    value: "vertical",
    label: "Vertical",
    icon: <IconGridLayoutRows size={12} />,
  },
  {
    value: "horizontal",
    label: "Horizontal",
    icon: <IconGridLayoutCols size={12} />,
  },
] as const;
const ALIGNMENTS = {
  horizontal: [
    { value: "start", label: "Top", icon: <IconAlign2Top size={12} /> },
    {
      value: "center",
      label: "Middle",
      icon: <IconAlign2Vertical size={12} />,
    },
    { value: "end", label: "Bottom", icon: <IconAlign2Bottom size={12} /> },
    {
      value: "stretch",
      label: "Fill Height",
      icon: <IconArrowsExpandY size={12} />,
    },
  ],
  vertical: [
    { value: "start", label: "Left", icon: <IconAlign2Left size={12} /> },
    {
      value: "center",
      label: "Center",
      icon: <IconAlign2Horizontal size={12} />,
    },
    { value: "end", label: "Right", icon: <IconAlign2Right size={12} /> },
    {
      value: "stretch",
      label: "Fill Width",
      icon: <IconArrowsExpandX size={12} />,
    },
  ],
} as const;
const FORMATS = [
  { value: "jpeg", label: "JPEG" },
  { value: "png", label: "PNG" },
  { value: "webp", label: "WebP" },
] as const;
const SIZE_LABELS = { width: "Width", height: "Height" } as const;

export function CombineSettings({
  options,
  layout,
  count,
  busy,
  onChange,
  onHighlight,
  onSubmit,
  onClose,
}: {
  options: CombineImagesOptions;
  layout: CombineLayout;
  count: number;
  busy: boolean;
  onChange: (options: CombineImagesOptions) => void;
  onHighlight: (highlight: Highlight) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const id = useId();
  const update = <Key extends keyof CombineImagesOptions>(
    key: Key,
    value: CombineImagesOptions[Key],
  ) => onChange({ ...options, [key]: value });
  const exporting = options.output === "export";
  const transparent = supportsTransparency(options.format);
  return (
    <section className={styles.settings}>
      <header className={styles.header}>
        <h1 className={styles.title}>Combine Images</h1>
        <Button
          className={styles.close}
          icon
          size="sm"
          variant="ghost"
          aria-label="Close Combine Images"
          onClick={onClose}
        >
          <IconXmark />
        </Button>
      </header>
      <div className={styles.scroll} data-scroll-fade="vertical">
        <div className={styles.group}>
          <ToggleGroup
            aria-label="Output"
            className={styles.output}
            value={[options.output]}
            onValueChange={(value) => {
              const next = OUTPUTS.find((item) => item.value === value[0]);
              if (next) {
                update("output", next.value);
              }
            }}
          >
            {OUTPUTS.map((item) => (
              <Toggle key={item.value} value={item.value} size="sm">
                {item.label}
              </Toggle>
            ))}
          </ToggleGroup>
          <Row label="Direction">
            <IconToggles
              label="Direction"
              items={DIRECTIONS}
              value={options.direction}
              onChange={(value) => onChange(withDirection(options, value))}
            />
          </Row>
          <Row label="Align">
            <IconToggles
              label="Align"
              items={ALIGNMENTS[options.direction]}
              value={options.alignment}
              onChange={(value) => update("alignment", value)}
            />
          </Row>
        </div>
        <div className={styles.group}>
          {sizeKeys(options.direction).map((key: SizeKey) => (
            <Row key={key} label={SIZE_LABELS[key]} htmlFor={`${id}-${key}`}>
              <PixelField
                id={`${id}-${key}`}
                value={layout[key]}
                limits={LIMITS.size}
                onCommit={(value) => onChange(withSize(options, key, value))}
              />
            </Row>
          ))}
          <Row label="Margin" htmlFor={`${id}-margin`}>
            <PixelField
              id={`${id}-margin`}
              value={options.margin}
              limits={LIMITS.spacing}
              onCommit={(value) => update("margin", value)}
              onFocus={() => onHighlight("margin")}
              onBlur={() => onHighlight(null)}
            />
          </Row>
          <Row label="Spacing" htmlFor={`${id}-spacing`}>
            <PixelField
              id={`${id}-spacing`}
              value={options.spacing}
              limits={LIMITS.spacing}
              onCommit={(value) => update("spacing", value)}
              onFocus={() => onHighlight("spacing")}
              onBlur={() => onHighlight(null)}
            />
          </Row>
        </div>
        <div className={styles.group}>
          <Row label="Image Radius" htmlFor={`${id}-radius`}>
            <PixelField
              id={`${id}-radius`}
              value={options.radius}
              limits={LIMITS.spacing}
              onCommit={(value) => update("radius", value)}
            />
          </Row>
          {transparent ? (
            <Row label="Canvas Radius" htmlFor={`${id}-canvas-radius`}>
              <PixelField
                id={`${id}-canvas-radius`}
                value={options.canvasRadius}
                limits={LIMITS.spacing}
                onCommit={(value) => update("canvasRadius", value)}
              />
            </Row>
          ) : null}
          <Row label="Background Color">
            <ColorField.Root
              aria-label="Background Color"
              className={styles.color}
              value={options.background}
              onChange={(hex) => update("background", hex)}
            />
          </Row>
        </div>
        <div className={styles.group}>
          <Row label="Format">
            <ValueSelect
              label="Format"
              items={FORMATS}
              value={options.format}
              onChange={(value) => update("format", value)}
            />
          </Row>
          {options.format !== "png" ? (
            <Row label="Quality">
              <ValueSelect
                label="Quality"
                items={QUALITIES}
                value={clamp(Math.round(options.quality / 5), 2, 20) * 5}
                onChange={(value) => update("quality", value)}
              />
            </Row>
          ) : null}
        </div>
        {exporting ? null : (
          <div className={styles.group}>
            <Row label="Move Originals to Trash" compact>
              <Switch.Root
                aria-label="Move Originals to Trash"
                checked={options.deleteOriginals}
                onCheckedChange={(value) => update("deleteOriginals", value)}
              />
            </Row>
          </div>
        )}
      </div>
      <footer className={styles.footer}>
        <Button
          width="full"
          loading={busy}
          disabled={busy || count < 2}
          onClick={onSubmit}
        >
          {exporting ? "Export Image" : "Create Image"}
        </Button>
      </footer>
    </section>
  );
}

function Row({
  label,
  htmlFor,
  compact,
  children,
}: {
  label: string;
  htmlFor?: string;
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={styles.row} data-compact={compact || undefined}>
      {htmlFor ? (
        <label className={styles.label} htmlFor={htmlFor}>
          {label}
        </label>
      ) : (
        <span className={styles.label}>{label}</span>
      )}
      <div className={styles.control}>{children}</div>
    </div>
  );
}

function IconToggles<const Value extends string>({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: ReadonlyArray<{ value: Value; label: string; icon: ReactNode }>;
  value: Value;
  onChange: (value: Value) => void;
}) {
  return (
    <ToggleGroup
      aria-label={label}
      className={styles.toggles}
      value={[value]}
      onValueChange={(next) => {
        const match = items.find((item) => item.value === next[0]);
        if (match) {
          onChange(match.value);
        }
      }}
    >
      {items.map((item) => (
        <Toggle
          key={item.value}
          value={item.value}
          size="sm"
          aria-label={item.label}
          title={item.label}
        >
          {item.icon}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}

/** Shows the live value until edited, then commits each valid keystroke so the preview follows typing. */
function PixelField({
  id,
  value,
  limits,
  onCommit,
  onFocus,
  onBlur,
}: {
  id: string;
  value: number;
  limits: readonly [number, number];
  onCommit: (value: number) => void;
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <Input.Root size="sm">
      <Input.Field
        id={id}
        inputMode="numeric"
        value={draft ?? String(value)}
        onFocus={onFocus}
        onBlur={() => {
          setDraft(null);
          onBlur?.();
        }}
        onValueChange={(next) => {
          setDraft(next);
          const parsed = Number(next);
          if (next.trim() !== "" && Number.isFinite(parsed)) {
            onCommit(clamp(Math.round(parsed), ...limits));
          }
        }}
      />
      <Input.Suffix>px</Input.Suffix>
    </Input.Root>
  );
}

function ValueSelect<const Value extends string | number>({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: ReadonlyArray<{ value: Value; label: string }>;
  value: Value;
  onChange: (value: Value) => void;
}) {
  return (
    <Select.Root
      items={[...items]}
      value={value}
      onValueChange={(next) => {
        const match = items.find((item) => item.value === next);
        if (match) {
          onChange(match.value);
        }
      }}
    >
      <Select.Trigger aria-label={label} size="sm" width="full">
        <Select.Value />
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner>
          <Select.Popup>
            <Select.Items items={[...items]} />
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
