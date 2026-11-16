import axe from "axe-core";
import { expect } from "vitest";

/** Examples render outside a full page, so page-structure rules don't apply. */
const PAGE_RULES = {
  region: { enabled: false },
  "landmark-one-main": { enabled: false },
  "page-has-heading-one": { enabled: false },
} as const;

/** Popups fade in, and axe reads contrast mid-fade; looping animations never finish, so they're skipped. */
async function settled(): Promise<void> {
  await Promise.allSettled(
    document
      .getAnimations()
      .filter(
        (animation) =>
          animation.effect?.getComputedTiming().iterations !== Infinity,
      )
      .map((animation) => animation.finished),
  );
}

/** An ARIA tree item contains its expanded group, so its text runs past its name by design. */
function treeItemName(id: string, node: axe.NodeResult) {
  return (
    id === "label-content-name-mismatch" &&
    document.querySelector(node.target.join(" "))?.getAttribute("role") ===
      "treeitem"
  );
}

export async function expectAccessible(
  root: Element = document.body,
): Promise<void> {
  await settled();
  const { violations } = await axe.run(root, {
    resultTypes: ["violations"],
    rules: PAGE_RULES,
  });

  expect(
    violations.flatMap(({ id, nodes }) => {
      const targets = nodes
        .filter((node) => !treeItemName(id, node))
        .map((node) => node.target.join(" "));
      return targets.length > 0 ? [`${id}: ${targets.join(", ")}`] : [];
    }),
  ).toEqual([]);
}
