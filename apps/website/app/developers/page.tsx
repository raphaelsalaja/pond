import type { Metadata } from "next";
import { API_DOCS_URL, CLI_URL } from "@/lib/links";
import { Article } from "../components/article";
import { Cta } from "../components/cta";
import { PageHeader } from "../components/page-header";

const CLIENT_URL = "https://www.npmjs.com/package/pond-api";

export const metadata: Metadata = {
  title: "Developers",
  description:
    "Build on your Pond library with the local HTTP API and the MCP server. Everything runs on your computer.",
};

const SECTIONS = [
  { id: "http-api", label: "HTTP API" },
  { id: "access", label: "Access" },
  { id: "responses", label: "Responses and versions" },
  { id: "client", label: "TypeScript client" },
  { id: "mcp", label: "MCP server" },
  { id: "cli", label: "CLI" },
];

const ACCESS = [
  {
    name: "Search Saves",
    routes: [
      "GET /library/info, /library/tags, /library/folders, /library/views, /library/sources",
      "POST /library/query, /library/search",
      "GET or POST /saves/get",
      "GET /saves/info, /saves/text, /saves/status, /saves/thumb, /saves/file, /saves/related",
    ],
  },
  {
    name: "Export Files",
    routes: ["Every /library/conversion route"],
  },
  {
    name: "Add and Edit Saves",
    routes: [
      "POST /enqueue",
      "POST /saves/tags, /saves/folders, /saves/trash, /saves/restore, /saves/note, /saves/rating",
    ],
  },
];

const TOOLS = [
  {
    name: "Search Saves",
    tools:
      "query_library, search_library, read_save, grep_library, list_folders",
  },
  { name: "Open in Pond", tools: "open_save, apply_filter" },
  {
    name: "Export Files",
    tools:
      "list_conversion_capabilities, list_conversion_presets, save_conversion_preset, start_conversion, compress_images, conversion_status, cancel_conversion",
  },
];

const CURL = `curl -H "Authorization: Bearer $POND_TOKEN" \\
  http://127.0.0.1:41610/api/v2/library/info`;

const MCP_CONFIG = `{
  "mcpServers": {
    "pond": {
      "command": "/Applications/Pond.app/Contents/MacOS/Pond",
      "args": ["--mcp"]
    }
  }
}`;

export default function DevelopersPage() {
  return (
    <main>
      <PageHeader.Root>
        <PageHeader.Label>Developers</PageHeader.Label>
        <PageHeader.Title>Build on your own library.</PageHeader.Title>
        <PageHeader.Lede>
          Pond has a local HTTP API and an MCP server, so your scripts, apps,
          and agents can read and edit your library. Both run inside the Pond
          app on your computer. Nothing goes through a Pond server.
        </PageHeader.Lede>
        <PageHeader.Actions>
          <Cta href={API_DOCS_URL} variant="soft" external>
            API Reference
          </Cta>
          <Cta href={CLIENT_URL} variant="ghost" external>
            pond-api on npm
          </Cta>
        </PageHeader.Actions>
      </PageHeader.Root>
      <Article.Root sections={SECTIONS}>
        <Article.Section id="http-api">
          <h2>HTTP API</h2>
          <p>
            While Pond is open, it listens on loopback only, so nothing outside
            your computer can reach it.
          </p>
          <pre>
            <code>http://127.0.0.1:41610/api/v2</code>
          </pre>
          <p>
            Create a token in Pond under Settings, Local API. Pick what it can
            reach, copy it, and send it as a Bearer header:
          </p>
          <pre>
            <code>{CURL}</code>
          </pre>
          <p>
            Pond shows each token once and keeps only a hash. Revoke it in the
            same place when a tool no longer needs access.
          </p>
        </Article.Section>
        <Article.Section id="access">
          <h2>Access</h2>
          <p>
            A token can have any of these. Requests outside them answer{" "}
            <code>forbidden</code>.
          </p>
          <table>
            <thead>
              <tr>
                <th scope="col">Access</th>
                <th scope="col">Routes</th>
              </tr>
            </thead>
            <tbody>
              {ACCESS.map((group) => (
                <tr key={group.name}>
                  <th scope="row">{group.name}</th>
                  <td>
                    {group.routes.map((route) => (
                      <div key={route}>
                        <code>{route}</code>
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Article.Section>
        <Article.Section id="responses">
          <h2>Responses and versions</h2>
          <p>
            Every response is an envelope with <code>status</code>. Errors carry
            a stable <code>code</code>, like <code>save_not_found</code>, so
            branch on that and never on the message.
          </p>
          <p>
            <code>GET /app/info</code> needs no token and returns{" "}
            <code>apiVersion</code>. Minor versions only add endpoints, fields,
            and error codes. A breaking change ships under <code>/api/v3</code>,
            with <code>/api/v2</code> kept alongside it for at least one
            release.
          </p>
        </Article.Section>
        <Article.Section id="client">
          <h2>TypeScript client</h2>
          <p>
            <a href={CLIENT_URL} target="_blank" rel="noreferrer">
              pond-api
            </a>{" "}
            has a typed method for every endpoint and validates each response.
            It depends only on zod.
          </p>
          <pre>
            <code>npm install pond-api</code>
          </pre>
        </Article.Section>
        <Article.Section id="mcp">
          <h2>MCP server</h2>
          <p>
            Agents like Cursor and Claude connect over stdio. Copy the command
            from Pond under Settings, Model Context Protocol, or add this to
            your host's config on a Mac:
          </p>
          <pre>
            <code>{MCP_CONFIG}</code>
          </pre>
          <p>The switches on that settings page decide which tools answer:</p>
          <table>
            <thead>
              <tr>
                <th scope="col">Access</th>
                <th scope="col">Tools</th>
              </tr>
            </thead>
            <tbody>
              {TOOLS.map((group) => (
                <tr key={group.name}>
                  <th scope="row">{group.name}</th>
                  <td>
                    <code>{group.tools}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Article.Section>
        <Article.Section id="cli">
          <h2>CLI</h2>
          <p>
            The{" "}
            <a href={CLI_URL} target="_blank" rel="noreferrer">
              pond CLI
            </a>{" "}
            sends every command through the same local API. Copy the Local API
            token from Pond Settings, then authorize it:
          </p>
          <pre>
            <code>{`npm install --global @pond/cli
pond auth authorize --token <token>
pond doctor`}</code>
          </pre>
        </Article.Section>
      </Article.Root>
    </main>
  );
}
