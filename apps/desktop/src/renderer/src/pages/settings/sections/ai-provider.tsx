import { Button, Input, Select, Switch, useToast } from "@pond/ui";
import { useEffect, useState } from "react";
import { Settings } from "@/components/settings";
import { useAiProvider } from "@/pool/ai-provider";

/**
 * AI Provider — the infra config: tier, endpoint, models, API key,
 * privacy. The high-stakes page; everything else under Intelligence
 * downstream of these choices. Ollama probe lives here because the
 * tier picker is the only place it's contextually relevant.
 */

interface OllamaProbe {
  ok: boolean;
  modelCount?: number;
}

export function AiProviderSection() {
  const toast = useToast();
  const { provider, apiKey, ready, patchProvider, setApiKey, saveApiKey } =
    useAiProvider();
  const [busy, setBusy] = useState(false);
  const [ollama, setOllama] = useState<OllamaProbe | null>(null);

  useEffect(() => {
    if (provider.kind !== "local") {
      setOllama(null);
      return;
    }
    let cancelled = false;
    const probe = async () => {
      try {
        const res = (await window.pond.query("settings.detectOllama", {
          baseUrl: provider.baseUrl,
        })) as OllamaProbe;
        if (!cancelled) setOllama(res);
      } catch {
        if (!cancelled) setOllama({ ok: false });
      }
    };
    void probe();
    const handle = setInterval(probe, 8000);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [provider.kind, provider.baseUrl]);

  async function handleSaveApiKey() {
    setBusy(true);
    try {
      await saveApiKey();
      toast.add({
        title: "AI key saved",
        description: "Stored in your keychain.",
        type: "success",
      });
    } finally {
      setBusy(false);
    }
  }

  const isCloud = provider.kind === "gateway" || provider.kind === "direct";
  const isOff = provider.kind === "off";

  return (
    <Settings.Page>
      <Settings.Header>
        <Settings.Title>AI Provider</Settings.Title>
        <Settings.Description>
          Where Pond runs inference and what it costs.
        </Settings.Description>
      </Settings.Header>

      <Settings.Section>
        <Settings.SectionTitle>Provider</Settings.SectionTitle>
        <Settings.List>
          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Tier</Settings.ItemTitle>
              <Settings.ItemDescription>
                Local uses an OpenAI-compatible server. Gateway routes through
                Vercel AI Gateway. Direct uses an OpenAI, Anthropic, or Google
                key. Off disables enrichment.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Select.Root
                value={provider.kind}
                onValueChange={(v) =>
                  patchProvider({
                    kind: v as typeof provider.kind,
                  })
                }
              >
                <Select.Trigger>
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="off">Off</Select.Item>
                  <Select.Item value="local">Local (Ollama)</Select.Item>
                  <Select.Item value="gateway">Vercel AI Gateway</Select.Item>
                  <Select.Item value="direct">Direct Provider Key</Select.Item>
                </Select.Content>
              </Select.Root>
            </Settings.ItemControl>
          </Settings.Item>

          {provider.kind === "local" ? (
            <>
              <Settings.Item>
                <Settings.ItemDetails>
                  <Settings.ItemTitle>Base URL</Settings.ItemTitle>
                  <Settings.ItemDescription>
                    OpenAI-compatible endpoint. Defaults to a local Ollama
                    install.
                  </Settings.ItemDescription>
                </Settings.ItemDetails>
                <Settings.ItemControl>
                  <Input.Root
                    data-size="sm"
                    value={provider.baseUrl}
                    onChange={(e) => patchProvider({ baseUrl: e.target.value })}
                  />
                </Settings.ItemControl>
              </Settings.Item>

              <Settings.Item>
                <Settings.ItemDetails>
                  <Settings.ItemTitle>Status</Settings.ItemTitle>
                  <Settings.ItemDescription>
                    {ollama === null
                      ? "Checking…"
                      : ollama.ok
                        ? `Local server reachable. ${ollama.modelCount ?? "?"}\u00A0models loaded.`
                        : "Couldn't reach the endpoint. Run `ollama serve` and try again."}
                  </Settings.ItemDescription>
                </Settings.ItemDetails>
                <Settings.ItemControl>
                  <span aria-live="polite">
                    {ollama === null
                      ? "…"
                      : ollama.ok
                        ? "Connected"
                        : "Offline"}
                  </span>
                </Settings.ItemControl>
              </Settings.Item>
            </>
          ) : null}

          {isCloud ? (
            <Settings.Item>
              <Settings.ItemDetails>
                <Settings.ItemTitle>API Key</Settings.ItemTitle>
                <Settings.ItemDescription>
                  {provider.kind === "gateway"
                    ? "Paste your Vercel AI Gateway key. Stored in the OS keychain."
                    : "Paste your OpenAI, Anthropic, or Google API key. Stored in the OS keychain."}
                </Settings.ItemDescription>
              </Settings.ItemDetails>
              <Settings.ItemControl>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <Input.Root
                    type="password"
                    data-size="sm"
                    placeholder="sk-…"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    disabled={!ready}
                  />
                  <Button
                    size="sm"
                    onClick={() => void handleSaveApiKey()}
                    disabled={busy || !ready}
                  >
                    Save
                  </Button>
                </div>
              </Settings.ItemControl>
            </Settings.Item>
          ) : null}
        </Settings.List>
      </Settings.Section>

      {!isOff ? (
        <Settings.Section>
          <Settings.SectionTitle>Models</Settings.SectionTitle>
          <Settings.List>
            <Settings.Item>
              <Settings.ItemDetails>
                <Settings.ItemTitle>Vision</Settings.ItemTitle>
                <Settings.ItemDescription>
                  Caption, alt text, tags, classification, and OCR in a single
                  call.
                </Settings.ItemDescription>
              </Settings.ItemDetails>
              <Settings.ItemControl>
                <Input.Root
                  data-size="sm"
                  value={provider.models.vision}
                  onChange={(e) =>
                    patchProvider({
                      models: { ...provider.models, vision: e.target.value },
                    })
                  }
                />
              </Settings.ItemControl>
            </Settings.Item>

            <Settings.Item>
              <Settings.ItemDetails>
                <Settings.ItemTitle>Summary</Settings.ItemTitle>
                <Settings.ItemDescription>
                  Article summaries. Smaller text-only models work fine here.
                </Settings.ItemDescription>
              </Settings.ItemDetails>
              <Settings.ItemControl>
                <Input.Root
                  data-size="sm"
                  value={provider.models.summary}
                  onChange={(e) =>
                    patchProvider({
                      models: { ...provider.models, summary: e.target.value },
                    })
                  }
                />
              </Settings.ItemControl>
            </Settings.Item>
          </Settings.List>
        </Settings.Section>
      ) : null}

      {!isOff ? (
        <Settings.Section>
          <Settings.SectionTitle>Privacy</Settings.SectionTitle>
          <Settings.List>
            <Settings.Item>
              <Settings.ItemDetails>
                <Settings.ItemTitle>Send Images to Provider</Settings.ItemTitle>
                <Settings.ItemDescription>
                  Applies to cloud tiers. Local providers always keep bytes on
                  this machine.
                </Settings.ItemDescription>
              </Settings.ItemDetails>
              <Settings.ItemControl>
                <Switch.Root
                  checked={provider.sendImages}
                  onCheckedChange={(v) => patchProvider({ sendImages: v })}
                  disabled={provider.kind === "local"}
                />
              </Settings.ItemControl>
            </Settings.Item>

            {isCloud ? (
              <Settings.Item>
                <Settings.ItemDetails>
                  <Settings.ItemTitle>Daily Budget (USD)</Settings.ItemTitle>
                  <Settings.ItemDescription>
                    Pause cloud providers once today's usage crosses this
                    number. Leave empty for unlimited.
                  </Settings.ItemDescription>
                </Settings.ItemDetails>
                <Settings.ItemControl>
                  <Input.Root
                    data-size="sm"
                    type="number"
                    value={
                      provider.dailyBudgetUsd === null
                        ? ""
                        : String(provider.dailyBudgetUsd)
                    }
                    onChange={(e) => {
                      const raw = e.target.value.trim();
                      patchProvider({
                        dailyBudgetUsd: raw === "" ? null : Number(raw),
                      });
                    }}
                  />
                </Settings.ItemControl>
              </Settings.Item>
            ) : null}
          </Settings.List>
        </Settings.Section>
      ) : null}
    </Settings.Page>
  );
}
