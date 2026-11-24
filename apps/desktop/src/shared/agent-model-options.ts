import type {
  AgentContextChoice,
  AgentModelOptions,
  AgentReasoning,
  AgentRunControls,
} from "@pond/schema";
import type { ProviderModel } from "./provider-models";

const DEFAULT_AGENT_MODEL_OPTIONS: AgentModelOptions = {
  fast: false,
  context: "auto",
  reasoning: "provider-default",
};

const AUTO_CONTEXT_TOKENS = 64_000;
const FAST_PROVIDERS = new Set(["openai", "anthropic", "gemini"]);

export function agentModelOptionsKey(
  provider: string,
  modelId: string,
): string {
  return JSON.stringify([provider, modelId]);
}

export function agentModelOptionsFor(
  stored: Record<string, AgentModelOptions> | undefined,
  provider: string,
  modelId: string,
): AgentModelOptions {
  return (
    stored?.[agentModelOptionsKey(provider, modelId)] ??
    DEFAULT_AGENT_MODEL_OPTIONS
  );
}

export function contextChoicesFor(
  contextWindow: number | undefined,
): Array<AgentContextChoice> {
  const choices: Array<AgentContextChoice> = ["auto"];
  if (!contextWindow) {
    return choices;
  }
  if (contextWindow >= 64_000) {
    choices.push(64_000);
  }
  if (contextWindow >= 256_000) {
    choices.push(256_000);
  }
  choices.push(contextWindow);
  return [...new Set(choices)];
}

export function contextChoiceLabel(
  choice: AgentContextChoice,
  contextWindow?: number,
): string {
  if (choice === "auto") {
    return "Auto";
  }
  if (choice === contextWindow) {
    return "Max";
  }
  return compactTokens(choice);
}

export function reasoningLabel(reasoning: AgentReasoning): string {
  if (reasoning === "provider-default") {
    return "Model Default";
  }
  if (reasoning === "xhigh") {
    return "Maximum";
  }
  return reasoning.charAt(0).toUpperCase() + reasoning.slice(1);
}

export function reasoningChoicesFor(
  model: ProviderModel | undefined,
): Array<AgentReasoning> {
  return ["provider-default", ...new Set(model?.reasoningOptions ?? [])];
}

export function supportsNativeFast(
  provider: string,
  model: ProviderModel | undefined,
): boolean {
  return (
    FAST_PROVIDERS.has(provider) &&
    Boolean(model?.capabilities?.includes("fast"))
  );
}

export function resolveAgentRunControls(
  options: AgentModelOptions,
  provider: string,
  model: ProviderModel | undefined,
): AgentRunControls {
  return validateAgentRunControls(
    runControlsForOptions(options),
    provider,
    model,
  );
}

export function runControlsForOptions(
  options: AgentModelOptions,
): AgentRunControls {
  return {
    fast: options.fast,
    contextTokens:
      options.context === "auto" ? AUTO_CONTEXT_TOKENS : options.context,
    reasoning: options.reasoning,
  };
}

export function validateAgentRunControls(
  controls: AgentRunControls,
  provider: string,
  model: ProviderModel | undefined,
): AgentRunControls {
  return {
    fast: supportsNativeFast(provider, model) && controls.fast,
    contextTokens: model?.contextWindow
      ? Math.min(controls.contextTokens, model.contextWindow)
      : Math.min(controls.contextTokens, AUTO_CONTEXT_TOKENS),
    reasoning:
      controls.reasoning === "provider-default" ||
      model?.reasoningOptions?.includes(controls.reasoning)
        ? controls.reasoning
        : "provider-default",
  };
}

export function compactTokens(value: number): string {
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    return `${Number.isInteger(millions) ? millions : millions.toFixed(1)}M`;
  }
  if (value >= 1000) {
    const thousands = value / 1000;
    return `${Number.isInteger(thousands) ? thousands : thousands.toFixed(1)}K`;
  }
  return String(value);
}
