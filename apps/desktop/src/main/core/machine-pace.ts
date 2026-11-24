import { execFile } from "node:child_process";
import { powerMonitor } from "electron";
import { IPC } from "../../shared/constants";
import { MachinePaceWireSchema } from "../../shared/machine-pace";
import type { MachinePaceWire } from "../../shared/machine-pace";
import { safeHandle } from "../ipc/helpers";
import { broadcast } from "../lib/broadcast";

let memoryPressure: "normal" | "warning" | "critical" = "normal";

function readPace(): MachinePaceWire {
  const parsed = MachinePaceWireSchema.safeParse({
    thermal:
      process.platform === "darwin"
        ? powerMonitor.getCurrentThermalState()
        : "unknown",
    onBattery: powerMonitor.isOnBatteryPower(),
    memoryPressure,
  });
  return parsed.success
    ? parsed.data
    : { thermal: "unknown", onBattery: false };
}

const publish = (): void => broadcast(IPC.machinePaceChanged, readPace());

const update = (next: typeof memoryPressure): void => {
  if (memoryPressure === next) {
    return;
  }
  memoryPressure = next;
  publish();
};

const updatePressure = (): void => {
  if (process.platform === "darwin") {
    /** macOS fills free RAM with reclaimable caches, so free memory says nothing; read kernel pressure. */
    execFile(
      "/usr/sbin/sysctl",
      ["-n", "kern.memorystatus_vm_pressure_level"],
      { timeout: 1500, maxBuffer: 1024 },
      (error, stdout) => {
        if (error) {
          return;
        }
        const level = Number(stdout.trim());
        update(level === 4 ? "critical" : level === 2 ? "warning" : "normal");
      },
    );
  } else {
    const info = process.getSystemMemoryInfo();
    const ratio = (info.available ?? info.free) / info.total;
    update(ratio < 0.02 ? "critical" : ratio < 0.05 ? "warning" : "normal");
  }
};

/** macOS thermal state is main-process only. The renderer uses it to stop inference and decorative motion. */
export function startMachinePace(): void {
  safeHandle(IPC.machinePace, () => readPace());
  updatePressure();
  const timer = setInterval(updatePressure, 5000);
  timer.unref();
  process.once("exit", () => clearInterval(timer));
  powerMonitor.on("on-battery", publish);
  powerMonitor.on("on-ac", publish);
  if (process.platform === "darwin") {
    powerMonitor.on("thermal-state-change", publish);
  }
}
