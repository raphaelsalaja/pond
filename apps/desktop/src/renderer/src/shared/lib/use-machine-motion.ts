import { useEffect, useSyncExternalStore } from "react";
import {
  machineMotionPaused,
  machinePlaybackPaused,
  retainMachinePace,
  subscribeMachinePace,
} from "./machine-pace";

export function useMachineMotionPaused(): boolean {
  useEffect(() => retainMachinePace(), []);
  return useSyncExternalStore(
    subscribeMachinePace,
    machineMotionPaused,
    () => false,
  );
}

export function useMachinePlaybackPaused(): boolean {
  useEffect(() => retainMachinePace(), []);
  return useSyncExternalStore(
    subscribeMachinePace,
    machinePlaybackPaused,
    () => false,
  );
}
