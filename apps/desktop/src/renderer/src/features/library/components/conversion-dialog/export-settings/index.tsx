import { Slider } from "@pond/ui";
import type {
  ConversionCapability,
  ConversionPreset,
} from "@shared/conversion-contracts";
import type { Dispatch, SetStateAction } from "react";
import {
  boxForMode,
  formatLabel,
  SIZE_ITEMS,
  sizeModeFor,
} from "../export-plan";
import type { SizeMode } from "../export-plan";
import { ExportField } from "../fields";
import styles from "./styles.module.css";

interface ExportSettingsProps {
  preset: ConversionPreset;
  onPresetChange: Dispatch<SetStateAction<ConversionPreset>>;
  sizeMode: SizeMode;
  onSizeModeChange: (mode: SizeMode) => void;
  presets: ReadonlyArray<ConversionPreset>;
  capabilities: ReadonlyArray<ConversionCapability>;
  disabled: boolean;
  showErrors: boolean;
}

function isNumberList(
  value: number | ReadonlyArray<number>,
): value is ReadonlyArray<number> {
  return Array.isArray(value);
}

export function ExportSettings({
  preset,
  onPresetChange,
  sizeMode,
  onSizeModeChange,
  presets,
  capabilities,
  disabled,
  showErrors,
}: ExportSettingsProps) {
  const selectedCapability = capabilities.find(
    (capability) => capability.format === preset.format,
  );
  const timed = selectedCapability?.category !== "image";
  function setSize(next: Partial<Pick<ConversionPreset, "width" | "height">>) {
    onPresetChange((current) => ({ ...current, ...next }));
  }
  return (
    <>
      <ExportField.Select
        label="Preset"
        value={presets.some((item) => item.id === preset.id) ? preset.id : ""}
        items={[
          { value: "", label: "Custom" },
          ...presets.map((item) => ({
            value: item.id,
            label: item.name,
          })),
        ]}
        onChange={(id) => {
          const selected = presets.find((item) => item.id === id);
          if (selected) {
            onPresetChange(selected);
            onSizeModeChange(sizeModeFor(selected));
            return;
          }
          const customId = crypto.randomUUID();
          onPresetChange((current) => ({ ...current, id: customId }));
          onSizeModeChange(sizeModeFor(preset));
        }}
      />
      <ExportField.Select
        label="Format"
        value={preset.format}
        items={capabilities.map((capability) => ({
          value: capability.format,
          label: `${formatLabel(capability.format)}${
            capability.available ? "" : " (Unavailable)"
          }`,
          disabled: !capability.available,
        }))}
        onChange={(format) => {
          const capability = capabilities.find(
            (value) => value.format === format,
          );
          if (capability) {
            onPresetChange((current) => ({
              ...current,
              format: capability.format,
              lossless: capability.supportsLossless ? current.lossless : false,
            }));
          }
        }}
      />
      <Slider.Root
        className={styles.slider}
        min={1}
        max={100}
        value={preset.quality}
        disabled={disabled}
        onValueChange={(quality) =>
          onPresetChange((current) => ({
            ...current,
            quality: isNumberList(quality)
              ? (quality[0] ?? current.quality)
              : quality,
          }))
        }
      >
        <Slider.Label>Quality</Slider.Label>
        <Slider.Control>
          <Slider.Track>
            <Slider.Indicator />
            <Slider.Thumb />
          </Slider.Track>
        </Slider.Control>
        <Slider.Value />
      </Slider.Root>
      {selectedCapability?.supportsLossless ? (
        <ExportField.Lossless
          checked={preset.lossless}
          disabled={disabled}
          onChange={(lossless) =>
            onPresetChange((current) => ({ ...current, lossless }))
          }
        />
      ) : null}
      <ExportField.Select
        label="Size"
        value={sizeMode}
        items={SIZE_ITEMS}
        onChange={(next) => {
          onSizeModeChange(next);
          onPresetChange((current) => ({
            ...current,
            ...boxForMode(next, current),
          }));
        }}
      />
      {sizeMode === "width" || sizeMode === "box" ? (
        <ExportField.Number
          label="Max Width"
          suffix="px"
          integer
          showError={showErrors}
          min={1}
          max={8192}
          value={preset.width}
          onChange={(width) => setSize({ width })}
        />
      ) : null}
      {sizeMode === "height" || sizeMode === "box" ? (
        <ExportField.Number
          label="Max Height"
          suffix="px"
          integer
          required={sizeMode === "height"}
          showError={showErrors}
          min={1}
          max={8192}
          value={preset.height}
          onChange={(height) => setSize({ height })}
        />
      ) : null}
      {sizeMode === "long-edge" ? (
        <ExportField.Number
          label="Max Long Edge"
          suffix="px"
          integer
          showError={showErrors}
          min={1}
          max={8192}
          value={preset.width}
          onChange={(edge) => setSize({ width: edge, height: edge })}
        />
      ) : null}
      {timed ? (
        <>
          <ExportField.Number
            label="Start"
            suffix="sec"
            showError={showErrors}
            min={0}
            max={86_400}
            value={preset.start}
            onChange={(start) =>
              onPresetChange((current) => ({
                ...current,
                start: start ?? Number.NaN,
              }))
            }
          />
          <ExportField.Number
            label="Duration"
            suffix="sec"
            showError={showErrors}
            min={0.1}
            max={3600}
            step={0.1}
            value={preset.duration}
            onChange={(duration) =>
              onPresetChange((current) => ({
                ...current,
                duration: duration ?? Number.NaN,
              }))
            }
          />
          <ExportField.Number
            label="Frames per Second"
            integer
            showError={showErrors}
            min={1}
            max={120}
            value={preset.fps}
            onChange={(fps) =>
              onPresetChange((current) => ({
                ...current,
                fps: fps ?? Number.NaN,
              }))
            }
          />
        </>
      ) : null}
    </>
  );
}
