import { Button, Dialog } from "@pond/ui";
import {
  type ConversionCapability,
  type ConversionPreset,
  ConversionPresetSchema,
} from "@shared/conversion-contracts";
import { useSelector } from "@tanstack/react-store";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  closeConversionDialog,
  type ExportMode,
} from "@/features/library/state/conversion-dialog";
import {
  ensureSaves,
  savesStore,
  useRetainedSaves,
} from "@/features/saves/pool";
import { errorCopy } from "@/shared/lib/error-copy";
import { formatPlural } from "@/shared/lib/format";
import {
  canConvert,
  formatLabel,
  type SizeMode,
  sizeModeFor,
} from "./export-plan";
import { ExportSettings } from "./export-settings";
import { ExportField } from "./fields";
import { type ExportRow, FileList } from "./file-list";
import { SavePreset } from "./save-preset";
import styles from "./styles.module.css";
import { useConversionJob } from "./use-conversion-job";

const EXPORT_MODE_ITEMS: Array<{ value: ExportMode; label: string }> = [
  { value: "files", label: "Original Files" },
  { value: "converted", label: "Converted Files" },
  { value: "eagle-package", label: "Eagle Package" },
  { value: "pond-package", label: "Pond Package" },
  { value: "csv", label: "CSV Metadata" },
];

