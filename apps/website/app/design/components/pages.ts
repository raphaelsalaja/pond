import { groupByTier } from "./tiers";

export interface Page {
  href: string;
  name: string;
}

export interface PageGroup {
  label: string;
  pages: readonly Page[];
}

export const INTRODUCTION: Page = { href: "/design", name: "Introduction" };

export const TOKENS: Page = { href: "/design/tokens", name: "Tokens" };

const ICONS: Page = { href: "/design/icons", name: "Icons" };

const FOUNDATIONS = [
  { id: "color", name: "Color" },
  { id: "palette", name: "Palette" },
  { id: "typography", name: "Typography" },
  { id: "spacing", name: "Spacing" },
  { id: "height", name: "Height" },
  { id: "radius", name: "Radius" },
  { id: "shadow", name: "Shadow" },
  { id: "focus", name: "Focus" },
  { id: "motion", name: "Motion" },
] as const;

const componentGroups = (): PageGroup[] =>
  groupByTier().map((group) => ({
    label: group.label,
    pages: group.docs.map((docs) => ({
      href: `/design/${docs.slug}`,
      name: docs.name,
    })),
  }));

export function pageGroups(): PageGroup[] {
  return [
    {
      label: "Foundations",
      pages: [
        ...FOUNDATIONS.map((foundation) => ({
          href: `${TOKENS.href}#${foundation.id}`,
          name: foundation.name,
        })),
        ICONS,
      ],
    },
    ...componentGroups(),
  ];
}

/** Foundations are sections of one page, so the walk passes through Tokens once. */
function pageOrder(): Page[] {
  return [
    INTRODUCTION,
    TOKENS,
    ICONS,
    ...componentGroups().flatMap((group) => group.pages),
  ];
}

/** Pages scroll inside the panel, so links skip Next's window scroll and a same-page hash lands here. */
export function reveal(href: string) {
  const [path, id] = href.split("#");
  if (!id || path !== window.location.pathname) return;
  document.getElementById(id)?.scrollIntoView();
}

export function neighbors(href: string): {
  previous: Page | undefined;
  next: Page | undefined;
} {
  const order = pageOrder();
  const index = order.findIndex((page) => page.href === href);
  if (index === -1) return { previous: undefined, next: undefined };
  return { previous: order[index - 1], next: order[index + 1] };
}
