import { DEFAULT_PREFS } from "@pond/schema";
import { isHTMLTag } from "@pond/ui/dom";
import { ASSISTANT_MODELS } from "@shared/assistant";
import type { AssistantProvider } from "@shared/assistant";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import {
  addedProvidersWith,
  isListedProvider,
  listedCatalog,
  ProviderSettings,
} from "./provider-settings";
import { keyRowsSchema } from "./types";

const emptyAgent = DEFAULT_PREFS.agent;

function keysFor(
  rows: Array<{ provider: AssistantProvider; hasKey?: boolean }>,
) {
  return keyRowsSchema.parse(
    ASSISTANT_MODELS.map((model) => ({
      provider: model.id,
      hasKey: rows.some((row) => row.provider === model.id && row.hasKey),
      masked: null,
      enabled: true,
    })),
  );
}

function renderSettings(
  host: HTMLDivElement,
  props: Parameters<typeof ProviderSettings>[0],
) {
  const root = createRoot(host);
  return {
    root,
    render: () =>
      root.render(
        <QueryClientProvider
          client={
            new QueryClient({
              defaultOptions: { queries: { retry: false } },
            })
          }
        >
          <ProviderSettings {...props} />
        </QueryClientProvider>,
      ),
  };
}

it("hides unadded providers from Cloud and Local lists", async () => {
  const added: Array<AssistantProvider> = [];
  const host = document.createElement("div");
  document.body.append(host);
  const { root, render } = renderSettings(host, {
    agent: emptyAgent,
    keys: keysFor([]),
    onAdd: (provider) => added.push(provider),
    onPatchAgent: () => undefined,
    onRefresh: async () => undefined,
  });
  try {
    await act(async () => render());
    expect(host.querySelector('[aria-label="OpenAI"]')).toBeNull();
    expect(host.querySelector('[aria-label="Ollama"]')).toBeNull();
    expect(host.textContent).toContain("No cloud providers");
    expect(host.textContent).toContain("No local providers");
    expect(host.textContent).not.toContain("Custom Providers");
    expect(host.querySelector('[aria-label="Custom Providers"]')).toBeNull();
    const add = Array.from(host.querySelectorAll("button")).filter(
      (button) => button.textContent === "Add Provider",
    );
    expect(add).toHaveLength(3);
    await act(async () => add[0]?.click());
    expect(
      document.querySelector('[aria-label="Search Providers"]'),
    ).not.toBeNull();
    const cloudMenu = document.body.textContent ?? "";
    expect(cloudMenu).toContain("OpenAI");
    expect(cloudMenu).not.toContain("Custom Endpoint");
    expect(cloudMenu).toContain("xAI");
    expect(cloudMenu).not.toContain("Ollama");
    const openai = Array.from(
      document.querySelectorAll("[role='menuitem']"),
    ).find((item) => item.textContent?.includes("OpenAI"));
    await act(async () =>
      openai?.dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );
    expect(added).toEqual(["openai"]);
    await act(async () => add[1]?.click());
    const localMenu = document.body.textContent ?? "";
    expect(localMenu).toContain("Ollama");
    expect(localMenu).not.toContain("OpenAI");
    const ollama = Array.from(
      document.querySelectorAll("[role='menuitem']"),
    ).find((item) => item.textContent?.includes("Ollama"));
    await act(async () =>
      ollama?.dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );
    expect(added).toEqual(["openai", "ollama"]);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("lists added and already-connected providers only", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const { root, render } = renderSettings(host, {
    agent: { ...emptyAgent, addedProviders: ["openai"] },
    keys: keysFor([
      { provider: "openai", hasKey: false },
      { provider: "anthropic", hasKey: true },
      { provider: "ollama", hasKey: true },
    ]),
    onAdd: () => undefined,
    onPatchAgent: () => undefined,
    onRefresh: async () => undefined,
  });
  try {
    await act(async () => render());
    expect(host.querySelector('[aria-label="OpenAI"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Anthropic"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Ollama"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Google"]')).toBeNull();
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(
      host
        .querySelector('[aria-label="OpenAI"] input[type="password"]')
        ?.getAttribute("placeholder"),
    ).toBe("Enter your OpenAI API Key");
    expect(
      host.querySelector('[aria-label="Ollama"] input[type="url"]'),
    ).toBeNull();
    expect(
      host.querySelector('[aria-label="Anthropic"] input[type="password"]'),
    ).toBeNull();
    expect(
      host.querySelector('[aria-label="Enable Anthropic"]'),
    ).not.toBeNull();
    expect(host.querySelector('[aria-label="Enable Ollama"]')).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("connects Apple Intelligence without a key or endpoint", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const { root, render } = renderSettings(host, {
    agent: { ...emptyAgent, addedProviders: ["apple"] },
    keys: keysFor([]),
    onAdd: () => undefined,
    onPatchAgent: () => undefined,
    onRefresh: async () => undefined,
  });
  try {
    await act(async () => render());
    const card = host.querySelector('[aria-label="Apple"]');
    expect(card).not.toBeNull();
    expect(
      card?.querySelector('input[type="password"], input[type="url"]'),
    ).toBeNull();
    expect(card?.textContent).toContain(
      "Turn on Apple Intelligence in System Settings",
    );
    const submit = card?.querySelector('button[type="submit"]');
    expect(submit?.textContent).toBe("Connect");
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("treats saved keys as listed even before addedProviders is stored", () => {
  expect(
    isListedProvider(
      "openai",
      emptyAgent,
      keysFor([{ provider: "openai", hasKey: true }]),
    ),
  ).toBe(true);
  expect(isListedProvider("openai", emptyAgent, keysFor([]))).toBe(false);
  expect(isListedProvider("openai", undefined, keysFor([]))).toBe(false);
  expect(
    isListedProvider(
      "xai",
      { ...emptyAgent, addedProviders: ["xai"] },
      keysFor([]),
    ),
  ).toBe(true);
});

it("lists cloud providers in the order they were added", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const { root, render } = renderSettings(host, {
    agent: {
      ...emptyAgent,
      addedProviders: ["openai", "gemini", "anthropic"],
    },
    keys: keysFor([]),
    onAdd: () => undefined,
    onPatchAgent: () => undefined,
    onRefresh: async () => undefined,
  });
  try {
    expect(
      listedCatalog(
        "cloud",
        { ...emptyAgent, addedProviders: ["openai", "gemini", "anthropic"] },
        keysFor([]),
      ).map((entry) => entry.id),
    ).toEqual(["openai", "gemini", "anthropic"]);
    await act(async () => render());
    const cloud = host.querySelector('[aria-label="Cloud Providers"]');
    const names = Array.from(cloud?.querySelectorAll("[aria-label]") ?? [])
      .map((node) => node.getAttribute("aria-label"))
      .filter(
        (label) =>
          label === "OpenAI" || label === "Google" || label === "Anthropic",
      );
    expect(names).toEqual(["OpenAI", "Google", "Anthropic"]);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("puts a newly added provider after existing key connections", () => {
  const keys = keysFor([{ provider: "anthropic", hasKey: true }]);
  expect(
    listedCatalog(
      "cloud",
      { ...emptyAgent, addedProviders: ["fireworks"] },
      keys,
    ).map((entry) => entry.id),
  ).toEqual(["anthropic", "fireworks"]);
  expect(addedProvidersWith(["fireworks"], keys, "fireworks")).toEqual([
    "anthropic",
    "fireworks",
  ]);
});

it("filters the Add Provider menu", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const { root, render } = renderSettings(host, {
    agent: emptyAgent,
    keys: keysFor([]),
    onAdd: () => undefined,
    onPatchAgent: () => undefined,
    onRefresh: async () => undefined,
  });
  try {
    await act(async () => render());
    const add = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent === "Add Provider",
    );
    await act(async () => add?.click());
    const search = document.querySelector('[aria-label="Search Providers"]');
    if (!isHTMLTag(search, "input")) {
      throw new Error("Missing search");
    }
    await act(async () => {
      search.focus();
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(search, "groq");
      search.dispatchEvent(new InputEvent("input", { bubbles: true }));
    });
    expect(document.body.textContent).toContain("Groq");
    expect(document.body.textContent).not.toContain("OpenAI");
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(search, "zzzz");
      search.dispatchEvent(new InputEvent("input", { bubbles: true }));
    });
    expect(document.body.textContent).toContain("No matches");
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("skips key rows for providers that left the catalog", () => {
  expect(
    keyRowsSchema
      .parse([
        {
          provider: "openai",
          hasKey: true,
          masked: "sk-a…xyz1",
          enabled: true,
        },
        {
          provider: "qwen",
          hasKey: true,
          masked: "sk-q…old1",
          enabled: true,
        },
        {
          provider: "compatible",
          hasKey: false,
          masked: null,
          enabled: true,
        },
      ])
      .map((row) => row.provider),
  ).toEqual(["openai"]);
});

it("rejects a keys payload that is not a list", () => {
  expect(() => keyRowsSchema.parse({ error: "nope" })).toThrow();
});
