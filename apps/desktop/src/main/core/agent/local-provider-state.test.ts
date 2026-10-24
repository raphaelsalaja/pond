import { expect, it } from "vitest";
import { isLocalProviderConnected } from "./local-provider-state";

it.each(["ollama", "lmstudio", "sapient"])(
  "keeps %s connected when disabled and drops it only when removed",
  (provider) => {
    const legacy = { enabledKeys: { [provider]: true } };
    expect(isLocalProviderConnected(provider, legacy)).toBe(true);
    const connectedLocalProviders = {
      [provider]: isLocalProviderConnected(provider, legacy),
    };
    expect(
      isLocalProviderConnected(provider, {
        enabledKeys: { [provider]: false },
        connectedLocalProviders,
      }),
    ).toBe(true);
    expect(
      isLocalProviderConnected(provider, {
        enabledKeys: { [provider]: false },
        connectedLocalProviders: { [provider]: false },
      }),
    ).toBe(false);
  },
);
it("does not treat an unconfigured local provider as connected", () => {
  expect(isLocalProviderConnected("ollama", { enabledKeys: {} })).toBe(false);
});
