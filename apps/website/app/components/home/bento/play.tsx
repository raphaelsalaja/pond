"use client";

import { type RefObject, useEffect, useState } from "react";

type Wait = (ms: number) => Promise<void>;

export type Play<S> = (set: (next: S) => void, wait: Wait) => Promise<void>;

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const id = window.setTimeout(() => resolve(), ms);
    const abort = () => {
      window.clearTimeout(id);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
  });
}

/** `null` until the browser reports a preference, so the first paint stays on the poster. */
function useReducedMotion(): boolean | null {
  const [reduced, setReduced] = useState<boolean | null>(null);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
}

function useInView(ref: RefObject<Element | null>): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry?.isIntersecting === true),
      { threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);

  return visible;
}

/**
 * Loops a short scene. Reduced motion, a hidden tab, and an off-screen card
 * hold `poster` — the settled frame that still tells the story.
 */
export function usePosterLoop<S>(
  poster: S,
  play: Play<S>,
  ref: RefObject<Element | null>,
): S {
  const reduced = useReducedMotion();
  const inView = useInView(ref);
  const [hidden, setHidden] = useState(false);
  const playing = reduced === false && inView && !hidden;
  const [state, setState] = useState(poster);

  useEffect(() => {
    const onChange = () => setHidden(document.visibilityState === "hidden");
    onChange();
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  useEffect(() => {
    if (!playing) {
      setState(poster);
      return;
    }
    const controller = new AbortController();
    const { signal } = controller;
    const wait: Wait = (ms) => delay(ms, signal);
    const set = (next: S) => {
      if (!signal.aborted) setState(next);
    };
    void (async () => {
      try {
        while (!signal.aborted) await play(set, wait);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          throw error;
        }
      }
    })();
    return () => controller.abort();
  }, [playing, play, poster]);

  return playing ? state : poster;
}
