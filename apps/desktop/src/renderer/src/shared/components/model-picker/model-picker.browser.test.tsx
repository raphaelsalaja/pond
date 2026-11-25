import { isHTMLElement } from "@pond/ui/dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import type { ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { bridge } from "@/shared/test/pond-bridge";
import { ModelPicker } from ".";

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  bridge.use({
    query: {
      "agent.listAvailableModels": () => ({
        providers: [
          {
            provider: "openai",
            ok: true,
            models: [
              {
                id: "gpt-5.6-sol",
                name: "GPT-5.6 Sol",
                description: "Built for complex coding and knowledge work.",
                contextWindow: 200_000,
                maxOutputTokens: 8192,
                capabilities: ["fast"],
                reasoningOptions: ["low", "high"],
              },
              {
                id: "legacy-test",
                name: "Legacy Test",
              },
            ],
          },
          {
            provider: "groq",
            ok: true,
            models: [
              { id: "gpt-oss-120b", name: "GPT OSS 120B" },
              { id: "qwen/qwen3.8-27b", name: "Qwen/Qwen3.8-27B" },
            ],
          },
          {
            provider: "anthropic",
            ok: true,
            models: [
              {
                id: "claude-test",
                name: "Claude Test",
                description: "A described Anthropic model.",
                contextWindow: 256_000,
              },
            ],
          },
          {
            provider: "ollama",
            ok: true,
            models: [{ id: "gemma4:26b", name: "gemma4:26b" }],
          },
          {
            provider: "opencode-go",
            ok: true,
            models: [{ id: "kimi-k2.6", name: "Kimi K2.6" }],
          },
        ],
      }),
    },
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

function menuItem(label: string) {
  return [...document.querySelectorAll<HTMLElement>('[role^="menuitem"]')].find(
    (item) => item.textContent?.startsWith(label),
  );
}

function setInput(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function renderPicker(
  onChange = vi.fn(),
  onOptionsChange = vi.fn(),
  onManageModels = vi.fn(),
  provider: ComponentProps<typeof ModelPicker>["provider"] = "openai",
  modelId = "gpt-5.6-sol",
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <ModelPicker
          provider={provider}
          modelId={modelId}
          options={{ fast: false, context: "auto", reasoning: "low" }}
          onChange={onChange}
          onOptionsChange={onOptionsChange}
          onManageModels={onManageModels}
        />
      </QueryClientProvider>,
    );
  });
  return { onChange, onOptionsChange, onManageModels };
}

async function openPicker(expectedLabel = "GPT-5.6 Sol") {
  const trigger = host.querySelector('button[aria-label^="Choose model"]');
  if (!isHTMLElement(trigger)) {
    throw new Error("Missing model picker");
  }
  await act(async () => trigger.click());
  await vi.waitFor(() =>
    expect(trigger.getAttribute("aria-label")).toContain(expectedLabel),
  );
}

it("splits provider and model choices into separate submenus", async () => {
  const { onChange, onManageModels } = await renderPicker();
  await openPicker();

  expect(menuItem("Fast")).toBeTruthy();
  expect(menuItem("Context")).toBeTruthy();
  expect(menuItem("Reasoning")).toBeTruthy();
  expect(menuItem("Provider")?.textContent).toContain("OpenAI");
  expect(menuItem("Model")).toBeTruthy();
  expect(document.body.textContent).not.toContain("200K tokens");

  await act(async () => menuItem("Provider")?.click());
  expect(document.body.textContent).toContain("OpenAI");
  expect(document.body.textContent).toContain("Groq");
  expect(document.body.textContent).toContain("Anthropic");
  expect(document.body.textContent).toContain("Ollama");
  expect(document.body.textContent).toContain("OpenCode Go");
  expect(document.body.textContent).not.toContain("Claude Test");
  await act(async () => menuItem("Anthropic")?.click());
  expect(onChange).toHaveBeenCalledWith({
    provider: "anthropic",
    modelId: "claude-test",
  });

  await openPicker();
  await act(async () => menuItem("Provider")?.click());
  await act(async () => menuItem("OpenCode Go")?.click());
  expect(onChange).toHaveBeenCalledWith({
    provider: "opencode-go",
    modelId: "kimi-k2.6",
  });

  await openPicker();
  await act(async () =>
    menuItem("Model")?.dispatchEvent(
      new MouseEvent("click", { bubbles: true, detail: 1 }),
    ),
  );
  expect(document.body.textContent).not.toContain("Anthropic");
  expect(document.body.textContent).not.toContain("Claude Test");
  expect(document.body.textContent).not.toContain("gemma4:26b");
  expect(document.body.textContent).toContain("Legacy Test");
  const selectedModel = menuItem("GPT-5.6 Sol");
  const modelMenu = selectedModel?.closest<HTMLElement>('[role="dialog"]');
  if (!selectedModel || !modelMenu) {
    throw new Error("Missing selected model menu item");
  }
  await act(async () => {
    selectedModel?.dispatchEvent(
      new MouseEvent("mouseover", { bubbles: true }),
    );
    selectedModel?.dispatchEvent(
      new MouseEvent("mousemove", { bubbles: true }),
    );
  });
  expect(document.body.textContent).toContain(
    "Built for complex coding and knowledge work.",
  );
  expect(document.body.textContent).toContain("200K tokens");
  const offset =
    selectedModel.getBoundingClientRect().top -
    modelMenu.getBoundingClientRect().top;
  expect(offset).toBeGreaterThan(0);
  expect(document.querySelector("aside")?.style.insetBlockStart).toBe(
    `${offset}px`,
  );

  const input = document.querySelector<HTMLInputElement>(
    'input[placeholder="Search…"]',
  );
  if (!input) {
    throw new Error("Missing model search");
  }
  await act(async () => setInput(input, "sol"));
  expect(document.body.textContent).toContain("GPT-5.6 Sol");
  expect(document.body.textContent).not.toContain("Claude Test");
  expect(document.body.textContent).toContain("Manage Models");

  await act(async () => menuItem("GPT-5.6 Sol")?.click());
  expect(onChange).toHaveBeenCalledWith({
    provider: "openai",
    modelId: "gpt-5.6-sol",
  });

  await openPicker();
  await act(async () => menuItem("Model")?.click());
  await act(async () => menuItem("Manage Models")?.click());
  expect(onManageModels).toHaveBeenCalledWith("agent-models");
});

