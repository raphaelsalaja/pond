import { Settings, Switch } from "@pond/ui";
import { MCP_HOST_CATALOG } from "@shared/mcp-hosts";
import type { McpHostDefinition } from "@shared/mcp-hosts";
import { usePrefs } from "@/shared/state/prefs";
import { FishServersSection } from "./fish-servers";
import { HostPopover } from "./host-popover";
import { HostLogo } from "./logo";

const ACCESS = [
  {
    key: "mcpSearch",
    title: "Search Saves",
    description: "Let connected apps search and read your saves and folders.",
  },
  {
    key: "mcpOpen",
    title: "Open in Pond",
    description:
      "Let connected apps open a save or filter your library in Pond.",
  },
  {
    key: "mcpExport",
    title: "Export Files",
    description:
      "Let connected apps export converted copies and compress images.",
  },
] as const;

export function McpSection() {
  return (
    <Settings.Page>
      <Settings.Header>
        <Settings.HeaderText>
          <Settings.Title>Model Context Protocol</Settings.Title>
          <Settings.Description>
            Let Cursor and Claude search this library, and give your fish tools
            from servers you run.
          </Settings.Description>
        </Settings.HeaderText>
      </Settings.Header>
      <AccessSection />
      <AgentsSection />
      <FishServersSection />
    </Settings.Page>
  );
}

function AccessSection() {
  const [agent, patch] = usePrefs("agent");
  return (
    <Settings.Section>
      <Settings.SectionTitle>Access</Settings.SectionTitle>
      <Settings.List>
        {ACCESS.map((item) => (
          <Settings.Item key={item.key}>
            <Settings.ItemDetails>
              <Settings.ItemTitle>{item.title}</Settings.ItemTitle>
              <Settings.ItemDescription>
                {item.description}
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Switch.Root
                aria-label={item.title}
                checked={agent[item.key]}
                onCheckedChange={(checked) => {
                  void patch({ [item.key]: checked });
                }}
              />
            </Settings.ItemControl>
          </Settings.Item>
        ))}
      </Settings.List>
    </Settings.Section>
  );
}

function AgentsSection() {
  return (
    <Settings.Section>
      <Settings.SectionTitle>Agents</Settings.SectionTitle>
      <Settings.List>
        {MCP_HOST_CATALOG.map((host) => (
          <HostRow key={host.id} host={host} />
        ))}
      </Settings.List>
    </Settings.Section>
  );
}

function HostRow({ host }: { host: McpHostDefinition }) {
  return (
    <Settings.Item>
      <HostLogo id={host.id} />
      <Settings.ItemDetails>
        <Settings.ItemTitle>{host.name}</Settings.ItemTitle>
      </Settings.ItemDetails>
      <Settings.ItemControl>
        <HostPopover host={host} />
      </Settings.ItemControl>
    </Settings.Item>
  );
}
