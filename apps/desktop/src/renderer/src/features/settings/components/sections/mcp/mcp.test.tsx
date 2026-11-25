import { DEFAULT_PREFS } from "@pond/schema";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { McpSection } from "./index";

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("shows all setup hosts without detecting installs or expanding a disclosure", async () => {
  vi.stubGlobal("pond", {
    query: async (name: string) => {
      if (name === "settings.getPrefs") return DEFAULT_PREFS;
      if (name === "fishMcp.list") return [];
      if (name === "agent.mcpSnippet") {
        throw new Error("Snippet unavailable");
      }
      throw new Error(`Unexpected query: ${name}`);
    },
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider
          client={
            new QueryClient({
              defaultOptions: { queries: { retry: false } },
            })
          }
        >
          <McpSection />
        </QueryClientProvider>,
      ),
    );
    expect(host.textContent).toContain("Search Saves");
    expect(host.textContent).toContain("Cursor");
    expect(host.textContent).toContain("Claude Code");
    expect(host.textContent).toContain("OpenAI Codex");
    expect(host.textContent).toContain("Gemini CLI");
    expect(host.textContent).toContain("OpenCode");
    expect(host.textContent).toContain("Claude Desktop");
    expect(host.textContent).toContain("VS Code");
    expect(host.textContent).not.toContain("More Agents");
    expect(host.textContent).not.toContain("Advanced");
    expect(host.textContent).not.toContain("Installed on this Mac");
    expect(host.textContent).not.toContain("Agents unavailable");
    expect(host.textContent).toContain("Other");
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
