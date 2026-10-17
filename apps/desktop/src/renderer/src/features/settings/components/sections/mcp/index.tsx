import { Settings, Switch } from "@pond/ui";
import { MCP_HOST_CATALOG, type McpHostDefinition } from "@shared/mcp-hosts";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { THIS_DEVICE } from "@/shared/lib/platform";
import { usePrefs } from "@/shared/state/prefs";
import { HostPopover } from "./host-popover";
import { HostLogo } from "./logo";

const McpSnippetSchema = z.object({
  command: z.string().min(1),
  args: z.array(z.string()),
  json: z.string().min(1),
});

type PondSnippet = z.infer<typeof McpSnippetSchema>;

const ACCESS = [
  {
    key: "mcpSearch",
    title: "Search Saves",
    description: "Query, search, read, and list folders",
  },
  {
    key: "mcpOpen",
    title: "Open in Pond",
    description: "Reveal a save in the Pond window",
  },
  {
    key: "mcpExport",
    title: "Export Files",
    description: "Convert copies. Originals stay in the library.",
  },
] as const;

export function McpSection() {
  const snippet = useQuery({
    queryKey: ["mcp-snippet"],
    queryFn: async () =>
      McpSnippetSchema.parse(await window.pond.query("agent.mcpSnippet", {})),
    retry: false,
  });
  return (
    <Settings.Page>
      <Settings.Header>
        <Settings.HeaderText>
          <Settings.Title>Model Context Protocol</Settings.Title>
          <Settings.Description>
            Let Cursor and Claude search this library over stdio on{" "}
            {THIS_DEVICE}.
          </Settings.Description>
        </Settings.HeaderText>
      </Settings.Header>
      <AccessSection />
      <AgentsSection snippet={snippet.data} />
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

function AgentsSection({ snippet }: { snippet?: PondSnippet }) {
  return (
    <Settings.Section>
      <Settings.SectionTitle>Agents</Settings.SectionTitle>
      <Settings.List>
        {MCP_HOST_CATALOG.map((host) => (
          <HostRow key={host.id} host={host} snippet={snippet} />
        ))}
      </Settings.List>
    </Settings.Section>
  );
}

function HostRow({
  host,
  snippet,
}: {
  host: McpHostDefinition;
  snippet?: PondSnippet;
}) {
  return (
    <Settings.Item>
      <HostLogo id={host.id} />
      <Settings.ItemDetails>
        <Settings.ItemTitle>{host.name}</Settings.ItemTitle>
      </Settings.ItemDetails>
      <Settings.ItemControl>
        <HostPopover host={host} snippet={snippet} />
      </Settings.ItemControl>
    </Settings.Item>
  );
}
