import type { CaptureReceipt } from "@pond/schema/capture";
import { IPC } from "../shared/constants";
import type { FishOpen } from "../shared/fish-contracts";

const HANDOFF_TTL_MS = 30 * 60_000;

interface HandoffWindow {
  isDestroyed(): boolean;
  webContents: {
    isLoading(): boolean;
    send(channel: string, payload: FishOpen): void;
    once(event: "did-finish-load", listener: () => void): void;
  };
}

export interface FishHandoffDeps {
  fishExists(id: string): boolean | Promise<boolean>;
  openMainWindow(): Promise<HandoffWindow | null>;
  /** The browser keeps focus after a capture, so Pond has to take it. */
  activate?(): void;
  ttlMs?: number;
}

/** Remembers which fish a browser capture is for, then opens that fish once the save lands. */
export function createFishHandoff(deps: FishHandoffDeps) {
  const pending = new Map<string, string>();
  return {
    remember(captureId: string, fishId: string): void {
      pending.set(captureId, fishId);
      setTimeout(
        () => pending.delete(captureId),
        deps.ttlMs ?? HANDOFF_TTL_MS,
      ).unref();
    },
    async complete(receipt: CaptureReceipt): Promise<void> {
      const fishId = pending.get(receipt.id);
      if (!fishId) return;
      pending.delete(receipt.id);
      if (!receipt.saveIds.length || !(await deps.fishExists(fishId))) return;
      deps.activate?.();
      const win = await deps.openMainWindow();
      if (!win || win.isDestroyed()) return;
      const payload: FishOpen = { fishId, saveIds: receipt.saveIds };
      const send = () => win.webContents.send(IPC.fishOpen, payload);
      if (win.webContents.isLoading()) {
        win.webContents.once("did-finish-load", send);
      } else {
        send();
      }
    },
  };
}
