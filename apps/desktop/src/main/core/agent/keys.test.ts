import { describe, expect, it } from "vitest";
import { checkProviderKey, fetchProviderModels } from "./keys";

const bases = {
  ollamaBaseUrl: "http://127.0.0.1:11434/v1",
  lmstudioBaseUrl: "http://127.0.0.1:1234/v1",
  sapientBaseUrl: "http://127.0.0.1:11435/v1",
  azureResourceName: "pond-openai",
};

describe("checkProviderKey", () => {
  it("accepts an openai key when models are available", async () => {
    const result = await checkProviderKey(
      { provider: "openai", key: "sk-test", ...bases },
      async () => Response.json({ data: [] }),
    );
    expect(result).toEqual({ ok: true });
  });

  it("rejects unauthorized credentials", async () => {
    const result = await checkProviderKey(
      { provider: "openai", key: "sk-bad", ...bases },
      async () => new Response(null, { status: 401 }),
    );
    if (result.ok) throw new Error("Expected a failure.");
    expect(result.error).toMatch(/OpenAI rejected this key/);
  });

  it("checks ollama without a bearer token", async () => {
    const result = await checkProviderKey(
      { provider: "ollama", key: "", ...bases },
      async (url, options) => {
        expect(url).toBe("http://127.0.0.1:11434/v1/models");
        expect(options?.headers).toEqual({});
        expect(options?.signal).toBeInstanceOf(AbortSignal);
        return Response.json({ data: [] });
      },
    );
    expect(result.ok).toBe(true);
  });

  it("accepts a fresh Sapient server that lists no cached models yet", async () => {
    const result = await checkProviderKey(
      { provider: "sapient", key: "", ...bases },
      async (url, options) => {
        expect(url).toBe("http://127.0.0.1:11435/v1/models");
        expect(options?.headers).toEqual({});
        return Response.json({
          object: "list",
          data: [],
          active_model: null,
          resident_models: [],
        });
      },
    );
    expect(result).toEqual({ ok: true });
  });

  it.each([429, 500, 503])(
    "does not call a discovery failure (%i) an invalid key",
    async (status) => {
      const result = await checkProviderKey(
        { provider: "openai", key: "sk-test", ...bases },
        async () => new Response(null, { status }),
      );
      if (result.ok) throw new Error("Expected a failure.");
      expect(result.error).toContain(`HTTP ${status}`);
      expect(result.error).not.toContain("rejected");
    },
  );

  it.each([404, 405, 501])(
    "allows LM Studio without model listing (%i)",
    async (status) => {
      const result = await checkProviderKey(
        { provider: "lmstudio", key: "", ...bases },
        async () => new Response(null, { status }),
      );
      expect(result).toEqual({ ok: true });
    },
  );

  it("does not treat a malformed endpoint response as a valid model list", async () => {
    const result = await checkProviderKey(
      { provider: "lmstudio", key: "", ...bases },
      async () => Response.json({ message: "not a models endpoint" }),
    );
    expect(result).toEqual({
      ok: false,
      error: "LM Studio returned an invalid model list.",
    });
  });

  it("does not discover Azure models without a resource name", async () => {
    const result = await checkProviderKey(
      {
        provider: "azure",
        key: "azure-key",
        ...bases,
        azureResourceName: "",
      },
      async () => {
        throw new Error("Must not request another provider");
      },
    );
    expect(result).toEqual({
      ok: false,
      error: "Enter a resource name first.",
    });
  });

  it("keeps Gemini credentials out of the URL", async () => {
    const result = await checkProviderKey(
      { provider: "gemini", key: "secret", ...bases },
      async (url, options) => {
        expect(url).toBe(
          "https://generativelanguage.googleapis.com/v1beta/models",
        );
        expect(options?.headers).toEqual({ "x-goog-api-key": "secret" });
        return Response.json({ models: [] });
      },
    );
    expect(result.ok).toBe(true);
  });

  it("checks OpenCode Go through its authenticated models endpoint", async () => {
    const result = await checkProviderKey(
      { provider: "opencode-go", key: "go-test", ...bases },
      async (url, options) => {
        expect(url).toBe("https://opencode.ai/inference/go/v1/models");
        expect(options?.headers).toEqual({
          Authorization: "Bearer go-test",
        });
        return Response.json({ data: [{ id: "deepseek-v4-flash" }] });
      },
    );
    expect(result).toEqual({ ok: true });
  });

  it("validates OpenRouter credentials against the authenticated key endpoint", async () => {
    const result = await checkProviderKey(
      { provider: "openrouter", key: "sk-or-test", ...bases },
      async (url, options) => {
        expect(url).toBe("https://openrouter.ai/api/v1/key");
        expect(options?.headers).toEqual({
          Authorization: "Bearer sk-or-test",
        });
        return Response.json({ data: { label: "test" } });
      },
    );
    expect(result.ok).toBe(true);
  });

  it("rejects invalid OpenRouter credentials even though its catalog is public", async () => {
    const result = await checkProviderKey(
      { provider: "openrouter", key: "sk-or-bad", ...bases },
      async () => new Response(null, { status: 401 }),
    );
    expect(result).toEqual({
      ok: false,
      error:
        "OpenRouter rejected this key or its permissions. Check it in Settings.",
    });
  });
});

