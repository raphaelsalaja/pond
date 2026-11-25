import type { AnyRouter, RouterHistory } from "@tanstack/react-router";

let current: AnyRouter | null = null;

export function setAppRouter(router: AnyRouter): void {
  current = router;
}

export function getAppRouter(): AnyRouter | null {
  return current;
}

function isRouterHistory(value: unknown): value is RouterHistory {
  return (
    typeof value === "object" &&
    value !== null &&
    "push" in value &&
    "replace" in value &&
    "subscribe" in value
  );
}

/** `AnyRouter` types `history` as `any`; this narrows it once for callers. */
export function routerHistory(router: AnyRouter | null): RouterHistory | null {
  const history: unknown = router?.history;
  return isRouterHistory(history) ? history : null;
}

export function getAppHistory(): RouterHistory | null {
  return routerHistory(current);
}
