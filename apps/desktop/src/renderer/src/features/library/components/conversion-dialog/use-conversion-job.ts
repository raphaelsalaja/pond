import type {
  ConversionJob,
  ConversionPreset,
} from "@shared/conversion-contracts";
import { useEffect, useState } from "react";
import { closeConversionDialog } from "@/features/library/state/conversion-dialog";
import type { ExportMode } from "@/features/library/state/conversion-dialog";
import { exportSelectionCsv, exportSelectionFiles } from "@/features/saves";
import { errorCopy } from "@/shared/lib/error-copy";

interface ExportRequest {
  mode: ExportMode;
  ids: Array<string>;
  fileIndex: number;
  preset: ConversionPreset;
}

async function exportSaves(
  mode: Exclude<ExportMode, "converted">,
  ids: Array<string>,
) {
  if (mode === "files") {
    const result = await exportSelectionFiles(ids);
    if (!result.ok) {
      throw new Error(result.message);
    }
    return;
  }
  if (mode === "csv") {
    const result = await exportSelectionCsv(ids);
    if (!result.ok) {
      throw new Error(result.message);
    }
    return;
  }
  if (mode === "eagle-package") {
    const result = await window.pond.query("saves.exportEaglePackage", {
      ids,
    });
    if (!result.ok && result.reason !== "cancelled") {
      throw new Error(
        result.error || "Couldn't export the Eagle package. Try again.",
      );
    }
    return;
  }
  const result = await window.pond.query("saves.exportPackage", { ids });
  if (!result.ok && result.reason !== "cancelled") {
    throw new Error(
      result.error || "Couldn't export the Pond package. Try again.",
    );
  }
}

export function useConversionJob() {
  const [job, setJob] = useState<ConversionJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = job?.status === "running";

  useEffect(() => {
    if (job?.status !== "running") {
      return;
    }
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      if (!job) {
        return;
      }
      try {
        const next = await window.pond.query("conversion.status", {
          id: job.id,
        });
        if (!stopped && next) {
          setJob(next);
        }
      } catch (error_) {
        if (!stopped) {
          setError(
            errorCopy(error_, "Couldn't check export progress. Try again."),
          );
        }
      }
      if (!stopped) {
        timer = setTimeout(() => void poll(), 500);
      }
    }
    timer = setTimeout(() => void poll(), 200);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [job]);

  async function run(task: () => Promise<void>, fallback: string) {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (error_) {
      setError(errorCopy(error_, fallback));
    } finally {
      setBusy(false);
    }
  }

  function start({ mode, ids, fileIndex, preset }: ExportRequest) {
    return run(async () => {
      if (mode === "converted") {
        const result = await window.pond.query("conversion.start", {
          ids,
          fileIndex,
          preset,
        });
        if (result) {
          setJob(result);
        }
        return;
      }
      await exportSaves(mode, ids);
      closeConversionDialog();
    }, "Couldn't export files. Try again.");
  }

  async function cancel() {
    if (!job) {
      return;
    }
    try {
      setJob(await window.pond.query("conversion.cancel", { id: job.id }));
    } catch (error_) {
      setError(errorCopy(error_, "Couldn't cancel the export. Try again."));
    }
  }

  function reset() {
    setJob(null);
    setError(null);
  }

  return { job, running, busy, error, setError, run, start, cancel, reset };
}
