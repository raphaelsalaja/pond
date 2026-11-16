import type { ComponentDocs } from "../shared/docs";
import { Logo } from ".";

export const docs: ComponentDocs = {
  slug: "logo",
  name: "Logo",
  tier: "brand",
  summary: "The Pond mark as one scalable glyph in the current text color.",
  parts: [
    {
      name: "size",
      description:
        "Width and height in pixels or any CSS length. Defaults to 18.",
    },
    {
      name: "LOGO_PATH",
      description: "The mark's path data, for drawing it outside React.",
    },
    {
      name: "LOGO_VIEW_BOX",
      description: "The square view box the path is drawn in.",
    },
  ],
  keyboard: [],
  accessibility: [
    'Renders `role="img"` named "Pond".',
    "Pass `aria-hidden` when visible text beside it already says Pond.",
  ],
  examples: [
    {
      name: "Sizes",
      render: () => (
        <>
          <Logo size={12} />
          <Logo />
          <Logo size={32} />
        </>
      ),
    },
  ],
};
