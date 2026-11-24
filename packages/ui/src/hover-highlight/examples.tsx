import type { ComponentDocs } from "../shared/docs";
import { HoverHighlight } from ".";

const ROWS = ["Design", "Reading", "Recipes"];

export const docs: ComponentDocs = {
  slug: "hover-highlight",
  name: "Hover Highlight",
  tier: "motion",
  summary:
    "One fill that slides between the rows of a list as the pointer moves, the way table and sidebar rows hover.",
  parts: [
    {
      name: "data-hover-row",
      description:
        "Marks a row the highlight can land on. A row that wraps another row widens the hover area, and the fill sits on the inner one.",
    },
    {
      name: "render",
      description:
        "Swaps the element, such as `<li />` when the highlight sits inside a list.",
    },
    {
      name: "--hover-highlight-inset",
      description:
        "Insets the fill from the top and bottom of the row, so flush rows keep a seam.",
    },
    {
      name: "--hover-highlight-fill",
      description: "Sets the fill color. Defaults to `--ds-surface-primary`.",
    },
  ],
  keyboard: [],
  accessibility: [
    "The highlight is hidden from assistive technology. Keyboard focus keeps its own ring.",
    "It follows the mouse and pen only, and under reduced motion it fades instead of sliding.",
  ],
  examples: [
    {
      name: "List",
      render: () => (
        <ul
          style={{
            position: "relative",
            isolation: "isolate",
            width: 240,
            padding: 0,
            margin: 0,
            listStyle: "none",
          }}
        >
          {ROWS.map((row) => (
            <li
              key={row}
              data-hover-row=""
              style={{ padding: "6px 8px", borderRadius: 8 }}
            >
              {row}
            </li>
          ))}
          <HoverHighlight render={<li />} />
        </ul>
      ),
    },
  ],
};
