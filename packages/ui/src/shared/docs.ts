import type { ReactNode } from "react";

export type ComponentTier =
  | "form"
  | "overlay"
  | "navigation"
  | "content"
  | "motion"
  | "composite"
  | "brand";

export interface Example {
  name: string;
  render: () => ReactNode;
}

export interface KeyBinding {
  keys: string;
  action: string;
}

export interface Part {
  name: string;
  description: string;
}

export interface ComponentDocs {
  slug: string;
  name: string;
  tier: ComponentTier;
  summary: string;
  parts: ReadonlyArray<Part>;
  keyboard: ReadonlyArray<KeyBinding>;
  accessibility: ReadonlyArray<string>;
  examples: ReadonlyArray<Example>;
}

export const TIER_LABELS = {
  form: "Form Controls",
  overlay: "Overlays",
  navigation: "Navigation and Layout",
  content: "Content",
  motion: "Motion",
  composite: "Composites",
  brand: "Brand",
} satisfies Record<ComponentTier, string>;
