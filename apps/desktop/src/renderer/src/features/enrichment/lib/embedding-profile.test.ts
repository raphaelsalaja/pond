import { describe, expect, it } from "vitest";
import { createEmbeddingProfileCache } from "./embedding-profile";
import type {
  EmbeddingProfile,
  LoadedEmbeddingProfile,
} from "./embedding-profile";

interface TestProfile extends LoadedEmbeddingProfile {
  instance: number;
}

function testLoader(options?: { failOnce?: EmbeddingProfile }) {
  const loaded: Array<EmbeddingProfile> = [];
  const disposed: Array<number> = [];
  let instance = 0;
  let failed = false;

  return {
    disposed,
    loaded,
    load: async (profile: EmbeddingProfile): Promise<TestProfile> => {
      loaded.push(profile);
      if (profile === options?.failOnce && !failed) {
        failed = true;
        throw new Error("load failed");
      }
      const current = ++instance;
      return {
        profile,
        instance: current,
        dispose: async () => {
          disposed.push(current);
        },
      };
    },
  };
}

describe("embedding profile cache", () => {
  it("reuses repeated requests for the same profile", async () => {
    const loader = testLoader();
    const cache = createEmbeddingProfileCache(loader.load);

    const first = await cache.use("text-image", async (profile) => profile);
    const second = await cache.use("text-image", async (profile) => profile);

    expect(second).toBe(first);
    expect(loader.loaded).toEqual(["text-image"]);
    expect(loader.disposed).toEqual([]);
  });

  it("shares one multimodal model across image and audio requests", async () => {
    const loader = testLoader();
    const cache = createEmbeddingProfileCache(loader.load);

    const image = await cache.use("text-image", async (profile) => profile);
    const audio = await cache.use("text-audio", async (profile) => profile);
    const reusedAudio = await cache.use(
      "text-audio",
      async (profile) => profile,
    );

    expect(audio).toBe(reusedAudio);
    expect(audio).toBe(image);
    expect(loader.loaded).toEqual(["text-image"]);
    expect(loader.disposed).toEqual([]);
  });

  it("can retry after a failed load", async () => {
    const loader = testLoader({ failOnce: "text-audio" });
    const cache = createEmbeddingProfileCache(loader.load);

    await expect(
      cache.use("text-audio", async (profile) => profile),
    ).rejects.toThrow("load failed");
    const recovered = await cache.use("text-audio", async (profile) => profile);

    expect(recovered.profile).toBe("text-audio");
    expect(loader.loaded).toEqual(["text-audio", "text-audio"]);
  });

  it("releases the queue after profile work fails", async () => {
    const loader = testLoader();
    const cache = createEmbeddingProfileCache(loader.load);

    await expect(
      cache.use("text-image", async () => {
        throw new Error("inference failed");
      }),
    ).rejects.toThrow("inference failed");
    const recovered = await cache.use("text-image", async (profile) => profile);

    expect(recovered.profile).toBe("text-image");
    expect(loader.loaded).toEqual(["text-image"]);
  });

  it("serializes image and audio inference without replacing the model", async () => {
    const events: Array<string> = [];
    const { promise: imageGate, resolve: releaseImage } =
      Promise.withResolvers<void>();
    const { promise: imageStarted, resolve: markImageStarted } =
      Promise.withResolvers<void>();
    const cache = createEmbeddingProfileCache(async (profile) => {
      events.push(`load:${profile}`);
      return {
        profile,
        dispose: async () => {
          events.push(`dispose:${profile}`);
        },
      };
    });

    const imageWork = cache.use("text-image", async () => {
      events.push("work:text-image:start");
      markImageStarted();
      await imageGate;
      events.push("work:text-image:end");
    });
    await imageStarted;
    const audioWork = cache.use("text-audio", async () => {
      events.push("work:text-audio");
    });
    await Promise.resolve();

    expect(events).toEqual(["load:text-image", "work:text-image:start"]);

    releaseImage();
    await Promise.all([imageWork, audioWork]);
    expect(events).toEqual([
      "load:text-image",
      "work:text-image:start",
      "work:text-image:end",
      "work:text-audio",
    ]);
  });

  it("releases the model on disposal and reloads for the next request", async () => {
    const loader = testLoader();
    const cache = createEmbeddingProfileCache(loader.load);
    const first = await cache.use("text-image", async (profile) => profile);
    await cache.dispose();
    expect(loader.disposed).toEqual([first.instance]);
    const next = await cache.use("text-audio", async (profile) => profile);
    expect(next).not.toBe(first);
    expect(loader.loaded).toEqual(["text-image", "text-audio"]);
  });
});
