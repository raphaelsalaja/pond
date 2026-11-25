import { IconFolderDots, IconFolderOpen } from "@pond/icons";
import { useState } from "react";
import { IconMorph } from ".";
import { Button } from "../button";
import type { ComponentDocs } from "../shared/docs";

function FolderToggle() {
  const [open, setOpen] = useState(false);
  return (
    <Button
      icon
      variant="ghost"
      aria-label={open ? "Collapse" : "Expand"}
      onClick={() => setOpen((value) => !value)}
    >
      <IconMorph icon={open ? IconFolderOpen : IconFolderDots} />
    </Button>
  );
}

export const docs: ComponentDocs = {
  slug: "icon-morph",
  name: "Icon Morph",
  tier: "motion",
  summary:
    "Reshapes one glyph into another when its `icon` changes, so parts of the drawing move instead of crossfading.",
  parts: [
    {
      name: "IconMorph",
      description:
        "Takes any generated `@pond/icons` glyph. Shapes both glyphs share hold still, changed shapes travel point by point to their nearest match, and leftovers shrink or grow in place.",
    },
  ],
  keyboard: [],
  accessibility: [
    "Under reduced motion the glyphs fade without reshaping. While the page is hidden it switches at once.",
    "Glyphs without drawing data, or a line glyph changing to a solid one, switch at once.",
  ],
  examples: [{ name: "Folder", render: () => <FolderToggle /> }],
};
