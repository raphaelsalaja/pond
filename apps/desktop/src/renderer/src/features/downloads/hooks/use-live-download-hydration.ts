import { useEffect } from "react";
import { z } from "zod";
import { reloadSaves } from "@/features/saves/pool";
import { hydrateLiveDownloadSaves } from "../components/page/hydrate-live-saves";

const InflightIdsSchema = z.array(z.string()).catch([]);

/** One poll so sidebar counts stay current while the downloads page is unmounted. */
let subscribers = 0;
let stopHydration: (() => void) | null = null;

function startHydration(): () => void {
  let stopped = false;
  let inflight = new Set<string>();
  const hydrate = async (
    name: "downloads.ingestingOrFailed" | "pipeline.inflight",
  ) => {
    try {
      const ids = InflightIdsSchema.parse(await window.pond.query(name, {}));
      if (stopped) return;
      if (name === "downloads.ingestingOrFailed") {
        await hydrateLiveDownloadSaves(ids, () => stopped);
        return;
      }
      const settled = [...inflight].filter((id) => !ids.includes(id));
      inflight = new Set(ids);
      await reloadSaves([...ids, ...settled]);
    } catch (err) {
      console.warn(`[pond downloads] ${name} refresh failed`, err);
    }
  };
  void hydrate("downloads.ingestingOrFailed");
  void hydrate("pipeline.inflight");
  const timer = setInterval(() => void hydrate("pipeline.inflight"), 2_000);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

export function useLiveDownloadHydration(): void {
  useEffect(() => {
    subscribers += 1;
    if (subscribers === 1) stopHydration = startHydration();
    return () => {
      subscribers -= 1;
      if (subscribers === 0) {
        stopHydration?.();
        stopHydration = null;
      }
    };
  }, []);
}
