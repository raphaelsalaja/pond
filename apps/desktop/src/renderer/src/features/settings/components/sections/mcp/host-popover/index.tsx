import { IconCircleQuestion as Help } from "@pond/icons";
import { Button, Popover } from "@pond/ui";
import {
  hostSetupCommands,
  isMcpInstallHost,
  type McpHostDefinition,
  mcpHostConfigPath,
} from "@shared/mcp-hosts";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { CopyLine } from "../copy-line";
import { JsonBlock } from "../json-block";
import styles from "./styles.module.css";

const McpSnippetSchema = z.object({
  command: z.string().min(1),
  args: z.array(z.string()),
  json: z.string().min(1),
});

export function HostPopover({ host }: { host: McpHostDefinition }) {
  const [error, setError] = useState("");
  const snippet = useQuery({
    queryKey: ["mcp-snippet", host.id],
    queryFn: async () =>
      McpSnippetSchema.parse(
        await window.pond.query("agent.mcpSnippet", { host: host.id }),
      ),
    retry: false,
  });
  const commands = snippet.data
    ? hostSetupCommands(host.id, snippet.data.command, snippet.data.args)
    : [];
  const json = snippet.data?.json ?? "";
  /** OpenCode users get the launch line and the mergeable config both. */
  const showMerge = commands.length === 0 || host.id === "opencode";
  const installable = isMcpInstallHost(host.id) ? host.id : null;
  const configPath = mcpHostConfigPath(
    host,
    globalThis.navigator?.platform ?? "",
  );

  async function addToClient() {
    if (!installable) return;
    setError("");
    const result = await window.pond.query("agent.openMcpInstall", {
      id: installable,
    });
    if (!result.ok) {
      setError(
        result.error ??
          "Pond could not open that install link. Copy the config instead.",
      );
    }
  }

  return (
    <Popover.Root>
      <Popover.Trigger
        render={
          <Button
            icon
            size="xs"
            variant="ghost"
            aria-label={`Set up ${host.name}`}
          />
        }
      >
        <Help size={12} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="left" align="start" sideOffset={8}>
          <Popover.Popup className={styles.popup}>
            <Popover.Title className={styles.title}>{host.name}</Popover.Title>
            <p className={styles.lead}>The agent can search and read saves.</p>
            {installable ? (
              <Button size="sm" onClick={() => void addToClient()}>
                {host.addLabel}
              </Button>
            ) : null}
            {commands.map((command) => (
              <CopyLine
                key={command.label}
                label={command.label}
                value={command.value}
              />
            ))}
            {showMerge ? (
              <>
                <p className={styles.merge}>
                  {installable
                    ? `Or merge into ${configPath}:`
                    : `Merge into ${configPath}:`}
                </p>
                <JsonBlock json={json} />
              </>
            ) : null}
            <p className={styles.lead}>{host.hint}</p>
            {error ? (
              <p className={styles.error} role="alert">
                {error}
              </p>
            ) : null}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
