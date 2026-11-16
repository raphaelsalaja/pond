import type { TreeItemData, TreeProps } from "@ui-sdk/react/tree";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { Sidebar } from ".";

const folders: TreeItemData[] = [
  { value: "inbox", label: "Inbox" },
  {
    value: "design",
    label: "Design",
    children: [
      { value: "design/typography", label: "Typography" },
      { value: "design/color", label: "Color" },
    ],
  },
  { value: "archive", label: "Archive" },
];

function Rows({ items }: { items: TreeItemData[] }) {
  return items.map((item) => (
    <Sidebar.TreeItem key={item.value} value={item.value}>
      <Sidebar.TreeRow>
        <Sidebar.TreeIndicator />
        <Sidebar.ItemLabel>{item.label}</Sidebar.ItemLabel>
      </Sidebar.TreeRow>
      {item.children ? (
        <Sidebar.TreeGroup>
          <Rows items={item.children} />
        </Sidebar.TreeGroup>
      ) : null}
    </Sidebar.TreeItem>
  ));
}

function Folders(props: Partial<TreeProps>) {
  return (
    <>
      <button type="button">Before</button>
      <Sidebar.Tree aria-label="Folders" items={folders} {...props}>
        <Rows items={folders} />
      </Sidebar.Tree>
      <button type="button">After</button>
    </>
  );
}

async function mount(ui: React.ReactNode) {
  const screen = await render(ui);
  const item = (name: string) =>
    screen.getByRole("treeitem", { name, exact: true });
  const has = (name: string, attribute: string, value?: string) =>
    expect.element(item(name)).toHaveAttribute(attribute, value);
  return { screen, item, has };
}

async function enterTree(screen: Awaited<ReturnType<typeof render>>) {
  await userEvent.click(screen.getByRole("button", { name: "Before" }));
  await userEvent.tab();
}

describe("Sidebar.Tree keyboard", () => {
  it("is one tab stop that enters on the first row", async () => {
    const { screen, item } = await mount(<Folders />);
    await enterTree(screen);
    await expect.element(item("Inbox")).toHaveFocus();

    await userEvent.tab();
    await expect
      .element(screen.getByRole("button", { name: "After" }))
      .toHaveFocus();
  });

  it("moves between visible rows with Up, Down, Home and End", async () => {
    const { screen, item } = await mount(<Folders />);
    await enterTree(screen);

    await userEvent.keyboard("{ArrowDown}");
    await expect.element(item("Design")).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    await expect.element(item("Archive")).toHaveFocus();
    await userEvent.keyboard("{ArrowUp}");
    await expect.element(item("Design")).toHaveFocus();
    await userEvent.keyboard("{End}");
    await expect.element(item("Archive")).toHaveFocus();
    await userEvent.keyboard("{Home}");
    await expect.element(item("Inbox")).toHaveFocus();
  });

  it("expands with Right, then enters the first child", async () => {
    const { screen, item, has } = await mount(<Folders />);
    await enterTree(screen);

    await userEvent.keyboard("{ArrowRight}");
    await expect.element(item("Inbox")).toHaveFocus();

    await userEvent.keyboard("{ArrowDown}");
    await has("Design", "aria-expanded", "false");
    await userEvent.keyboard("{ArrowRight}");
    await has("Design", "aria-expanded", "true");
    await expect.element(item("Design")).toHaveFocus();

    await userEvent.keyboard("{ArrowRight}");
    await expect.element(item("Typography")).toHaveFocus();
  });

  it("moves to the parent with Left, then collapses it", async () => {
    const { screen, item, has } = await mount(
      <Folders defaultExpanded={["design"]} />,
    );
    await enterTree(screen);
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    await expect.element(item("Typography")).toHaveFocus();

    await userEvent.keyboard("{ArrowLeft}");
    await expect.element(item("Design")).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}");
    await has("Design", "aria-expanded", "false");
    await expect.element(item("Typography")).not.toBeInTheDocument();
  });

  it("moves to the next row that starts with the typed text", async () => {
    const { screen, item } = await mount(
      <Folders defaultExpanded={["design"]} />,
    );
    await enterTree(screen);

    await userEvent.keyboard("co");
    await expect.element(item("Color")).toHaveFocus();
  });

  it("selects with Space and Enter, and runs the action on Enter", async () => {
    const onAction = vi.fn();
    const { screen, item, has } = await mount(<Folders onAction={onAction} />);
    await enterTree(screen);

    await userEvent.keyboard("{ArrowDown} ");
    await has("Design", "aria-selected", "true");
    expect(onAction).not.toHaveBeenCalled();

    await userEvent.keyboard("{ArrowDown}{Enter}");
    await has("Archive", "aria-selected", "true");
    await expect
      .element(item("Design"))
      .not.toHaveAttribute("aria-selected", "true");
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith("archive", expect.anything());
  });
});

