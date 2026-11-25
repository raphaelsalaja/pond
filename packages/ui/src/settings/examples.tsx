import { Settings } from ".";
import { Button } from "../button";
import type { ComponentDocs } from "../shared/docs";
import { Switch } from "../switch";

function SyncSection() {
  return (
    <Settings.Section>
      <Settings.SectionTitle>Sync</Settings.SectionTitle>
      <Settings.List>
        <Settings.Item>
          <Settings.ItemDetails>
            <Settings.ItemTitle>Fetch Sources on Launch</Settings.ItemTitle>
            <Settings.ItemDescription>
              Pond checks every source for new saves when it opens.
            </Settings.ItemDescription>
          </Settings.ItemDetails>
          <Settings.ItemControl>
            <Switch.Root aria-label="Fetch Sources on Launch" defaultChecked />
          </Settings.ItemControl>
        </Settings.Item>
        <Settings.Item disabled>
          <Settings.ItemDetails>
            <Settings.ItemTitle>Sync in Background</Settings.ItemTitle>
            <Settings.ItemDescription>
              Turn on Fetch Sources on Launch first.
            </Settings.ItemDescription>
          </Settings.ItemDetails>
          <Settings.ItemControl>
            <Switch.Root aria-label="Sync in Background" disabled />
          </Settings.ItemControl>
        </Settings.Item>
      </Settings.List>
    </Settings.Section>
  );
}

export const docs: ComponentDocs = {
  slug: "settings",
  name: "Settings",
  tier: "navigation",
  summary:
    "Lays out a settings page as titled sections of rows, each with its control on the right.",
  parts: [
    {
      name: "Settings.Page",
      description:
        "The centered column. `density` is default or compact; `inset` pads the header and section descriptions.",
    },
    {
      name: "Settings.Header",
      description:
        "The page header. Holds `HeaderText` with a `Title` (`h1`) and a `Description`.",
    },
    {
      name: "Settings.Columns",
      description:
        "Flows sections into two columns, then one when the page is narrow.",
    },
    {
      name: "Settings.Section",
      description: 'A titled group. `span="full"` crosses both columns.',
    },
    {
      name: "Settings.SectionTitle",
      description:
        "The section heading (`h2`). Pair it with `SectionDescription` and `SectionAction` inside `SectionDetails`.",
    },
    {
      name: "Settings.List",
      description: "The rounded surface that stacks rows with dividers.",
    },
    {
      name: "Settings.Item",
      description:
        "One setting row. `disabled` dims it; disable its control too.",
    },
    {
      name: "Settings.ItemDetails",
      description: "Holds the `ItemTitle` (`h3`) and `ItemDescription`.",
    },
    {
      name: "Settings.ItemControl",
      description: "The right-aligned slot for the control.",
    },
    {
      name: "Settings.Card",
      description:
        "A bordered row inside a list with `CardTitle`, `CardDescription`, `CardAction`, `CardContent` and `CardFooter`.",
    },
  ],
  keyboard: [],
  accessibility: [
    "Headings step from `h1` to `h3`, so the page outline matches the layout.",
    "A disabled row sets `aria-disabled` but can't disable its control. Pass `disabled` to the control as well.",
    "Name each control with a label or an `aria-label` that matches its row title.",
  ],
  examples: [
    {
      name: "Page",
      render: () => (
        <Settings.Page>
          <Settings.Header>
            <Settings.HeaderText>
              <Settings.Title>General</Settings.Title>
              <Settings.Description>
                These apply to every library on this Mac.
              </Settings.Description>
            </Settings.HeaderText>
          </Settings.Header>
          <SyncSection />
        </Settings.Page>
      ),
    },
    {
      name: "Compact",
      render: () => (
        <Settings.Page density="compact">
          <SyncSection />
        </Settings.Page>
      ),
    },
    {
      name: "Card",
      render: () => (
        <Settings.Page density="compact">
          <Settings.List>
            <Settings.Card>
              <Settings.CardTitle>Are.na</Settings.CardTitle>
              <Settings.CardDescription>Synced today</Settings.CardDescription>
              <Settings.CardAction>
                <Button size="sm" variant="secondary">
                  Sync Now
                </Button>
              </Settings.CardAction>
            </Settings.Card>
          </Settings.List>
        </Settings.Page>
      ),
    },
  ],
};