export function ConversionDialog({
  ids,
  fileIndex,
  initialMode,
  open,
}: {
  ids: readonly string[];
  fileIndex: number;
  initialMode: ExportMode;
  open: boolean;
}) {
  const [mode, setMode] = useState<ExportMode>(initialMode);
  const [preset, setPreset] = useState<ConversionPreset>(() =>
    ConversionPresetSchema.parse({
      id: crypto.randomUUID(),
      name: "Web Image",
      format: "webp",
    }),
  );
  const [sizeMode, setSizeMode] = useState<SizeMode>(() => sizeModeFor(preset));
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
  const [presets, setPresets] = useState<ConversionPreset[]>([]);
  const [capabilities, setCapabilities] = useState<ConversionCapability[]>([]);
  const [conversionOptionsLoaded, setConversionOptionsLoaded] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const fields = useRef<HTMLFieldSetElement>(null);
  const { job, running, busy, error, setError, run, start, cancel, reset } =
    useConversionJob();
  const converting = mode === "converted";
  const selectedCapability = capabilities.find(
    (capability) => capability.format === preset.format,
  );
  const included = ids.filter((id) => !removed.has(id));
  const saves = useSelector(
    savesStore,
    (state) => included.map((id) => state.byId.get(id)),
    {
      compare: (a, b) =>
        a.length === b.length && a.every((save, index) => save === b[index]),
    },
  );
  const rows: ExportRow[] = included.map((id, index) => {
    const save = saves[index];
    const file = save ? (save.files?.[fileIndex] ?? null) : null;
    return {
      id,
      save,
      file,
      skipped:
        converting &&
        save !== undefined &&
        (!file || !canConvert(file, selectedCapability)),
    };
  });
  const exportIds = rows.filter((row) => !row.skipped).map((row) => row.id);
  const sizeValid =
    sizeMode === "original" ||
    (sizeMode !== "height" && preset.width !== null) ||
    (sizeMode === "height" && preset.height !== null);
  const presetValid = ConversionPresetSchema.safeParse(preset).success;
  function submitExport() {
    if (converting && (!sizeValid || !presetValid)) {
      flushSync(() => setShowErrors(true));
      fields.current
        ?.querySelector<HTMLElement>("[aria-invalid='true']")
        ?.focus();
      return;
    }
    void start({ mode, ids: exportIds, fileIndex, preset });
  }
  useRetainedSaves(ids);
  useEffect(() => {
    void ensureSaves(ids).catch(() => undefined);
  }, [ids]);
  useEffect(() => {
    if (!converting || conversionOptionsLoaded) return;
    void Promise.all([
      window.pond.query("conversion.presets", {}),
      window.pond.query("conversion.capabilities", {}),
    ])
      .then(([storedPresets, supportedFormats]) => {
        setPresets(storedPresets);
        setCapabilities(supportedFormats);
        setConversionOptionsLoaded(true);
      })
      .catch((cause) =>
        setError(errorCopy(cause, "Couldn't load presets. Try again.")),
      );
  }, [converting, conversionOptionsLoaded, setError]);
  function save(next: ConversionPreset) {
    return run(async () => {
      const saved = await window.pond.query("conversion.savePreset", {
        preset: next,
      });
      setPreset(saved);
      setPresets(await window.pond.query("conversion.presets", {}));
    }, "Couldn't save the preset. Try again.");
  }
  const count = formatPlural(included.length, { one: "save", other: "saves" });
  const skipped = rows.length - exportIds.length;
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!value) closeConversionDialog();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className={styles.popup}>
          <Dialog.Header>
            <Dialog.Title>Export</Dialog.Title>
          </Dialog.Header>
          <Dialog.Description>{`Choose how to export ${count}, then select a destination.`}</Dialog.Description>
          <div className={styles.body}>
            <Dialog.Content className={styles.settings}>
              <fieldset
                ref={fields}
                disabled={busy || running}
                className={styles.fields}
              >
                <ExportField.Select
                  label="Export Type"
                  value={mode}
                  items={EXPORT_MODE_ITEMS}
                  onChange={(nextMode) => {
                    setMode(nextMode);
                    reset();
                  }}
                />
                {converting ? (
                  <ExportSettings
                    preset={preset}
                    onPresetChange={setPreset}
                    sizeMode={sizeMode}
                    onSizeModeChange={setSizeMode}
                    presets={presets}
                    capabilities={capabilities}
                    disabled={busy || running}
                    showErrors={showErrors}
                  />
                ) : null}
              </fieldset>
              {job ? (
                <div role="status" className={styles.job}>
                  <p>
                    {job.status === "running"
                      ? "Exporting"
                      : job.status === "complete"
                        ? "Export Complete"
                        : job.status === "cancelled"
                          ? "Export Canceled"
                          : "Export Failed"}
                    : {job.completed} of {job.total} files.
                  </p>
                  <progress value={job.progress} max={1} />
                  <p className={styles.hint}>{job.directory}</p>
                  {job.error && job.status === "failed" ? (
                    <p role="alert">{job.error}</p>
                  ) : null}
                  {job.status !== "complete" && job.completed > 0 ? (
                    <p className={styles.hint}>
                      Completed files remain in the export folder.
                    </p>
                  ) : null}
                </div>
              ) : null}
              {error ? (
                <p role="alert" className={styles.error}>
                  {error}
                </p>
              ) : null}
            </Dialog.Content>
            <div className={styles.files}>
              {skipped > 0 ? (
                <p className={styles.skipped} role="status">
                  {`${formatPlural(skipped, { one: "save", other: "saves" })} can't be converted and will be skipped.`}
                </p>
              ) : null}
              <FileList
                rows={rows}
                target={
                  converting && selectedCapability
                    ? {
                        label: formatLabel(preset.format),
                        box: { width: preset.width, height: preset.height },
                      }
                    : null
                }
                disabled={busy || running}
                onRemove={(id) =>
                  setRemoved((current) => new Set([...current, id]))
                }
              />
            </div>
          </div>
          <Dialog.Footer
            leading={
              converting ? (
                <SavePreset
                  initialName={preset.name}
                  disabled={busy || running || !presetValid}
                  onSave={(name) => save({ ...preset, name })}
                />
              ) : undefined
            }
          >
            <Dialog.Cancel>Close</Dialog.Cancel>
            {running ? (
              <Button onClick={() => void cancel()}>Cancel</Button>
            ) : (
              <Button
                variant="primary"
                disabled={busy || exportIds.length === 0}
                loading={busy}
                onClick={submitExport}
              >
                Export
              </Button>
            )}
          </Dialog.Footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