describe("complete model discovery", () => {
  it("requests only text-capable OpenRouter models", async () => {
    const result = await fetchProviderModels(
      { provider: "openrouter", key: "sk-or-test", ...bases },
      async (url, options) => {
        expect(url).toBe(
          "https://openrouter.ai/api/v1/models/user?output_modalities=text",
        );
        expect(options?.headers).toEqual({
          Authorization: "Bearer sk-or-test",
        });
        return Response.json({ data: [] });
      },
    );
    expect(result.ok).toBe(true);
  });

  it("augments Ollama inventory with capabilities from the native detail endpoint", async () => {
    const requests: Array<{
      url: string;
      method?: string;
      body?: BodyInit | null;
    }> = [];
    const result = await fetchProviderModels(
      { provider: "ollama", key: "", ...bases },
      async (url, options) => {
        requests.push({
          url: String(url),
          method: options?.method,
          body: options?.body,
        });
        if (String(url).endsWith("/v1/models")) {
          return Response.json({ data: [{ id: "gemma4:e2b" }] });
        }
        return Response.json({
          capabilities: ["completion", "vision", "tools"],
        });
      },
    );

    expect(requests).toEqual([
      {
        url: "http://127.0.0.1:11434/v1/models",
        method: undefined,
        body: undefined,
      },
      {
        url: "http://127.0.0.1:11434/api/show",
        method: "POST",
        body: JSON.stringify({ model: "gemma4:e2b" }),
      },
    ]);
    expect(result).toEqual({
      ok: true,
      json: {
        data: [
          {
            id: "gemma4:e2b",
            capabilities: ["completion", "vision", "tools"],
          },
        ],
      },
    });
  });

  it("keeps Ollama inventory when its native detail endpoint is unavailable", async () => {
    const result = await fetchProviderModels(
      { provider: "ollama", key: "", ...bases },
      async (url) =>
        String(url).endsWith("/v1/models")
          ? Response.json({ data: [{ id: "llama3.2" }] })
          : new Response(null, { status: 404 }),
    );

    expect(result).toEqual({
      ok: true,
      json: { data: [{ id: "llama3.2" }] },
    });
  });

  it("keeps other Ollama models conservative when one detail lookup fails", async () => {
    const result = await fetchProviderModels(
      { provider: "ollama", key: "", ...bases },
      async (url, options) => {
        if (String(url).endsWith("/v1/models")) {
          return Response.json({
            data: [{ id: "vision-model" }, { id: "unknown-model" }],
          });
        }
        return options?.body === JSON.stringify({ model: "vision-model" })
          ? Response.json({ capabilities: ["completion", "vision"] })
          : new Response(null, { status: 500 });
      },
    );

    expect(result).toEqual({
      ok: true,
      json: {
        data: [
          {
            id: "vision-model",
            capabilities: ["completion", "vision"],
          },
          { id: "unknown-model" },
        ],
      },
    });
  });

  it.each(["gemini", "anthropic"] as const)(
    "collects every %s page",
    async (provider) => {
      const urls: string[] = [];
      const result = await fetchProviderModels(
        { provider, key: "test-key", ...bases },
        async (url) => {
          urls.push(String(url));
          const first = urls.length === 1;
          return Response.json(
            provider === "gemini"
              ? {
                  models: [{ name: first ? "first" : "second" }],
                  nextPageToken: first ? "next" : undefined,
                }
              : {
                  data: [{ id: first ? "first" : "second" }],
                  has_more: first,
                  last_id: first ? "next" : "second",
                },
          );
        },
      );
      expect(result).toEqual({
        ok: true,
        json:
          provider === "gemini"
            ? { models: [{ name: "first" }, { name: "second" }] }
            : { data: [{ id: "first" }, { id: "second" }] },
      });
      expect(urls).toHaveLength(2);
      expect(urls[1]).toContain(
        provider === "gemini" ? "pageToken=next" : "after_id=next",
      );
    },
  );

  it("rejects repeated cursors instead of looping forever", async () => {
    let calls = 0;
    const result = await fetchProviderModels(
      { provider: "gemini", key: "test-key", ...bases },
      async () => {
        calls++;
        return Response.json({ models: [], nextPageToken: "same" });
      },
    );
    expect(result).toEqual({
      ok: false,
      error: "Google returned an invalid model list.",
    });
    expect(calls).toBe(2);
  });
});
