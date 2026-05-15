import { useEffect, useRef } from "react";
import type { Command, PaletteCtx } from "./registry/types";

const CHORD_TIMEOUT_MS = 1500;

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

export function useChords(commands: Command[], getCtx: () => PaletteCtx): void {
  const cmdsRef = useRef(commands);
  cmdsRef.current = commands;
  const ctxRef = useRef(getCtx);
  ctxRef.current = getCtx;

  useEffect(() => {
    let pending: string | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const reset = (): void => {
      pending = null;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey) return reset();
      if (isEditableTarget(e.target)) return reset();
      if (e.key === "Escape") return reset();

      const key = e.key.toLowerCase();
      const isLetter = /^[a-z]$/.test(key);
      if (!isLetter) return reset();

      if (!pending) {
        const couldStart = cmdsRef.current.some(
          (c) => c.chord && c.chord[0]?.toLowerCase() === key,
        );
        if (!couldStart) return;
        pending = key;
        timer = setTimeout(reset, CHORD_TIMEOUT_MS);
        return;
      }

      const sequence = `${pending} ${key}`;
      reset();

      const match = cmdsRef.current.find(
        (c) =>
          c.chord &&
          c.chord.length === 2 &&
          c.chord.map((k) => k.toLowerCase()).join(" ") === sequence,
      );
      if (!match) return;

      const ctx = ctxRef.current();
      if (match.when && !match.when(ctx)) return;
      e.preventDefault();
      void match.perform(ctx);
    };

    window.addEventListener("keydown", onKey);
    return () => {
      reset();
      window.removeEventListener("keydown", onKey);
    };
  }, []);
}
