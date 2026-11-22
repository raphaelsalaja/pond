import { IconFolderDots } from "@pond/icons";
import { Button } from "../button";
import type { ComponentDocs } from "../shared/docs";
import { Swap } from ".";

export const docs: ComponentDocs = {
  slug: "swap",
  name: "Swap",
  tier: "motion",
  summary:
    "Crossfades between two pieces of content in the same spot when its `value` changes.",
  parts: [
    {
      name: "Swap",
      description:
        "Keys its children by `value`. A new `value` fades the old content up and out and the new content in. `variant=\"icon\"` scales and blurs glyphs through each other instead.",
    },
  ],
  keyboard: [],
  accessibility: [
    "The outgoing content is `inert` while it fades, so only the new content can take focus.",
    "Under reduced motion the content fades without moving or blurring. While the page is hidden it switches at once.",
  ],
  examples: [
    {
      name: "Button Label",
      render: () => (
        <Button variant="secondary">
          <Swap value="copy">Copy Link</Swap>
        </Button>
      ),
    },
    {
      name: "Icon",
      render: () => (
        <Swap value="closed" variant="icon">
          <IconFolderDots />
        </Swap>
      ),
    },
    {
      name: "Count",
      render: () => (
        <p>
          <Swap value={128}>128 saves</Swap>
        </p>
      ),
    },
  ],
};
