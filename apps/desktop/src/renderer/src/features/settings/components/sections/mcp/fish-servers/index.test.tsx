import type { JsonValue } from "@pond/schema/json";
import type {
  FishMcpServerConfig,
  FishMcpServerStatus,
} from "@shared/fish-mcp-contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FishServersSection } from "./index";
import { ServerDialog } from "./server-dialog";

const github: FishMcpServerConfig = {
  id: "s1",
  name: "github",
  transport: "stdio",
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-github"],
  enabled: true,
  secretNames: ["GITHUB_TOKEN"],
  toolAccess: {},
};

const calls: Array<[string, JsonValue]> = [];

function stubPond(list: Array<FishMcpServerStatus>) {
  vi.stubGlobal("pond", {
    async query(name: string, params: JsonValue) {
      calls.push([name, params]);
      if (name === "fishMcp.list") {
        return list;
      }
      if (name === "fishMcp.save") {
        return list[0];
      }
      throw new Error(`Unexpected query: ${name}`);
    },
  });
}

async function render(node: React.ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>{node}</QueryClientProvider>,
    ),
  );
  await act(
    () =>
      new Promise((resolve) => {
        setTimeout(resolve, 0);
      }),
  );
  return {
    host,
    async unmount() {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

beforeEach(() => {
  calls.length = 0;
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

it("shows an empty list", async () => {
  stubPond([]);
  const view = await render(<FishServersSection />);
  try {
    expect(view.host.textContent).toContain("Tools for Fish");
    expect(view.host.textContent).toContain("No servers");
  } finally {
    await view.unmount();
  }
});

it("shows a failed server's error and a connected server's tool count", async () => {
  stubPond([
    {
      server: github,
      state: "failed",
      error: "spawn npx ENOENT",
      tools: [],
    },
    {
      server: { ...github, id: "s2", name: "linear" },
      state: "connected",
      tools: [
        {
          name: "list_issues",
          description: "",
          readOnlyHint: true,
          access: "review",
        },
      ],
    },
  ]);
  const view = await render(<FishServersSection />);
  try {
    const error = view.host.querySelector("[data-error]");
    expect(error?.textContent).toBe("spawn npx ENOENT");
    expect(view.host.textContent).toContain("Connected, 1 tool");
  } finally {
    await view.unmount();
  }
});

it("turns a server off without sending secrets", async () => {
  stubPond([{ server: github, state: "idle", tools: [] }]);
  const view = await render(<FishServersSection />);
  try {
    const toggle = view.host.querySelector<HTMLElement>('[role="switch"]');
    if (!toggle) {
      throw new Error("Missing server switch");
    }
    await act(async () => toggle.click());
    expect(calls).toContainEqual([
      "fishMcp.save",
      { server: { ...github, enabled: false }, secrets: {} },
    ]);
  } finally {
    await view.unmount();
  }
});

it("explains an invalid name instead of saving", async () => {
  stubPond([]);
  const view = await render(
    <ServerDialog onClose={() => {}} onSaved={() => {}} />,
  );
  try {
    const form = document.querySelector("form");
    if (!form) {
      throw new Error("Missing server form");
    }
    await act(async () => form.requestSubmit());
    expect(document.body.textContent).toContain(
      "Use lowercase letters, numbers, and dashes.",
    );
    expect(calls.map(([name]) => name)).not.toContain("fishMcp.save");
  } finally {
    await view.unmount();
  }
});

it("never renders a saved secret's value when editing", async () => {
  stubPond([{ server: github, state: "idle", tools: [] }]);
  const view = await render(
    <ServerDialog initial={github} onClose={() => {}} onSaved={() => {}} />,
  );
  try {
    const value = document.querySelector<HTMLInputElement>(
      'input[type="password"]',
    );
    expect(value?.value).toBe("");
    expect(value?.placeholder).toBe("Saved");
    expect(
      document.querySelector<HTMLInputElement>('input[value="GITHUB_TOKEN"]'),
    ).not.toBeNull();
  } finally {
    await view.unmount();
  }
});
