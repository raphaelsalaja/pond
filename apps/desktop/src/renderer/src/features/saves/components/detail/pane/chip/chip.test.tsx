import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { AssignmentChip } from "./";
import styles from "./styles.module.css";

it("exposes the full nested folder path while showing the breadcrumb", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const remove = vi.fn();
  try {
    await act(async () =>
      root.render(
        <AssignmentChip.List>
          <AssignmentChip.Item
            label="Design"
            crumb="Knowledge Base"
            count={1}
            total={1}
            removeLabel="Remove folder Knowledge Base / Design"
            onRemove={remove}
          />
        </AssignmentChip.List>,
      ),
    );

    const label = host.querySelector(`.${styles.label}`);
    expect(label?.getAttribute("title")).toBe("Knowledge Base › Design");
    expect(label?.querySelector(`.${styles.crumb}`)?.textContent).toBe(
      "Knowledge Base",
    );
    expect(label?.querySelector(`.${styles.separator}`)?.textContent).toBe("›");
    expect(label?.querySelector(`.${styles.name}`)?.textContent).toBe("Design");
    expect(
      host.querySelector(
        '[aria-label="Remove folder Knowledge Base / Design"]',
      ),
    ).not.toBeNull();

    await act(async () =>
      root.render(
        <AssignmentChip.Item
          label="Design"
          crumb="Knowledge Base"
          title="Knowledge Base / Design"
          count={1}
          total={1}
          removeLabel="Remove folder Knowledge Base / Design"
          onRemove={remove}
        />,
      ),
    );
    expect(host.querySelector(`.${styles.label}`)?.getAttribute("title")).toBe(
      "Knowledge Base / Design",
    );
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
