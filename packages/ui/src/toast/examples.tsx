import { Button } from "../button";
import type { ComponentDocs } from "../shared/docs";
import { Toast } from ".";

function ToastList() {
  const { toasts } = Toast.useToastManager();
  return (
    <Toast.Portal>
      <Toast.Viewport>
        {toasts.map((toast) => (
          <Toast.Root key={toast.id} toast={toast}>
            <Toast.Content>
              <Toast.Header>
                <Toast.Title />
                <Toast.Description />
              </Toast.Header>
              <Toast.Close />
            </Toast.Content>
          </Toast.Root>
        ))}
      </Toast.Viewport>
    </Toast.Portal>
  );
}

function AddButton({
  children,
  priority,
}: {
  children: string;
  priority?: "low" | "high";
}) {
  const { add } = Toast.useToastManager();
  return (
    <Button
      variant="secondary"
      onClick={() =>
        add(
          priority === "high"
            ? {
                title: "Sync paused",
                description: "Reconnect Are.na to keep fetching saves.",
                priority,
              }
            : {
                title: "Link saved",
                description: "Find it in Inspiration.",
              },
        )
      }
    >
      {children}
    </Button>
  );
}

export const docs: ComponentDocs = {
  slug: "toast",
  name: "Toast",
  tier: "overlay",
  summary:
    "Confirms an action or reports a status in a stack at the corner of the window.",
  parts: [
    {
      name: "Toast.Provider",
      description:
        "Owns the toast queue. Pass `toastManager` to add toasts from outside React.",
    },
    {
      name: "Toast.Portal",
      description: "Moves the stack to the end of the document.",
    },
    {
      name: "Toast.Viewport",
      description: "The live region that holds the stack.",
    },
    {
      name: "Toast.Root",
      description:
        "One toast. Older toasts tuck behind the newest until you hover or focus the stack.",
    },
    {
      name: "Toast.Content",
      description: "Row for the icon, text and actions.",
    },
    {
      name: "Toast.Icon",
      description:
        "Leading icon, hidden from assistive tech. `tone` sets its color.",
    },
    {
      name: "Toast.Header",
      description: "Stacks the title, description and progress.",
    },
    {
      name: "Toast.Title",
      description: "Names the toast. Renders the toast's `title` when empty.",
    },
    {
      name: "Toast.Description",
      description: "Describes the toast. Renders its `description` when empty.",
    },
    {
      name: "Toast.Progress",
      description: "A native progress bar. Give it an `aria-label`.",
    },
    {
      name: "Toast.Meta",
      description: "Small secondary text under the description.",
    },
    {
      name: "Toast.Action",
      description: "A secondary button for one follow-up action.",
    },
    {
      name: "Toast.Actions",
      description:
        "Holds the buttons. Sits beside a one-line toast and under a description.",
    },
    { name: "Toast.Close", description: "Dismiss button labeled `Dismiss`." },
    {
      name: "Toast.useToastManager",
      description: "Reads the queue and adds, updates or closes toasts.",
    },
  ],
  keyboard: [
    { keys: "F6", action: "Moves focus to the toast stack and pauses timers" },
    { keys: "Tab", action: "Moves through toasts and their buttons" },
    { keys: "Shift+Tab", action: "Returns focus to where it was before F6" },
    { keys: "Escape", action: "Dismisses the focused toast" },
  ],
  accessibility: [
    'Base UI owns the live region: the viewport is `role="region"` named Notifications with `aria-live="polite"`.',
    'High-priority toasts are also read through a hidden `role="alert"` copy.',
    "Each toast is a non-modal `dialog`, or `alertdialog` when high priority, named by its title and described by its description.",
    "Timers pause while the stack is hovered or focused.",
    "Enter and exit transitions drop movement under reduced motion.",
  ],
  examples: [
    {
      name: "Polite",
      render: () => (
        <Toast.Provider>
          <AddButton>Save Link</AddButton>
          <ToastList />
        </Toast.Provider>
      ),
    },
    {
      name: "High Priority",
      render: () => (
        <Toast.Provider>
          <AddButton priority="high">Pause Sync</AddButton>
          <ToastList />
        </Toast.Provider>
      ),
    },
  ],
};
