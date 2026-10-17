import { Menu, Settings } from "@pond/ui";
import {
  type AssistantCatalog,
  type AssistantProvider,
  assistantCatalog,
  offeredProviders,
  type ProviderGroup,
  providerGroup,
} from "@shared/assistant";
import type { ReactNode } from "react";
import { AnimateHeight } from "@/shared/components/animate-height";
import { THIS_DEVICE } from "@/shared/lib/platform";
import { ProviderLogo } from "./icons";
import { ProviderConnection } from "./provider";
import styles from "./styles.module.css";
import type { AgentPrefs, KeyRow } from "./types";

export const GROUPS = [
  {
    kind: "cloud" as const,
    title: "Cloud Providers",
    description: "Use your API keys. Requests go directly to each provider.",
    empty: "No cloud providers",
  },
  {
    kind: "local" as const,
    title: "Local Providers",
    description: "Connect to a model server you run.",
    empty: "No local providers",
  },
  {
    kind: "subscription" as const,
    title: "Subscriptions",
    description: `Use Codex or Claude Code signed in on ${THIS_DEVICE}.`,
    empty: "No subscription connections",
  },
];

export function isListedProvider(
  provider: AssistantProvider,
  agent: AgentPrefs | null | undefined,
  keys: KeyRow[],
) {
  return (
    Boolean(agent?.addedProviders?.includes(provider)) ||
    Boolean(keys.find((row) => row.provider === provider)?.hasKey)
  );
}

export function addedProvidersWith(
  added: string[] | undefined,
  keys: KeyRow[],
  provider: AssistantProvider,
) {
  return [
    ...new Set([
      ...(added ?? []).filter((id) => id !== provider),
      ...keys.filter((row) => row.hasKey).map((row) => row.provider),
      provider,
    ]),
  ];
}

export function listedCatalog(
  kind: ProviderGroup,
  agent: AgentPrefs | null | undefined,
  keys: KeyRow[],
) {
  const seen = new Set<string>();
  const listed: AssistantCatalog[] = [];
  const add = (id: string) => {
    if (seen.has(id)) return;
    const entry = assistantCatalog(id);
    if (!entry) return;
    if (providerGroup(entry.id) !== kind) return;
    if (!isListedProvider(entry.id, agent, keys)) return;
    seen.add(id);
    listed.push(entry);
  };
  for (const id of agent?.addedProviders ?? []) {
    if (keys.find((row) => row.provider === id)?.hasKey) add(id);
  }
  for (const row of keys) {
    if (row.hasKey) add(row.provider);
  }
  for (const id of agent?.addedProviders ?? []) add(id);
  return listed;
}

function ProviderList({ children }: { children: ReactNode }) {
  return (
    <Settings.List>
      <AnimateHeight initial={false}>
        <div className={styles["list-body"]}>{children}</div>
      </AnimateHeight>
    </Settings.List>
  );
}

function remainingProviders(
  kind: ProviderGroup,
  agent: AgentPrefs,
  keys: KeyRow[],
) {
  return offeredProviders(kind).filter(
    (entry) => !isListedProvider(entry.id, agent, keys),
  );
}

export function ProviderSettings({
  agent,
  keys,
  onAdd,
  onPatchAgent,
  onRefresh,
}: {
  agent: AgentPrefs;
  keys: KeyRow[];
  onAdd: (provider: AssistantProvider) => void;
  onPatchAgent: (patch: Partial<AgentPrefs>) => void | Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  return (
    <>
      {GROUPS.map((group) => {
        const listed = listedCatalog(group.kind, agent, keys);
        return (
          <Settings.Section key={group.title} aria-label={group.title}>
            <Settings.SectionDetails>
              <Settings.SectionTitle>{group.title}</Settings.SectionTitle>
              <Settings.SectionAction>
                <AddProviderMenu
                  kind={group.kind}
                  agent={agent}
                  keys={keys}
                  onAdd={onAdd}
                />
              </Settings.SectionAction>
            </Settings.SectionDetails>
            <ProviderList>
              {listed.length ? (
                listed.map((entry) => (
                  <ProviderConnection
                    key={entry.id}
                    catalog={entry}
                    row={keys.find((item) => item.provider === entry.id)}
                    agent={agent}
                    onPatchAgent={onPatchAgent}
                    onRefresh={onRefresh}
                  />
                ))
              ) : (
                <Settings.Item>
                  <Settings.ItemDetails>
                    <Settings.ItemTitle>{group.empty}</Settings.ItemTitle>
                  </Settings.ItemDetails>
                </Settings.Item>
              )}
            </ProviderList>
          </Settings.Section>
        );
      })}
    </>
  );
}

function AddProviderMenu({
  kind,
  agent,
  keys,
  onAdd,
}: {
  kind: ProviderGroup;
  agent: AgentPrefs;
  keys: KeyRow[];
  onAdd: (provider: AssistantProvider) => void;
}) {
  const providers = remainingProviders(kind, agent, keys);
  if (!providers.length) return null;
  return (
    <Menu.FilterProvider autoHighlight>
      <Menu.Root>
        <Menu.Trigger
          size="xs"
          variant="secondary"
          aria-label={
            kind === "subscription"
              ? "Add Subscription Provider"
              : kind === "local"
                ? "Add Local Provider"
                : "Add Cloud Provider"
          }
        >
          Add Provider
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner align="end" sideOffset={8}>
            <Menu.Popup
              className={styles["add-popup"]}
              aria-label={
                kind === "subscription"
                  ? "Add Subscription Provider"
                  : kind === "local"
                    ? "Add Local Provider"
                    : "Add Cloud Provider"
              }
            >
              <Menu.Input
                autoFocus
                aria-label="Search Providers"
                placeholder="Search…"
              />
              <Menu.FilterList className={styles["add-options"]}>
                <Menu.Items
                  items={providers.map((entry) => ({
                    id: entry.id,
                    label: entry.provider,
                    keywords: entry.id,
                    icon: <ProviderLogo provider={entry.id} />,
                    onClick: () => onAdd(entry.id),
                  }))}
                />
              </Menu.FilterList>
              <Menu.Empty>No matches</Menu.Empty>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </Menu.FilterProvider>
  );
}