it("updates Fast, Context, and declared Reasoning controls", async () => {
  const { onOptionsChange } = await renderPicker();
  await openPicker();
  await act(async () => menuItem("Fast")?.click());
  expect(onOptionsChange).toHaveBeenCalledWith({
    fast: true,
    context: "auto",
    reasoning: "low",
  });

  await act(async () => menuItem("Context")?.click());
  expect(menuItem("64K")).toBeTruthy();
  expect(menuItem("Max")).toBeTruthy();
  await act(async () => menuItem("Max")?.click());
  expect(onOptionsChange).toHaveBeenCalledWith({
    fast: false,
    context: 200_000,
    reasoning: "low",
  });

  await openPicker();
  await act(async () => menuItem("Reasoning")?.click());
  expect(menuItem("High")).toBeTruthy();
  await act(async () => menuItem("High")?.click());
  expect(onOptionsChange).toHaveBeenCalledWith({
    fast: false,
    context: "auto",
    reasoning: "high",
  });
});

it("keeps unsupported controls visibly unavailable", async () => {
  bridge.use({
    query: {
      "agent.listAvailableModels": () => ({
        providers: [
          {
            provider: "openai",
            ok: true,
            models: [
              {
                id: "gpt-5.6-sol",
                name: "GPT-5.6 Sol",
                description: "A model without optional run controls.",
              },
            ],
          },
        ],
      }),
    },
  });
  await renderPicker();
  await openPicker();

  const fast = menuItem("Fast");
  expect(fast?.textContent).not.toContain("Unavailable");
  expect(fast?.getAttribute("aria-disabled")).toBe("true");
  expect(
    fast?.querySelector('[aria-hidden="true"][data-unchecked]'),
  ).not.toBeNull();
  expect(menuItem("Context")?.getAttribute("aria-disabled")).toBe("true");
  expect(menuItem("Reasoning")?.getAttribute("aria-disabled")).toBe("true");
});

it("shows native models a gateway provider does not describe", async () => {
  bridge.use({
    query: {
      "agent.listAvailableModels": () => ({
        providers: [
          {
            provider: "groq",
            ok: true,
            models: [
              { id: "gpt-oss-120b", name: "GPT OSS 120B" },
              { id: "safety-gpt-oss-20b", name: "Safety GPT OSS 20B" },
            ],
          },
        ],
      }),
    },
  });
  const onChange = vi.fn();
  await renderPicker(onChange, vi.fn(), vi.fn(), "groq", "gpt-oss-120b");
  await openPicker("GPT OSS 120B");

  await act(async () => menuItem("Model")?.click());
  expect(document.body.textContent).toContain("GPT OSS 120B");
  expect(document.body.textContent).toContain("Safety GPT OSS 20B");
  expect(document.body.textContent).not.toContain("No models shown");

  await act(async () => menuItem("Safety GPT OSS 20B")?.click());
  expect(onChange).toHaveBeenCalledWith({
    provider: "groq",
    modelId: "safety-gpt-oss-20b",
  });
});
