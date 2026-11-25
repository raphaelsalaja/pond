import { useEffect } from "react";

/** Arrow keys seek instead of stepping while any player holds the active preview slide. */
const players = new Set<symbol>();

export function activeVideoShown(): boolean {
  return players.size > 0;
}

export function useActiveVideo(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const player = Symbol("active video");
    players.add(player);
    return () => {
      players.delete(player);
    };
  }, [active]);
}
