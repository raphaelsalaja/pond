/// <reference lib="webworker" />
import { RawImage } from "@huggingface/transformers";
import {
  coreClipAesthetic,
  coreClipImage,
  coreEmbedAudio,
  coreEmbedText,
  coreEmbedTexts,
  coreEmbedVideoFrames,
  coreFlorence,
  coreSensitiveContent,
  coreTranscribe,
  disposeInferenceModels,
} from "./inference-core";
import type {
  InferenceRequest,
  InferenceResponse,
  InferenceResult,
  SerializedImage,
} from "./inference-protocol";

declare const self: DedicatedWorkerGlobalScope;

function toRawImage(s: SerializedImage): RawImage {
  return new RawImage(
    new Uint8ClampedArray(s.data),
    s.width,
    s.height,
    s.channels,
  );
}

async function handle(
  req: InferenceRequest,
): Promise<{ result: InferenceResult; transfer: Array<Transferable> }> {
  switch (req.op) {
    case "dispose":
      await disposeInferenceModels();
      return { result: "", transfer: [] };
    case "florence":
      return {
        result: await coreFlorence(toRawImage(req.image), req.task),
        transfer: [],
      };
    case "clipImage": {
      const vec = await coreClipImage(toRawImage(req.image));
      return { result: vec, transfer: [vec.buffer] };
    }
    case "clipAesthetic":
      return {
        result: await coreClipAesthetic(toRawImage(req.image), req.labels),
        transfer: [],
      };
    case "sensitiveContent":
      return {
        result: await coreSensitiveContent(req.images.map(toRawImage)),
        transfer: [],
      };
    case "embedText": {
      const vec = await coreEmbedText(req.text);
      return { result: vec, transfer: [vec.buffer] };
    }
    case "embedTexts": {
      const vecs = await coreEmbedTexts(req.texts);
      return { result: vecs, transfer: vecs.map((v) => v.buffer) };
    }
    case "embedAudio": {
      const vec = await coreEmbedAudio(req.audio);
      return { result: vec, transfer: [vec.buffer] };
    }
    case "embedVideoFrames": {
      const vec = await coreEmbedVideoFrames(
        req.frames.map((frame) => ({
          image: toRawImage(frame.image),
          timestamp: frame.timestamp,
        })),
        req.duration,
      );
      return { result: vec, transfer: [vec.buffer] };
    }
    case "transcribe":
      return {
        result: await coreTranscribe(req.audio),
        transfer: [],
      };
  }
}

let execution = Promise.resolve();
self.onmessage = (event: MessageEvent<InferenceRequest>) => {
  const req = event.data;
  execution = execution.then(async () => {
    try {
      const { result, transfer } = await handle(req);
      const response: InferenceResponse = { id: req.id, ok: true, result };
      self.postMessage(response, transfer);
    } catch (error) {
      const response: InferenceResponse = {
        id: req.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
      self.postMessage(response);
    }
  });
};
