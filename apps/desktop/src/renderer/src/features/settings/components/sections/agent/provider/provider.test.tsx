import { DEFAULT_PREFS } from "@pond/schema";
import { isHTMLTag } from "@pond/ui/dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ProviderConnection } from "./";

function buttonNamed(host: ParentNode, name: string) {
  return Array.from(host.querySelectorAll("button")).find((button) =>
    button.textContent?.includes(name),
  );
}

it.each([true, false])(
  "connects a local provider from Save, success=%s",
  async (ok) => {
    const operations: Array<string> = [];
    let refreshed = false;
    vi.stubGlobal("pond", {
      query: async (name: string) => {
        operations.push(name);
        if (name === "agent.listModels") {
          return { ok: true, models: [] };
        }
        return { ok, error: ok ? undefined : "Connection refused" };
      },
    });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () =>
        root.render(
          <QueryClientProvider client={new QueryClient()}>
            <ProviderConnection
              catalog={{ id: "ollama", provider: "Ollama", needsKey: false }}
              row={undefined}
              agent={DEFAULT_PREFS.agent}
              onPatchAgent={() => {}}
              onRefresh={async () => {
                refreshed = true;
              }}
            />
          </QueryClientProvider>,
        ),
      );
      expect(host.querySelector('[aria-label="Ollama options"]')).toBeNull();
      expect(host.querySelector('[aria-label="API Key"]')).not.toBeNull();
      expect(host.querySelector('[aria-label="Connected"]')).toBeNull();
      expect(host.querySelector('[aria-label="Custom model ID"]')).toBeNull();
      const save = buttonNamed(host, "Save");
      if (!isHTMLTag(save, "button")) {
        throw new Error("Missing Save");
      }
      await act(async () => save.click());
      expect(operations).toContain("agent.saveKey");
      expect(refreshed).toBe(ok);
      if (ok) {
        expect(host.querySelector('[aria-label="Edit Ollama"]')).not.toBeNull();
        await vi.waitFor(() => {
          expect(host.querySelector('input[type="password"]')).toBeNull();
        });
      } else {
        expect(host.querySelector('[role="alert"]')?.textContent).toBe(
          "Connection refused",
        );
        expect(host.querySelector('input[type="password"]')).not.toBeNull();
      }
    } finally {
      await act(async () => root.unmount());
      host.remove();
      vi.unstubAllGlobals();
    }
  },
);

it("hides a saved credential until Edit reopens the form", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={new QueryClient()}>
          <ProviderConnection
            catalog={{
              id: "openai",
              provider: "OpenAI",
              needsKey: true,
              setupUrl: "https://platform.openai.com/api-keys",
            }}
            row={{
              provider: "openai",
              hasKey: true,
              masked: "saved-key",
              enabled: true,
            }}
            agent={DEFAULT_PREFS.agent}
            onPatchAgent={async () => {}}
            onRefresh={async () => {}}
          />
        </QueryClientProvider>,
      ),
    );
    expect(host.querySelector("h3")?.textContent).toBe("OpenAI");
    expect(host.querySelector('[aria-label="Connected"]')).not.toBeNull();
    expect(host.querySelector('input[type="password"]')).toBeNull();
    expect(host.textContent).not.toContain("saved-key");
    expect(host.querySelector('[aria-label="OpenAI options"]')).toBeNull();
    expect(host.querySelector('[aria-label="Search models"]')).toBeNull();
    expect(host.querySelector('[aria-label="Enable OpenAI"]')).not.toBeNull();
    const edit = host.querySelector('[aria-label="Edit OpenAI"]');
    if (!isHTMLTag(edit, "button")) {
      throw new Error("Missing Edit");
    }
    await act(async () => edit.click());
    expect(
      host.querySelector('input[type="password"]')?.getAttribute("placeholder"),
    ).toBe("Enter your OpenAI API Key");
    expect(buttonNamed(host, "Save API Key")).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("opens the provider API keys page from the card", async () => {
  const opened: Array<string> = [];
  vi.stubGlobal("pond", {
    openExternal: async (url: string) => {
      opened.push(url);
      return { ok: true };
    },
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={new QueryClient()}>
          <ProviderConnection
            catalog={{
              id: "openai",
              provider: "OpenAI",
              needsKey: true,
              setupUrl: "https://platform.openai.com/api-keys",
            }}
            row={undefined}
            agent={DEFAULT_PREFS.agent}
            onPatchAgent={() => {}}
            onRefresh={async () => {}}
          />
        </QueryClientProvider>,
      ),
    );
    const open = host.querySelector('[aria-label="Open OpenAI"]');
    if (!isHTMLTag(open, "button")) {
      throw new Error("Missing Open");
    }
    await act(async () => open.click());
    expect(opened).toEqual(["https://platform.openai.com/api-keys"]);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it("asks Azure for a resource name", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={new QueryClient()}>
          <ProviderConnection
            catalog={{ id: "azure", provider: "Azure", needsKey: true }}
            row={undefined}
            agent={DEFAULT_PREFS.agent}
            onPatchAgent={() => {}}
            onRefresh={async () => {}}
          />
        </QueryClientProvider>,
      ),
    );
    expect(
      host
        .querySelector('input[aria-label="Resource Name"]')
        ?.getAttribute("placeholder"),
    ).toBe("Resource Name");
    expect(host.querySelector('input[aria-label="API Base URL"]')).toBeNull();
    expect(buttonNamed(host, "Save API Key")).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
