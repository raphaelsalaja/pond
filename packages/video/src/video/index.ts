import type { ReactNode } from "react";

export const WIDTH = 1920;
export const HEIGHT = 1080;
export const FPS = 30;

export interface Video {
  /** Window title while capturing; also names the render. */
  title: string;
  duration: number;
  /** A settled moment, in ms, pulled as the poster. Never baked into frame 0. */
  poster: number;
  /** Every image URL the cut shows, decoded before the first frame is captured. */
  media: Array<string>;
  Composition: (props: { t: number }) => ReactNode;
}

export const defineVideo = (video: Video) => video;

/** Scene windows by name, with `start` and `end` lookups. */
export function scenes<Id extends string>(
  windows: Record<Id, readonly [number, number]>,
) {
  return {
    start: (id: Id) => windows[id][0],
    end: (id: Id) => windows[id][1],
  };
}
