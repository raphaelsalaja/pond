import { useState } from "react";
import { Window } from ".";
import { Button } from "../button";
import { cssVars } from "../css-vars";
import type { ComponentDocs } from "../shared/docs";

function PanesExample() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [sidebar, setSidebar] = useState(200);
  const [details, setDetails] = useState(220);
  return (
    <Window.Root
      leftOpen={sidebarOpen}
      rightOpen={detailsOpen}
      style={{
        ...cssVars({
          "--window-left-track": `${sidebar}px`,
          "--window-right-track": `${details}px`,
        }),
        height: 240,
      }}
    >
      <Window.Leading>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setSidebarOpen((open) => !open)}
        >
          Sidebar
        </Button>
      </Window.Leading>
      <Window.Left
        aria-label="Sidebar"
        minWidth={160}
        maxWidth={320}
        width={sidebar}
        onResize={setSidebar}
        onCollapse={() => setSidebarOpen(false)}
      >
        <Window.Body>Folders</Window.Body>
      </Window.Left>
      <Window.Center>
        <Window.Bar>Location</Window.Bar>
        <Window.Header>Page controls</Window.Header>
        <Window.Body>Content</Window.Body>
      </Window.Center>
      <Window.Right
        aria-label="Details"
        minWidth={180}
        maxWidth={320}
        width={details}
        resizeLabel="Resize Details"
        onResize={setDetails}
        onCollapse={() => setDetailsOpen(false)}
      >
        <Window.Body>Details</Window.Body>
      </Window.Right>
      <Window.Trailing>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setDetailsOpen((open) => !open)}
        >
          Details
        </Button>
      </Window.Trailing>
    </Window.Root>
  );
}

export const docs: ComponentDocs = {
  slug: "window",
  name: "Window",
  tier: "navigation",
  summary:
    "The app frame: a sidebar, the main content and a details column, each split into a bar, a header and a body that line up across the window. Opening a column pushes the content aside. Drag or use the keyboard on a column edge to resize it.",
  parts: [
    {
      name: "Root",
      description:
        "The grid. `leftOpen` and `rightOpen` control the columns, `--window-left-track` and `--window-right-track` set their widths, and `instant` skips the animation for one change.",
    },
    {
      name: "Leading",
      description:
        "Controls pinned to the top left. Spans the sidebar when it's open and stays in place when it closes.",
    },
    {
      name: "Trailing",
      description:
        "Controls pinned to the top right. Spans the details column when it's open.",
    },
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
    {
      name: "Bar",
      description:
        "The title bar row of a column. Drags the window. In Center it starts after Leading and ends before Trailing.",
    },
    {
      name: "Header",
      description:
        "The row under the bar, `--window-header-height` tall in every column. Collapses when it has no content.",
    },
    { name: "Body", description: "The rest of the column." },
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
