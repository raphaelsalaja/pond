"use client";

import { isElement } from "@pond/ui/dom";
import { loadUiSounds } from "@pond/ui/sounds";
import type { UiSoundName } from "@pond/ui/sounds";
import { ensureReady } from "@web-kits/audio";
import { useEffect } from "react";

const CONTROL = "a[href], button";
const RATE_MS = 40;
const RAPID_MS = 110;

/** Download buttons carry `data-variant`; the quieter text links do not. */
function cueFor(control: Element): UiSoundName {
  return control.hasAttribute("data-variant") ? "tap" : "soft";
}

/** A click sound is decoration, so a cue the browser won't play is dropped. */
function skipCue() {}

export function Sounds() {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let last = 0;
    /** The recordings sit outside the first paint's JS, so fetch them before the first click needs one. */
    if (!reduce.matches) void loadUiSounds().catch(skipCue);

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || reduce.matches) {
        return;
      }
      if (!isElement(event.target)) {
        return;
      }
      const control = event.target.closest(CONTROL);
      if (!control) return;

      const now = performance.now();
      if (now - last < RATE_MS) return;
      const volume = now - last < RAPID_MS ? 0.7 : 1;
      last = now;

      const name = cueFor(control);
      void Promise.all([ensureReady(), loadUiSounds()])
        .then(([, playUiSound]) => playUiSound(name, { volume }))
        .catch(skipCue);
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", onPointerDown, true);
  }, []);

  return null;
}
