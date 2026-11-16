import { useState } from "react";
import { Button } from "../button";
import { cssVars } from "../css-vars";
import type { ComponentDocs } from "../shared/docs";
import { Window } from ".";

function PanesExample() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebar, setSidebar] = useState(200);
  const [details, setDetails] = useState(220);
  return (
    <Window.Root
      leftOpen={sidebarOpen}
      rightOpen
      style={{
        ...cssVars({
          "--window-left-track": `${sidebar}px`,
          "--window-right-track": `${details}px`,
        }),
        height: 240,
      }}
    >
      <Window.Left
        aria-label="Sidebar"
        open={sidebarOpen}
        minWidth={160}
        maxWidth={320}
        width={sidebar}
        onResize={setSidebar}
        onCollapse={() => setSidebarOpen(false)}
      >
        Sidebar
      </Window.Left>
      <Window.Center>
        {sidebarOpen ? (
          "Content"
        ) : (
          <Button variant="secondary" onClick={() => setSidebarOpen(true)}>
            Show Sidebar
          </Button>
        )}
      </Window.Center>
      <Window.Right
        aria-label="Details"
        minWidth={180}
        maxWidth={320}
        width={details}
        resizeLabel="Resize Details"
        onResize={setDetails}
      >
        Details
      </Window.Right>
    </Window.Root>
  );
}

export const docs: ComponentDocs = {
  slug: "window",
  name: "Window",
  tier: "navigation",
  summary:
    "The app frame: a top bar, a sidebar, the main content, a details column and a bottom bar. Drag or use the keyboard on a column edge to resize it.",
  parts: [
    {
      name: "Root",
      description:
        "The grid. `leftOpen` and `rightOpen` control the columns, and `--window-left-track` and `--window-right-track` set their widths.",
    },
    { name: "Top", description: "The title bar row. Drags the window." },
    {
      name: "Left",
      description:
        "The sidebar column. Takes `minWidth`, `maxWidth`, `width` or `defaultWidth`, `onResize` and `onCollapse`.",
    },
    {
      name: "Center",
      description: "The main content. Takes focus when a column collapses.",
    },
    {
      name: "Right",
      description:
        "The details column. Same sizing props as Left. Name its edge with `resizeLabel`.",
    },
    { name: "Bottom", description: "A bar under the three columns." },
  ],
  keyboard: [
    {
      keys: "ArrowLeft / ArrowRight",
      action: "Moves the focused column edge by 10 pixels",
    },
    {
      keys: "Shift + ArrowLeft / ArrowRight",
      action: "Moves the edge by 40 pixels",
    },
    { keys: "Home", action: "Shrinks the column to its minimum width" },
    { keys: "End", action: "Grows the column to its maximum width" },
    {
      keys: "Enter",
      action: "Collapses the column and moves focus to the content",
    },
  ],
  accessibility: [
    "Each column edge is a focusable `separator` with `aria-orientation`, `aria-controls` pointing at its column, and the width in `aria-valuenow`.",
    "The edge is named with `resizeLabel`, or Resize Sidebar and Resize Panel by default.",
    "A closed column is `inert` and hidden from screen readers.",
  ],
  examples: [{ name: "Panes", render: () => <PanesExample /> }],
};
