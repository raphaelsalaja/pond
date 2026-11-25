import type { ThermalState } from "../../../shared/machine-pace";
import type { MediaIndexPauseReason } from "../../../shared/media-index";

export type { ThermalState };

export interface MediaWarmSignals {
  idleSeconds: number;
  onBattery: boolean;
  thermal: ThermalState;
  manual: boolean;
}

export function mediaWarmPauseReason(
  signals: MediaWarmSignals,
): MediaIndexPauseReason | null {
  if (signals.thermal === "serious" || signals.thermal === "critical") {
    return "thermal";
  }
  if (signals.manual) return null;
  if (signals.onBattery) return "battery";
  if (signals.idleSeconds < 10) return "active";
  return null;
}
