import {
  IconMinus as Minus,
  IconPlus as Plus,
  IconArrowRotateAnticlockwise as RotateCcw,
} from "@pond/icons";
import {
  Button,
  ColorField,
  Input,
  Settings,
  Slider,
  Stepper,
  Switch,
  Tooltip,
} from "@pond/ui";
import { useId } from "react";
import type { ReactNode } from "react";
import { z } from "zod";
import type {
  Binding,
  ButtonItem,
  CustomItem,
  FieldItem,
  Item,
  SelectOption,
} from "@/features/settings/lib/engine-types";
import { EnumSelect } from "@/shared/components/enum-select";
import { clamp } from "@/shared/lib/math";
import styles from "./styles.module.css";

const ControlValueSchema = z
  .union([z.string(), z.number(), z.boolean(), z.null()])
  .catch(null);

type ControlValue = z.infer<typeof ControlValueSchema>;

const FiniteNumberSchema = z.number().refine(Number.isFinite);
const HexColorSchema = z.string().catch("#000000");

function isNumberList(
  value: number | ReadonlyArray<number>,
): value is ReadonlyArray<number> {
  return typeof value !== "number";
}

export function ItemView({ item, binding }: { item: Item; binding: Binding }) {
  const titleId = useId();
  const descriptionId = useId();
  const labelled = {
    "aria-labelledby": titleId,
    "aria-describedby":
      item.control !== "custom" && item.description ? descriptionId : undefined,
  };
  if (item.control === "custom") {
    return <CustomControl item={item} binding={binding} />;
  }

  return (
    <>
      <Settings.ItemDetails>
        <Settings.ItemTitle id={titleId}>
          {item.title}
          {item.tooltip ? (
            <Tooltip.Info
              label={item.tooltip}
              aria-label={`About ${item.title}`}
            />
          ) : null}
        </Settings.ItemTitle>
        {item.description ? (
          <Settings.ItemDescription id={descriptionId}>
            {item.description}
          </Settings.ItemDescription>
        ) : null}
      </Settings.ItemDetails>
      <Settings.ItemControl>
        {item.control === "button" ? (
          <ButtonControl item={item} binding={binding} />
        ) : (
          <FieldControl item={item} binding={binding} labelled={labelled} />
        )}
      </Settings.ItemControl>
    </>
  );
}

function CustomControl({
  item,
  binding,
}: {
  item: CustomItem;
  binding: Binding;
}) {
  return <>{item.render(binding)}</>;
}

function ButtonControl({
  item,
  binding,
}: {
  item: ButtonItem;
  binding: Binding;
}) {
  return (
    <Button
      size="sm"
      variant={item.variant ?? "secondary"}
      disabled={item.disabled?.(binding.values) ?? false}
      onClick={item.onClick}
    >
      {item.label}
    </Button>
  );
}

function FieldControl({
  item,
  binding,
  labelled,
}: {
  item: FieldItem;
  binding: Binding;
  labelled: { "aria-labelledby": string; "aria-describedby"?: string };
}): ReactNode {
  const { values } = binding;
  const patch = (delta: Parameters<Binding["patch"]>[0]) => {
    void Promise.resolve(binding.patch(delta)).then(() => item.apply?.());
  };
  const current = ControlValueSchema.parse(values[item.key]);
  const disabled = !binding.loaded || (item.disabled?.(values) ?? false);

  switch (item.control) {
    case "switch":
      return (
        <Switch.Root
          {...labelled}
          checked={Boolean(current)}
          disabled={disabled}
          onCheckedChange={(v) => {
            patch({ [item.key]: v });
          }}
        />
      );

    case "select":
      return (
        <EnumSelect<SelectOption["value"]>
          {...labelled}
          value={current}
          disabled={disabled}
          onValueChange={(next) => {
            patch({ [item.key]: next });
          }}
          options={item.options}
          placeholder={item.placeholder}
        />
      );

    case "range":
      return (
        <Slider.Root
          disabled={disabled}
          min={item.min}
          max={item.max}
          step={item.step}
          value={toNumber(current, item.min)}
          onValueChange={(next: number | ReadonlyArray<number>) => {
            const n = isNumberList(next) ? (next[0] ?? item.min) : next;
            patch({ [item.key]: n });
          }}
        >
          <Slider.Control>
            <Slider.Track>
              <Slider.Indicator />
              <Slider.Thumb {...labelled} />
            </Slider.Track>
          </Slider.Control>
          <Input.Root size="sm">
            <Input.Field
              type="number"
              min={item.min}
              max={item.max}
              step={item.step}
              {...labelled}
              disabled={disabled}
              value={String(toNumber(current, item.min))}
              onChange={(e) => {
                const n = clamp(
                  Math.round(Number(e.target.value) || item.min),
                  item.min,
                  item.max,
                );
                patch({ [item.key]: n });
              }}
              style={{
                width: `${String(item.max).length + 2}ch`,
                textAlign: "right",
              }}
            />
          </Input.Root>
        </Slider.Root>
      );

    case "stepper":
      return (
        <Stepper
          {...labelled}
          aria-label={item.title}
          min={item.min}
          max={item.max}
          step={item.step}
          fallback={item.fallback ?? item.min}
          value={toNumber(current, item.fallback ?? item.min)}
          onValueChange={(n) => {
            patch({ [item.key]: n });
          }}
          decrementIcon={<Minus />}
          incrementIcon={<Plus />}
          resetIcon={<RotateCcw />}
        />
      );

    case "number":
      return (
        <div className={styles.number}>
          <Input.Field
            {...labelled}
            data-size="sm"
            type="number"
            min={item.min}
            max={item.max}
            disabled={disabled}
            value={String(toNumber(current, item.min))}
            onChange={(e) => {
              const next = clamp(
                Math.round(Number(e.target.value) || item.min),
                item.min,
                item.max,
              );
              patch({ [item.key]: next });
            }}
            style={{ width: item.width ?? 96 }}
          />
          {item.unit ? <span className={styles.unit}>{item.unit}</span> : null}
        </div>
      );

    case "color":
      return (
        <ColorField.Root
          aria-describedby={labelled["aria-describedby"]}
          aria-label={item.title}
          value={HexColorSchema.parse(current)}
          onChange={(hex) => {
            patch({ [item.key]: hex });
          }}
        />
      );

    default:
      return null;
  }
}

function toNumber(value: ControlValue, fallback: number): number {
  const parsed = FiniteNumberSchema.safeParse(value);
  return parsed.success ? parsed.data : fallback;
}
