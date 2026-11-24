import { Button } from "../button";
import type { ComponentDocs } from "../shared/docs";
import { ProgressiveBlur } from ".";

const ROWS = Array.from({ length: 12 }, (_, i) => `Save ${i + 1}`);

export const docs: ComponentDocs = {
  slug: "progressive-blur",
  name: "ProgressiveBlur",
  tier: "motion",
  summary:
    "Blurs and fades content into a bar it scrolls under, measured from the iOS 27 soft scroll edge.",
  parts: [
    {
      name: "ProgressiveBlur",
      description:
        "An empty layer. Position it beside the scroller, over the edge it should soften.",
    },
  ],
  keyboard: [],
  accessibility: [
    "Renders an empty `<div>` with `aria-hidden` and no pointer events.",
    "Content under the edge stays in the accessibility tree and stays clickable.",
  ],
  examples: [
    {
      name: "Top Edge",
      render: () => (
        <div style={{ position: "relative", height: 200, overflow: "hidden" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "start",
              height: "100%",
              overflowY: "auto",
            }}
          >
            {ROWS.map((row) => (
              <Button key={row} variant="ghost">
                {row}
              </Button>
            ))}
          </div>
          <ProgressiveBlur
            side="top"
            style={{ position: "absolute", inset: "0 0 auto", height: 48 }}
          />
        </div>
      ),
    },
  ],
};
