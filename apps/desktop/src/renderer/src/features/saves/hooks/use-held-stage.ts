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

export type StageRole = "held" | "pending" | "current";

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

interface Tracked<T> {
  target: StageEntry<T> | null;
  stage: Stage<T>;
}

function restage<T>(
  tracked: Tracked<T>,
  change: (stage: Stage<T>) => Stage<T>,
): Tracked<T> {
  const stage = change(tracked.stage);
  return stage === tracked.stage ? tracked : { target: tracked.target, stage };
}

/**
 * Keeps the shown media on screen until the target reports ready, or until `HOLD_MS` passes.
 * @remarks The cap runs from the first step away, so a fast sweep never pins stale pixels.
 */
export function useHeldStage<T>(target: StageEntry<T> | null) {
  /** One state, so when React rebases away the render-phase update, target and stage rewind together. */
  const [tracked, setTracked] = useState<Tracked<T>>(() => ({
    target,
    stage: { shown: target, pending: null },
  }));
  let { stage } = tracked;
  if (tracked.target !== target) {
    stage = retarget(stage, target);
    setTracked({ target, stage });
  }

  const holding = stage.pending !== null;
  useEffect(() => {
    if (!holding) return;
    const timer = window.setTimeout(() => {
      setTracked((previous) => restage(previous, expire));
    }, HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [holding]);

  const ready = useCallback((key: string) => {
    setTracked((previous) => restage(previous, (now) => settle(now, key)));
  }, []);

  return { layers: stageLayers(stage), ready };
}
