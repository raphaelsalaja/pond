import { IconCircleQuestion as Help } from "@pond/icons";
import { Button, Popover } from "@pond/ui";
import {
  hostSetupCommands,
  isMcpDeeplinkHost,
  type McpHostDefinition,
  mcpHostConfigPath,
} from "@shared/mcp-hosts";
import { useState } from "react";
import { CopyLine } from "../copy-line";
import { JsonBlock } from "../json-block";
import styles from "./styles.module.css";

type PondSnippet = {
  command: string;
  args: string[];
  json: string;
};

export function HostPopover({
  host,
  snippet,
}: {
  host: McpHostDefinition;
  snippet?: PondSnippet;
}) {
  const [error, setError] = useState("");
  const commands = snippet
    ? hostSetupCommands(host.id, snippet.command, snippet.args)
    : [];
  const json = snippet?.json ?? "";
  const deeplink = isMcpDeeplinkHost(host.id) ? host.id : null;
  const configPath = mcpHostConfigPath(
    host,
    globalThis.navigator?.platform ?? "",
  );

  async function addToClient() {
    if (!deeplink) return;
    setError("");
    const result = await window.pond.query("agent.openMcpInstall", {
      id: deeplink,
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
        render={<Button icon size="xs" variant="ghost" />}
        aria-label={`Set up ${host.name}`}
      >
        <Help size={12} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="left" align="start" sideOffset={8}>
          <Popover.Popup className={styles.popup}>
            <Popover.Title className={styles.title}>{host.name}</Popover.Title>
            <p className={styles.lead}>The agent can search and read saves.</p>
            {deeplink ? (
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
            {commands.length === 0 ? (
              <>
                <p className={styles.merge}>
                  {deeplink
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
