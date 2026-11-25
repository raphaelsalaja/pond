import { COMPONENT_DOCS, TIER_LABELS } from "@pond/ui/docs";
import type { ComponentDocs, ComponentTier } from "@pond/ui/docs";

function isTier(key: string): key is ComponentTier {
  return key in TIER_LABELS;
}

const TIERS = Object.keys(TIER_LABELS).filter(isTier);

export interface TierGroup {
  tier: ComponentTier;
  label: string;
  docs: ReadonlyArray<ComponentDocs>;
}

export function groupByTier(
  docs: ReadonlyArray<ComponentDocs> = COMPONENT_DOCS,
): Array<TierGroup> {
  return TIERS.map((tier) => ({
    tier,
    label: TIER_LABELS[tier],
    docs: docs.filter((entry) => entry.tier === tier),
  })).filter((group) => group.docs.length > 0);
}
