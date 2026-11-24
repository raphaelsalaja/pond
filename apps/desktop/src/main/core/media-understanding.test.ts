import { describe, expect, it, vi } from "vitest";
import { loadModel } from "./agent/adapter";
import {
  createMediaUnderstanding,
  MediaUnderstandingError,
} from "./media-understanding";
import type {
  MediaUnderstandingGenerationInput,
  MediaUnderstandingOperationalMetric,
} from "./media-understanding";

const connection = {
  provider: "ollama" as const,
  modelId: "gemma4:e2b",
  apiKey: null,
  baseUrl: "http://127.0.0.1:11434",
};

async function testModel() {
  const model = await loadModel({
    provider: connection.provider,
    model: connection.modelId,
    apiKey: connection.apiKey,
    baseUrl: connection.baseUrl,
  });
  if (!model) {
    throw new Error("Expected the Ollama adapter to load.");
  }
  return model;
}

function request(signal = new AbortController().signal) {
  return {
    mimeType: "image/png",
    bytes: Buffer.from("png bytes"),
    signal,
    connection,
    fallbackOnFailure: false,
  };
}

describe("media understanding", () => {
  it("sends image bytes before the fixed caption prompt and stamps the model", async () => {
    const model = await testModel();
    const calls: Array<MediaUnderstandingGenerationInput> = [];
    const service = createMediaUnderstanding({
      loadModel: async () => model,
      generateText: async (input) => {
        calls.push(input);
        return { text: "  A red bicycle beside a brick wall.  " };
      },
    });

    const input = request();
    await expect(service.caption(input)).resolves.toEqual({
      text: "A red bicycle beside a brick wall.",
      model: "ollama/gemma4:e2b:caption:v1",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.messages).toEqual([
      {
        role: "user",
        content: [
          {
            type: "file",
            data: Buffer.from("png bytes"),
            mediaType: "image/png",
          },
          {
            type: "text",
            text: "Describe the image in exactly one factual sentence. State only visible facts. Do not add a preamble and do not guess anyone's identity.",
          },
        ],
      },
    ]);
    expect(calls[0]?.maxOutputTokens).toBe(96);
    expect(calls[0]?.abortSignal).not.toBe(input.signal);
    expect(calls[0]?.abortSignal.aborted).toBe(false);
    expect(calls[0]).not.toHaveProperty("reasoning");
    expect(calls[0]?.providerOptions).toEqual({
      ollama: { reasoningEffort: "none" },
    });
  });

  it("uses a separate OCR budget and preserves visible text", async () => {
    const model = await testModel();
    const calls: Array<MediaUnderstandingGenerationInput> = [];
    const service = createMediaUnderstanding({
      loadModel: async () => model,
      generateText: async (input) => {
        calls.push(input);
        return { text: "TOTAL 12.50\r\nTHANK YOU" };
      },
    });

    await expect(service.ocr(request())).resolves.toEqual({
      text: "TOTAL 12.50\nTHANK YOU",
      model: "ollama/gemma4:e2b:ocr:v1",
    });
    expect(calls[0]?.messages[0]?.content[1]).toEqual({
      type: "text",
      text: "Transcribe only the visible text verbatim in reading order. Preserve line breaks. Return an empty response when no text is visible. Do not add a preamble or commentary.",
    });
    expect(calls[0]?.maxOutputTokens).toBe(2048);
  });

  it("allows an empty OCR result", async () => {
    const model = await testModel();
    const service = createMediaUnderstanding({
      loadModel: async () => model,
      generateText: async () => ({ text: " \n " }),
    });

    await expect(service.ocr(request())).resolves.toEqual({
      text: "",
      model: "ollama/gemma4:e2b:ocr:v1",
    });
  });

  it.each([
    ["empty-output", "   "],
    ["model-chatter", "Sure, here is a caption: A red bicycle."],
    ["model-chatter", "The image shows a red bicycle."],
    ["output-too-long", "x".repeat(501)],
  ] as const)("rejects invalid captions with %s", async (reason, text) => {
    const model = await testModel();
    const service = createMediaUnderstanding({
      loadModel: async () => model,
      generateText: async () => ({ text }),
    });

    await expect(service.caption(request())).rejects.toMatchObject({ reason });
  });

  it("rejects obvious OCR chatter", async () => {
    const model = await testModel();
    const service = createMediaUnderstanding({
      loadModel: async () => model,
      generateText: async () => ({ text: "Here is the visible text: TOTAL" }),
    });

    await expect(service.ocr(request())).rejects.toMatchObject({
      reason: "model-chatter",
    });
  });

  it("enforces the larger OCR character limit", async () => {
    const model = await testModel();
    const service = createMediaUnderstanding({
      loadModel: async () => model,
      generateText: async () => ({ text: "x".repeat(16_001) }),
    });

    await expect(service.ocr(request())).rejects.toMatchObject({
      reason: "output-too-long",
    });
  });

  it("returns structured failures for unavailable models and generation errors", async () => {
    const unavailable = createMediaUnderstanding({
      loadModel: async () => null,
      generateText: async () => ({ text: "unused" }),
    });
    await expect(unavailable.caption(request())).rejects.toMatchObject({
      reason: "model-unavailable",
      task: "caption",
    });

    const model = await testModel();
    const failed = createMediaUnderstanding({
      loadModel: async () => model,
      generateText: async () => {
        throw new Error("runtime disconnected");
      },
    });
    await expect(failed.ocr(request())).rejects.toMatchObject({
      reason: "generation-failed",
      task: "ocr",
    });
  });

  it("aborts an in-flight generation without converting it to a generic failure", async () => {
    const controller = new AbortController();
    const model = await testModel();
    const service = createMediaUnderstanding({
      loadModel: async () => model,
      generateText: ({ abortSignal }) =>
        new Promise((_resolve, reject) => {
          abortSignal.addEventListener(
            "abort",
            () => reject(new Error("transport stopped")),
            { once: true },
          );
        }),
    });

    const result = service.caption(request(controller.signal));
    controller.abort();
    await expect(result).rejects.toMatchObject({ reason: "aborted" });
  });

  it("times out a disconnected local runtime and records content-free metrics", async () => {
    vi.useFakeTimers();
    try {
      const model = await testModel();
      const metrics: Array<MediaUnderstandingOperationalMetric> = [];
      const service = createMediaUnderstanding({
        timeoutMs: 500,
        loadModel: async () => model,
        generateText: ({ abortSignal }) =>
          new Promise((_resolve, reject) => {
            abortSignal.addEventListener(
              "abort",
              () => reject(new Error("runtime disconnected")),
              { once: true },
            );
          }),
        metrics: { record: (metric) => metrics.push(metric) },
        now: (() => {
          let time = 1000;
          return () => (time += 25);
        })(),
      });

      const result = service.caption({
        ...request(),
        connection: { ...connection, baseUrl: "http://127.0.0.1:11438" },
      });
      const timedOut = expect(result).rejects.toMatchObject({
        reason: "timeout",
      });
      await vi.advanceTimersByTimeAsync(500);
      await timedOut;
      expect(metrics).toEqual([
        {
          modelId: "gemma4:e2b",
          task: "caption",
          temperature: "cold",
          durationMs: 25,
          imageBytes: 9,
          outcome: "timeout",
          fallbackUsed: false,
        },
      ]);
      expect(JSON.stringify(metrics)).not.toContain("png bytes");
      expect(JSON.stringify(metrics)).not.toContain("Describe the image");
    } finally {
      vi.useRealTimers();
    }
  });

  it("records warm success without fallback and bounds the model identifier", async () => {
    const model = await testModel();
    const metrics: Array<MediaUnderstandingOperationalMetric> = [];
    const service = createMediaUnderstanding({
      loadModel: async () => model,
      generateText: async () => ({ text: "A bicycle." }),
      metrics: { record: (metric) => metrics.push(metric) },
      now: () => 100,
    });
    const longConnection = {
      ...connection,
      modelId: "m".repeat(500),
      baseUrl: "http://127.0.0.1:11439",
    };

    await service.caption({ ...request(), connection: longConnection });
    await service.caption({ ...request(), connection: longConnection });

    expect(metrics.map((metric) => metric.temperature)).toEqual([
      "cold",
      "warm",
    ]);
    expect(metrics[0]?.modelId).toHaveLength(200);
    expect(metrics[0]).toMatchObject({ outcome: "ok", fallbackUsed: false });
  });

  it("maps aborts to a structured reason before loading a model", async () => {
    const controller = new AbortController();
    controller.abort();
    let loaded = false;
    const service = createMediaUnderstanding({
      loadModel: async () => {
        loaded = true;
        return null;
      },
      generateText: async () => ({ text: "unused" }),
    });

    await expect(service.caption(request(controller.signal))).rejects.toEqual(
      new MediaUnderstandingError("aborted", "caption"),
    );
    expect(loaded).toBe(false);
  });

  it("rejects non-image or empty input before loading a model", async () => {
    let loaded = false;
    const service = createMediaUnderstanding({
      loadModel: async () => {
        loaded = true;
        return null;
      },
      generateText: async () => ({ text: "unused" }),
    });

    await expect(
      service.caption({ ...request(), mimeType: "application/pdf" }),
    ).rejects.toMatchObject({ reason: "invalid-input" });
    await expect(
      service.caption({ ...request(), bytes: Buffer.alloc(0) }),
    ).rejects.toMatchObject({ reason: "invalid-input" });
    expect(loaded).toBe(false);
  });
});
