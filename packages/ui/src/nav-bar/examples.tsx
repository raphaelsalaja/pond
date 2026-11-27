import { NavBar } from ".";
import { Button } from "../button";
import { Logo } from "../logo";
import type { ComponentDocs } from "../shared/docs";

export const docs: ComponentDocs = {
  slug: "nav-bar",
  name: "Nav Bar",
  tier: "navigation",
  summary:
    "The website's main links in one bar across the top: Pond's name on the left, the pages centred, and an action like Download on the right.",
  parts: [
    {
      name: "NavBar.Root",
      description:
        "The `nav` landmark, through UI SDK's Navigation Menu. Name it with `aria-label`.",
    },
    {
      name: "NavBar.Brand",
      description: "A link home that holds the logo and name.",
    },
    {
      name: "NavBar.List",
      description: "The list of page links.",
    },
    {
      name: "NavBar.Link",
      description:
        "One page link. `current` marks the page you're on with `aria-current`. `render` swaps in a router's link.",
    },
    {
      name: "NavBar.Actions",
      description: "Buttons on the right of the bar, like Download.",
    },
  ],
  keyboard: [
    {
      keys: "Tab",
      action: "Moves through the brand, each link and the actions in order",
    },
    {
      keys: "Left / Right",
      action: "Moves between the links in the list",
    },
    { keys: "Home / End", action: "Moves to the first or last link" },
    { keys: "Enter", action: "Follows the focused link" },
  ],
  accessibility: [
    "Follows the disclosure navigation pattern through UI SDK: a named `nav` landmark with a list of ordinary links.",
    'The current page\'s link has `aria-current="page"`.',
    "Every link stays a Tab stop, so the bar reads like any other links on the page.",
  ],
  examples: [
    {
      name: "Website",
      render: () => (
        <NavBar.Root aria-label="Main">
          <NavBar.Brand href="#home">
            <Logo size={16} aria-hidden />
            Pond
          </NavBar.Brand>
          <NavBar.List>
            <NavBar.Link href="#features" current>
              Features
            </NavBar.Link>
            <NavBar.Link href="#developers">Developers</NavBar.Link>
            <NavBar.Link href="#changelog">Changelog</NavBar.Link>
          </NavBar.List>
          <NavBar.Actions>
            <Button size="sm">Download</Button>
          </NavBar.Actions>
        </NavBar.Root>
      ),
    },
    {
      name: "Links Only",
      render: () => (
        <NavBar.Root aria-label="Docs">
          <NavBar.List>
            <NavBar.Link href="#guides" current>
              Guides
            </NavBar.Link>
            <NavBar.Link href="#reference">Reference</NavBar.Link>
          </NavBar.List>
        </NavBar.Root>
      ),
    },
  ],
};
