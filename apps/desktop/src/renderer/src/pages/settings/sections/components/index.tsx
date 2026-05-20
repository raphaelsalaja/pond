import {
  IconCheck3Outline12,
  IconChevronExpandYOutline12,
} from "@pond/icons/outline/12";
import {
  IconTextItalicOutline18,
  IconXmarkOutline18,
} from "@pond/icons/outline/18";
import {
  AlertDialog,
  Avatar,
  Button,
  Collapsible,
  Dialog,
  Field,
  Input,
  Menu,
  NumberField,
  Popover,
  Select,
  Separator,
  Switch,
  Tooltip,
  useToast,
} from "@pond/ui";
import type { ReactNode } from "react";
import { useState } from "react";
import { Settings } from "@/components/settings";
import styles from "./styles.module.css";

interface CellProps {
  label: string;
  children: ReactNode;
}

function Cell({ label, children }: CellProps) {
  return (
    <div className={styles.cell}>
      <span className={styles["cell-label"]}>{label}</span>
      <div className={styles["cell-preview"]}>
        <div className={styles.stack}>{children}</div>
      </div>
    </div>
  );
}

export function ComponentsSection() {
  const [switchOn, setSwitchOn] = useState(true);
  const toast = useToast();

  return (
    <Settings.Page width="wide">
      <Settings.Header>
        <Settings.Title>Components</Settings.Title>
        <Settings.Description>
          Pond design system for building consistent experiences.
        </Settings.Description>
      </Settings.Header>

      <div className={styles.grid}>
        <Cell label="Alert Dialog">
          <AlertDialog.Root>
            <AlertDialog.Trigger
              render={
                <Button size="sm" variant="danger">
                  Delete…
                </Button>
              }
            />
            <AlertDialog.Content>
              <AlertDialog.Title>Are you sure?</AlertDialog.Title>
              <AlertDialog.Description>
                This action can't be undone. The item will be moved to the
                trash.
              </AlertDialog.Description>
              <AlertDialog.Actions>
                <AlertDialog.Close
                  render={
                    <Button size="sm" variant="ghost">
                      Cancel
                    </Button>
                  }
                />
                <AlertDialog.Close
                  render={
                    <Button size="sm" variant="danger">
                      Delete
                    </Button>
                  }
                />
              </AlertDialog.Actions>
            </AlertDialog.Content>
          </AlertDialog.Root>
        </Cell>

        <Cell label="Avatar">
          <div className={styles.row}>
            <Avatar.Root>
              <Avatar.Fallback>RS</Avatar.Fallback>
            </Avatar.Root>
            <Avatar.Root>
              <Avatar.Fallback>JM</Avatar.Fallback>
            </Avatar.Root>
            <Avatar.Root>
              <Avatar.Fallback>AK</Avatar.Fallback>
            </Avatar.Root>
          </div>
        </Cell>

        <Cell label="Button">
          <Button variant="primary">Submit</Button>
          <Button variant="secondary">Submit</Button>
          <Button variant="tertiary">Submit</Button>
          <Button variant="danger">Submit</Button>
          <Button variant="accent">Submit</Button>
          <Button icon variant="primary">
            <IconXmarkOutline18 />
          </Button>
        </Cell>

        <Cell label="Collapsible">
          <Collapsible.Root defaultOpen={false} className={styles.collapsible}>
            <Collapsible.Trigger>Show details</Collapsible.Trigger>
            <Collapsible.Panel>
              <div className={styles["collapsible-body"]}>
                Anything tucked behind a disclosure triangle.
              </div>
            </Collapsible.Panel>
          </Collapsible.Root>
        </Cell>

        <Cell label="Dialog">
          <Dialog.Root>
            <Dialog.Trigger render={<Button size="sm">Click me!</Button>} />
            <Dialog.Content>
              <Dialog.Title>Sample dialog</Dialog.Title>
              <Dialog.Description>
                Dialogs trap focus and dim the rest of the app while open.
              </Dialog.Description>
              <div
                style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}
              >
                <Dialog.Close render={<Button size="sm">Close</Button>} />
              </div>
            </Dialog.Content>
          </Dialog.Root>
        </Cell>

        <Cell label="Dropdown">
          <Menu.Root>
            <Menu.Trigger render={<Button size="sm">Open menu</Button>} />
            <Menu.Portal>
              <Menu.Positioner>
                <Menu.Popup>
                  <Menu.Item>
                    <Menu.ItemLabel>Profile</Menu.ItemLabel>
                    <Menu.ItemKbd>⌘P</Menu.ItemKbd>
                  </Menu.Item>
                  <Menu.Item>
                    <Menu.ItemLabel>Settings</Menu.ItemLabel>
                    <Menu.ItemKbd>⌘,</Menu.ItemKbd>
                  </Menu.Item>
                  <Menu.Separator />
                  <Menu.Item>
                    <Menu.ItemLabel>Sign out</Menu.ItemLabel>
                  </Menu.Item>
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        </Cell>

        <Cell label="Field">
          <Field.Root validationMode="onChange">
            <Field.Label>Email</Field.Label>
            <Field.Control
              required
              type="email"
              placeholder="you@example.com"
            />
            <Field.Description>We'll never share your email</Field.Description>
            <Field.Error />
          </Field.Root>
        </Cell>

        <Cell label="Input">
          <Input placeholder="Find..." />
        </Cell>

        <Cell label="Notification">
          <Button
            size="sm"
            onClick={async () => {
              const result = await window.pond.notifications.show({
                title: "Pond",
                body: "This is a native notification from your OS.",
              });
              if (!result.ok) {
                toast.add({
                  title: "Notifications unavailable",
                  description:
                    result.reason === "unsupported"
                      ? "Your OS doesn't support notifications, or pond doesn't have permission yet."
                      : "Invalid notification payload.",
                  type: "warning",
                });
              }
            }}
          >
            Show notification
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              void window.pond.notifications.show({
                title: "Saved from Reddit",
                body: "u/raphaelsalaja just shared a thread.",
                silent: true,
              })
            }
          >
            Show silent
          </Button>
        </Cell>

        <Cell label="Number Field">
          <NumberField.Root defaultValue={1}>
            <NumberField.Decrement />
            <NumberField.Input />
            <NumberField.Increment />
          </NumberField.Root>
        </Cell>

        <Cell label="Popover">
          <Popover.Root>
            <Popover.Trigger render={<Button size="sm">Open popover</Button>} />
            <Popover.Content>
              <div style={{ padding: 12, maxWidth: 220 }}>
                <div style={{ fontSize: 13, fontWeight: 550, marginBottom: 4 }}>
                  Popover
                </div>
                <div style={{ fontSize: 12, color: "var(--ds-gray-11)" }}>
                  Free-form content anchored to the trigger.
                </div>
              </div>
            </Popover.Content>
          </Popover.Root>
        </Cell>

        <Cell label="Select">
          <Select.Root>
            <Select.Label>Theme</Select.Label>
            <Select.Trigger>
              <Select.Value placeholder="Select..." />
              <Select.Icon>
                <IconChevronExpandYOutline12 />
              </Select.Icon>
            </Select.Trigger>
            <Select.Portal>
              <Select.Backdrop />
              <Select.Positioner sideOffset={6}>
                <Select.Popup>
                  <Select.List>
                    <Select.Item value="Dawn">
                      <Select.ItemText>Dawn</Select.ItemText>
                      <Select.ItemIndicator>
                        <IconCheck3Outline12 />
                      </Select.ItemIndicator>
                    </Select.Item>
                    <Select.Item value="Paper">
                      <Select.ItemText>Paper</Select.ItemText>
                      <Select.ItemIndicator>
                        <IconCheck3Outline12 />
                      </Select.ItemIndicator>
                    </Select.Item>
                    <Select.Item value="Dusk">
                      <Select.ItemText>Dusk</Select.ItemText>
                      <Select.ItemIndicator>
                        <IconCheck3Outline12 />
                      </Select.ItemIndicator>
                    </Select.Item>
                    <Select.Item value="Ink">
                      <Select.ItemText>Ink</Select.ItemText>
                      <Select.ItemIndicator>
                        <IconCheck3Outline12 />
                      </Select.ItemIndicator>
                    </Select.Item>
                  </Select.List>
                  <Select.Arrow />
                </Select.Popup>
              </Select.Positioner>
            </Select.Portal>
          </Select.Root>
        </Cell>

        <Cell label="Separator">
          <div className={styles["separator-demo"]}>
            <span>Above</span>
            <Separator.Root orientation="horizontal" />
            <span>Below</span>
          </div>
        </Cell>

        <Cell label="Suggestion Toast">
          <Button
            size="sm"
            onClick={async () => {
              const result = await window.pond.suggestions.notify({
                key: `components-demo-${Date.now()}`,
                title: "10 saves haven't been touched in a while",
                body: "Pond can tidy them up for you.\nYou can always reopen them from Trash.",
                icons: [
                  "https://www.google.com/s2/favicons?domain=reddit.com&sz=64",
                  "https://www.google.com/s2/favicons?domain=youtube.com&sz=64",
                  "https://www.google.com/s2/favicons?domain=notion.so&sz=64",
                  "https://www.google.com/s2/favicons?domain=linear.app&sz=64",
                ],
                actions: [
                  {
                    id: "dismiss",
                    label: "Not Now",
                    shortcut: "esc",
                    variant: "ghost",
                  },
                  {
                    id: "once",
                    label: "Clean Up Once",
                    variant: "secondary",
                  },
                  {
                    id: "daily",
                    label: "Clean Up Daily",
                    shortcut: "enter",
                    variant: "primary",
                  },
                ],
                autoDismissMs: 0,
              });
              toast.add({
                title: "Suggestion outcome",
                description: result.outcome,
                type:
                  result.outcome === "dismissed" ||
                  result.outcome === "timed_out"
                    ? "info"
                    : "success",
              });
            }}
          >
            Show suggestion
          </Button>
        </Cell>

        <Cell label="Switch">
          <Switch.Root checked={switchOn} onCheckedChange={setSwitchOn} />
        </Cell>

        <Cell label="Toast">
          <Button
            size="sm"
            onClick={() =>
              toast.add({
                title: "Saved",
                description: "Your changes have been written to disk.",
                type: "success",
              })
            }
          >
            Show success
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              toast.add({
                title: "Heads up",
                description: "Sync paused while offline.",
                type: "warning",
              })
            }
          >
            Show warning
          </Button>
        </Cell>

        <Cell label="Tooltip">
          <Tooltip.Root open>
            <Tooltip.Trigger
              render={
                <Button icon size="sm">
                  <IconTextItalicOutline18 />
                </Button>
              }
            />
            <Tooltip.Portal>
              <Tooltip.Positioner>
                <Tooltip.Popup>Italic</Tooltip.Popup>
                <Tooltip.Arrow />
              </Tooltip.Positioner>
            </Tooltip.Portal>
          </Tooltip.Root>
        </Cell>
      </div>
    </Settings.Page>
  );
}
