import { Badge, Button, Dialog, Select } from "@pond/ui";
import type {
  FishMcpServerStatus,
  FishMcpToolAccess,
  FishMcpToolInfo,
} from "@shared/fish-mcp-contracts";
import { useState } from "react";
import { errorCopy } from "@/shared/lib/error-copy";
import styles from "./styles.module.css";

const ACCESS_ITEMS: Array<{ value: FishMcpToolAccess; label: string }> = [
  { value: "review", label: "Ask First" },
  { value: "read", label: "Run Without Review" },
  { value: "off", label: "Off" },
];

interface ToolListProps {
  status: FishMcpServerStatus;
  onChanged: () => Promise<void>;
  onClose: () => void;
}

export function ToolList({ status, onChanged, onClose }: ToolListProps) {
  const { server, state, tools } = status;
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function test() {
    setTesting(true);
    setError(null);
    try {
      await window.pond.query("fishMcp.test", { id: server.id });
      await onChanged();
    } catch (error_) {
      setError(errorCopy(error_, "Couldn't reach the server. Try again."));
    } finally {
      setTesting(false);
    }
  }

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup>
          <Dialog.Header>
            <Dialog.Title>{server.name} Tools</Dialog.Title>
          </Dialog.Header>
          <Dialog.Content className={styles.content}>
            {tools.length ? (
              <ul className={styles.list} data-scroll-fade="vertical">
                {tools.map((tool) => (
                  <ToolRow
                    key={tool.name}
                    serverId={server.id}
                    tool={tool}
                    onChanged={onChanged}
                    onError={setError}
                  />
                ))}
              </ul>
            ) : (
              <Dialog.Description>
                {state === "connected"
                  ? "This server doesn't offer any tools."
                  : state === "failed"
                    ? (status.error ?? "Couldn't connect to this server.")
                    : "Pond lists the tools once it connects."}
              </Dialog.Description>
            )}
            {error ? (
              <Dialog.Description role="alert" data-error>
                {error}
              </Dialog.Description>
            ) : null}
            <Dialog.Description>
              Servers describe their own tools. Choose Run Without Review only
              for tools you trust.
            </Dialog.Description>
          </Dialog.Content>
          <Dialog.Footer>
            {state === "connected" ? null : (
              <Button
                variant="secondary"
                loading={testing}
                disabled={!server.enabled}
                onClick={() => void test()}
              >
                Test Connection
              </Button>
            )}
            <Button onClick={onClose}>Done</Button>
          </Dialog.Footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ToolRow({
  serverId,
  tool,
  onChanged,
  onError,
}: {
  serverId: string;
  tool: FishMcpToolInfo;
  onChanged: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const [pending, setPending] = useState<FishMcpToolAccess | null>(null);

  async function change(access: FishMcpToolAccess) {
    setPending(access);
    onError(null);
    try {
      await window.pond.query("fishMcp.setToolAccess", {
        id: serverId,
        tool: tool.name,
        access,
      });
      await onChanged();
    } catch (error) {
      onError(errorCopy(error, "Couldn't change that tool. Try again."));
    } finally {
      setPending(null);
    }
  }

  return (
    <li className={styles.tool}>
      <span className={styles.text}>
        <span className={styles.heading}>
          <span className={styles.name} title={tool.name}>
            {tool.name}
          </span>
          {tool.readOnlyHint ? <Badge>Read-only</Badge> : null}
        </span>
        {tool.description ? (
          <span className={styles.description} title={tool.description}>
            {tool.description}
          </span>
        ) : null}
      </span>
      <Select.Root
        value={pending ?? tool.access}
        items={ACCESS_ITEMS}
        onValueChange={(next) => {
          if (next !== null) {
            void change(next);
          }
        }}
      >
        <Select.Trigger size="sm" aria-label={`${tool.name} access`}>
          <Select.Value />
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner>
            <Select.Popup>
              <Select.Items items={ACCESS_ITEMS} />
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
    </li>
  );
}
