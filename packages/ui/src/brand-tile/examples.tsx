import { Logo } from "../logo";
import type { ComponentDocs } from "../shared/docs";
import { BrandTile } from ".";

export const docs: ComponentDocs = {
  slug: "brand-tile",
  name: "Brand Tile",
  tier: "brand",
  summary: "A rounded, edged square that frames a source or app mark.",
  parts: [
    {
      name: "BrandTile",
      description:
        "The tile. Its child `<svg>` or `<img>` fills it edge to edge.",
    },
    {
      name: "size",
      description: "Width and height in pixels. Defaults to 36.",
    },
  ],
  keyboard: [],
  accessibility: [
    "Always `aria-hidden`. The tile is decorative, so whatever it frames is hidden too.",
    "Name the source in visible text beside the tile, or on the control that holds it.",
  ],
  examples: [
    {
      name: "Sizes",
      render: () => (
        <>
          <BrandTile size={16}>
            <Logo />
          </BrandTile>
          <BrandTile>
            <Logo />
          </BrandTile>
        </>
      ),
    },
  ],
};
