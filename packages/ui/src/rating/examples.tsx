import type { ComponentDocs } from "../shared/docs";
import { Rating } from ".";

function ignore(): void {}

export const docs: ComponentDocs = {
  slug: "rating",
  name: "Rating",
  tier: "form",
  summary: "Rates a save from one to five stars, or clears the rating.",
  parts: [
    {
      name: "value",
      description:
        "0 is unrated, 1 to 5 is the rating, `null` is mixed across several saves.",
    },
    { name: "size", description: "sm or md" },
  ],
  keyboard: [
    {
      keys: "Arrow keys",
      action: "Move to and pick the next or previous star",
    },
    { keys: "Home / End", action: "Pick one star or five stars" },
    { keys: "1 to 5", action: "Pick that many stars" },
    { keys: "Backspace / Delete / 0", action: "Clears the rating" },
  ],
  accessibility: [
    'A `role="radiogroup"` named Rating, with one radio per star.',
    'A mixed value is named "Rating, multiple values" and checks no star.',
    "Clicking the chosen star again clears the rating.",
    "Clicking a star leaves focus where it was. Tab reaches the stars for keyboard rating.",
  ],
  examples: [
    {
      name: "Unrated",
      render: () => <Rating value={0} onValueChange={ignore} />,
    },
    {
      name: "Rated",
      render: () => <Rating value={3} onValueChange={ignore} />,
    },
    {
      name: "Mixed",
      render: () => <Rating value={null} onValueChange={ignore} />,
    },
    {
      name: "Small",
      render: () => <Rating size="sm" value={4} onValueChange={ignore} />,
    },
  ],
};
