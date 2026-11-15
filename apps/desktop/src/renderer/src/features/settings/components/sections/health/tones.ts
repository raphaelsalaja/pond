import type { BadgeTone } from "@pond/ui";
import type { HealthStatus } from "./categories";

export const STATUS_TONES = {
  healthy: "positive",
  pending: "neutral",
  processing: "accent",
  deferred: "neutral",
  blocked: "negative",
  failed: "negative",
  terminal: "negative",
  damaged: "negative",
  unverified: "neutral",
  unchecked: "neutral",
} satisfies Record<HealthStatus, BadgeTone>;
