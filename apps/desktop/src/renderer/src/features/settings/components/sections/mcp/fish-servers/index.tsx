import {
  IconDots,
  IconPencil,
  IconRefresh,
  IconSliders,
  IconTrash,
} from "@pond/icons";
import { Button, Dialog, Menu, Settings, Switch } from "@pond/ui";
import type { FishMcpServerStatus } from "@shared/fish-mcp-contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { errorCopy } from "@/shared/lib/error-copy";
import { formatPlural } from "@/shared/lib/format";
import { notify } from "@/shared/lib/toast";
import { ServerDialog } from "./server-dialog";
import { ToolList } from "./tool-list";

const SERVERS_KEY = ["fish-mcp"];

type Editing = { kind: "new" } | { kind: "edit"; id: string };

function statusLine({ state, error, tools }: FishMcpServerStatus) {
  if (state === "connected") {
    return `Connected, ${formatPlural(tools.length, { one: "tool", other: "tools" })}`;
  }
  if (state === "idle") {
    return "Connects when a fish needs it";
  }
  if (state === "off") {
    return "Off";
  }
  return error ?? "Couldn't connect";
}

export function FishServersSection() {
  const client = useQueryClient();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [toolsFor, setToolsFor] = useState<string | null>(null);
  const servers = useQuery({
    queryKey: SERVERS_KEY,
    queryFn: () => window.pond.query("fishMcp.list", {}),
  });
  const refresh = () => client.invalidateQueries({ queryKey: SERVERS_KEY });
  const list = servers.data ?? [];
  const edited =
    editing?.kind === "edit"
      ? list.find((entry) => entry.server.id === editing.id)?.server
      : undefined;
  const shown = list.find((entry) => entry.server.id === toolsFor);

  return (
    <Settings.Section>
      <Settings.SectionDetails>
        <Settings.SectionTitle>Tools for Fish</Settings.SectionTitle>
        <Settings.SectionDescription>
          Your fish can call tools from these servers. Changes wait for your
          review.
        </Settings.SectionDescription>
        <Settings.SectionAction>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setEditing({ kind: "new" })}
          >
            Add Server
          </Button>
        </Settings.SectionAction>
      </Settings.SectionDetails>
      <Settings.List>
        {list.length ? (
          list.map((status) => (
            <ServerRow
              key={status.server.id}
              status={status}
              onChanged={refresh}
              onEdit={() => setEditing({ kind: "edit", id: status.server.id })}
              onTools={() => setToolsFor(status.server.id)}
            />
          ))
        ) : (
          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>
                {servers.isPending ? "Loading servers" : "No servers"}
              </Settings.ItemTitle>
              <Settings.ItemDescription>
                Add a server to give your fish its tools.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
          </Settings.Item>
        )}
      </Settings.List>
      {editing && (editing.kind === "new" || edited) ? (
        <ServerDialog
          initial={edited}
          onClose={() => setEditing(null)}
          onSaved={(status) => {
            setEditing(null);
            setToolsFor(status.server.id);
            void refresh();
          }}
        />
      ) : null}
      {shown ? (
        <ToolList
          status={shown}
          onChanged={refresh}
          onClose={() => setToolsFor(null)}
        />
      ) : null}
    </Settings.Section>
  );
}

function ServerRow({
  status,
  onChanged,
  onEdit,
  onTools,
}: {
  status: FishMcpServerStatus;
  onChanged: () => Promise<void>;
  onEdit: () => void;
  onTools: () => void;
}) {
  const { server, state } = status;
  const [busy, setBusy] = useState<string | null>(null);

  async function run(
    label: string,
    work: () => Promise<void>,
    failure: string,
  ) {
    setBusy(label);
    try {
      await work();
    } catch (error) {
      notify({
        id: `fish-mcp-${server.id}`,
        title: failure,
        description: errorCopy(error, "Try again."),
      });
    } finally {
      await onChanged();
      setBusy(null);
    }
  }

  return (
    <Settings.Item>
      <Settings.ItemDetails>
        <Settings.ItemTitle>{server.name}</Settings.ItemTitle>
        <Settings.ItemDescription
          data-error={(!busy && state === "failed") || undefined}
          title={state === "failed" ? status.error : undefined}
        >
          {busy ?? statusLine(status)}
        </Settings.ItemDescription>
      </Settings.ItemDetails>
      <Settings.ItemControl>
        <Switch.Root
          aria-label={`Use ${server.name}`}
          checked={server.enabled}
          disabled={busy !== null}
          onCheckedChange={(enabled) => {
            void run(
              enabled ? "Connecting" : "Off",
              async () => {
                await window.pond.query("fishMcp.save", {
                  server: { ...server, enabled },
                  secrets: {},
                });
              },
              `Couldn't update ${server.name}`,
            );
          }}
        />
        <Menu.Root>
          <Menu.Trigger
            icon
            size="sm"
            variant="ghost"
            aria-label={`${server.name} Actions`}
          >
            <IconDots />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner side="bottom" align="end">
              <Menu.Popup>
                <Menu.Items
                  items={[
                    {
                      label: "Edit",
                      icon: <IconPencil />,
                      onClick: onEdit,
                    },
                    {
                      label: "Test Connection",
                      icon: <IconRefresh />,
                      disabled: busy !== null || !server.enabled,
                      onClick: () =>
                        void run(
                          "Connecting",
                          async () => {
                            await window.pond.query("fishMcp.test", {
                              id: server.id,
                            });
                          },
                          `Couldn't test ${server.name}`,
                        ),
                    },
                    {
                      label: "Tools",
                      icon: <IconSliders />,
                      onClick: onTools,
                    },
                    { type: "separator" },
                    {
                      label: "Remove",
                      icon: <IconTrash />,
                      variant: "destructive",
                      onClick: () =>
                        Dialog.confirm({
                          title: `Remove ${server.name}`,
                          description: `Your fish lose ${server.name}'s tools, and Pond deletes its saved secrets.`,
                          confirmLabel: "Remove",
                          confirmVariant: "destructive",
                          onConfirm: async () => {
                            await window.pond.query("fishMcp.remove", {
                              id: server.id,
                            });
                            await onChanged();
                          },
                        }),
                    },
                  ]}
                />
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </Settings.ItemControl>
    </Settings.Item>
  );
}
