import { useCallback, useEffect, useState } from "react";

/** Longest the outgoing media stays on screen while the incoming media loads. */
const HOLD_MS = 250;

export interface StageEntry<T> {
  key: string;
  /** Media that can stay on screen, or wait off screen, while the next media loads. */
  holds: boolean;
  value: T;
}

export interface Stage<T> {
  shown: StageEntry<T> | null;
  pending: StageEntry<T> | null;
}

type StageRole = "held" | "pending" | "current";

export function retarget<T>(
  stage: Stage<T>,
  next: StageEntry<T> | null,
): Stage<T> {
  if (!next) return { shown: null, pending: null };
  if (stage.shown?.key === next.key) return { shown: next, pending: null };
  if (!stage.shown?.holds || !next.holds) return { shown: next, pending: null };
  return { shown: stage.shown, pending: next };
}

export function settle<T>(stage: Stage<T>, key: string): Stage<T> {
  if (stage.pending?.key !== key) return stage;
  return { shown: stage.pending, pending: null };
}

export function expire<T>(stage: Stage<T>): Stage<T> {
  if (!stage.pending) return stage;
  return { shown: stage.pending, pending: null };
}

export function stageLayers<T>(
  stage: Stage<T>,
): Array<{ entry: StageEntry<T>; role: StageRole }> {
  if (!stage.shown) return [];
  if (!stage.pending) return [{ entry: stage.shown, role: "current" }];
  return [
    { entry: stage.shown, role: "held" },
    { entry: stage.pending, role: "pending" },
  ];
}

/**
 * Keeps the shown media on screen until the target reports ready, or until `HOLD_MS` passes.
 * @remarks The cap runs from the first step away, so a fast sweep never pins stale pixels.
 */
export function useHeldStage<T>(target: StageEntry<T> | null) {
  const [stage, setStage] = useState<Stage<T>>({
    shown: target,
    pending: null,
  });
  const [seen, setSeen] = useState(target);
  let current = stage;
  if (seen !== target) {
    current = retarget(stage, target);
    setSeen(target);
    setStage(current);
  }

  const holding = current.pending !== null;
  useEffect(() => {
    if (!holding) return;
    const timer = window.setTimeout(() => setStage(expire), HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [holding]);

  const ready = useCallback(
    (key: string) => setStage((previous) => settle(previous, key)),
    [],
  );

  return { layers: stageLayers(current), ready };
}
