import {
  COMPONENT_DOCS,
  type ComponentDocs,
  type ComponentTier,
  TIER_LABELS,
} from "@pond/ui/docs";

/** SAFETY: `TIER_LABELS` satisfies `Record<ComponentTier, string>`, so its keys are exactly the tiers. */
const TIERS = Object.keys(TIER_LABELS) as ComponentTier[];

export interface TierGroup {
  tier: ComponentTier;
  label: string;
  docs: readonly ComponentDocs[];
}

export function groupByTier(
  docs: readonly ComponentDocs[] = COMPONENT_DOCS,
): TierGroup[] {
  return TIERS.map((tier) => ({
    tier,
    label: TIER_LABELS[tier],
    docs: docs.filter((entry) => entry.tier === tier),
  })).filter((group) => group.docs.length > 0);
}