describe("Sidebar.Tree state", () => {
  it("reports level, expansion and selection, and tabs into the selected row", async () => {
    const { screen, item, has } = await mount(
      <Folders defaultExpanded={["design"]} defaultValue="design/color" />,
    );
    await has("Design", "aria-level", "1");
    await has("Design", "aria-expanded", "true");
    await has("Color", "aria-level", "2");
    await has("Color", "aria-selected", "true");
    await expect.element(item("Inbox")).not.toHaveAttribute("aria-expanded");
    await expect
      .element(item("Inbox"))
      .not.toHaveAttribute("aria-selected", "true");

    await enterTree(screen);
    await expect.element(item("Color")).toHaveFocus();
  });

  it("follows controlled expanded and selected state", async () => {
    function Controlled() {
      const [expanded, setExpanded] = useState<string[]>([]);
      const [value, setValue] = useState<string | null>(null);
      return (
        <>
          <button type="button" onClick={() => setExpanded(["design"])}>
            Open Design
          </button>
          <button type="button" onClick={() => setValue("design/typography")}>
            Select Typography
          </button>
          <Folders
            expanded={expanded}
            onExpandedChange={setExpanded}
            value={value}
            onValueChange={setValue}
          />
          <output aria-label="Selection">{value ?? "None"}</output>
        </>
      );
    }
    const { screen, item, has } = await mount(<Controlled />);
    await expect.element(item("Typography")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Open Design" }));
    await has("Design", "aria-expanded", "true");
    await userEvent.click(
      screen.getByRole("button", { name: "Select Typography" }),
    );
    await has("Typography", "aria-selected", "true");

    await userEvent.click(item("Inbox"));
    await expect
      .element(screen.getByRole("status", { name: "Selection" }))
      .toHaveTextContent("inbox");

    await userEvent.keyboard("{ArrowDown}{ArrowLeft}");
    await has("Design", "aria-expanded", "false");
    await expect.element(item("Typography")).not.toBeInTheDocument();
  });

  it("keeps the owner's value when it ignores a change", async () => {
    const onValueChange = vi.fn();
    const { item, has } = await mount(
      <Folders value="inbox" onValueChange={onValueChange} />,
    );

    await userEvent.click(item("Archive"));
    expect(onValueChange).toHaveBeenCalledWith("archive", expect.anything());
    await has("Inbox", "aria-selected", "true");
    await expect
      .element(item("Archive"))
      .not.toHaveAttribute("aria-selected", "true");
  });

  it("does not expand a branch when its row is pressed", async () => {
    const { item, has } = await mount(<Folders />);
    await userEvent.click(item("Design"));
    await has("Design", "aria-selected", "true");
    await has("Design", "aria-expanded", "false");
  });
});

describe("Sidebar.TreeItem slots", () => {
  it("puts the caller's ref, attributes and key listener on the item", async () => {
    let node: HTMLDivElement | null = null;
    const onKey = vi.fn();
    const { item, has } = await mount(
      <Sidebar.Tree aria-label="Folders">
        <Sidebar.TreeItem
          value="inbox"
          data-droppable="inbox"
          ref={(element) => {
            node = element;
          }}
          onKeyDown={(event) => onKey(event.key)}
        >
          <Sidebar.TreeRow>
            {(state) => (
              <Sidebar.ItemLabel data-state={state.selected ? "on" : "off"}>
                Inbox
              </Sidebar.ItemLabel>
            )}
          </Sidebar.TreeRow>
        </Sidebar.TreeItem>
        <Sidebar.TreeItem value="archive">
          <Sidebar.TreeRow>
            <Sidebar.ItemLabel>Archive</Sidebar.ItemLabel>
          </Sidebar.TreeRow>
        </Sidebar.TreeItem>
      </Sidebar.Tree>,
    );

    await has("Inbox", "data-droppable", "inbox");
    expect(node).toBe(item("Inbox").element());

    await userEvent.click(item("Inbox"));
    await expect
      .element(item("Inbox").getByText("Inbox"))
      .toHaveAttribute("data-state", "on");

    await userEvent.keyboard("{F2}{ArrowDown}");
    expect(onKey).toHaveBeenCalledWith("F2");
    await expect.element(item("Archive")).toHaveFocus();
  });

  it("lets a caller's handler claim a key before the tree does", async () => {
    const { item } = await mount(
      <Sidebar.Tree aria-label="Folders">
        <Sidebar.TreeItem
          value="inbox"
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") event.preventDefault();
          }}
        >
          <Sidebar.TreeRow>
            <Sidebar.ItemLabel>Inbox</Sidebar.ItemLabel>
          </Sidebar.TreeRow>
        </Sidebar.TreeItem>
        <Sidebar.TreeItem value="archive">
          <Sidebar.TreeRow>
            <Sidebar.ItemLabel>Archive</Sidebar.ItemLabel>
          </Sidebar.TreeRow>
        </Sidebar.TreeItem>
      </Sidebar.Tree>,
    );

    await userEvent.click(item("Inbox"));
    await userEvent.keyboard("{ArrowDown}");
    await expect.element(item("Inbox")).toHaveFocus();
  });

  it("runs Enter once on an item rendered as a native button", async () => {
    const onAction = vi.fn();
    const { item } = await mount(
      <Sidebar.Tree aria-label="Folders" onAction={onAction}>
        <Sidebar.TreeItem value="inbox" render={<button type="button" />}>
          <Sidebar.TreeRow>
            <Sidebar.ItemLabel>Inbox</Sidebar.ItemLabel>
          </Sidebar.TreeRow>
        </Sidebar.TreeItem>
      </Sidebar.Tree>,
    );

    await userEvent.click(item("Inbox"));
    onAction.mockClear();
    await userEvent.keyboard("{Enter}");
    await expect.element(item("Inbox")).toHaveFocus();
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
