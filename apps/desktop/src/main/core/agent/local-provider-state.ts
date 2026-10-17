import type { Prefs } from "@pond/schema";

export function isLocalProviderConnected(
  provider: string,
  agent: Pick<Prefs["agent"], "enabledKeys" | "connectedLocalProviders">,
): boolean {
  return (
    (provider === "ollama" ||
      provider === "lmstudio" ||
      provider === "sapient" ||
      provider === "codex" ||
      provider === "claude-code") &&
    (agent.connectedLocalProviders?.[provider] ??
      agent.enabledKeys[provider] === true)
  );
}
