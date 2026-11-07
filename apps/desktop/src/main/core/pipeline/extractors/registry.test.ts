import { SOURCES } from "@pond/schema/db";
import {
  DEFAULT_RATE_PROFILE,
  EXTERNAL_SOURCE_IDS,
  syncConfigFor,
} from "@pond/schema/sources";
import { describe, expect, it } from "vitest";
import { sourceIdFromUrl } from "../url";
import { EXTRACTOR_LIST, extractorFor, resolveExtractor } from ".";

describe("extractor registry", () => {
  it("has exactly one extractor per capture source", () => {
    const sources = EXTERNAL_SOURCE_IDS.filter((id) => id !== "mymind");
    expect(EXTRACTOR_LIST).toHaveLength(sources.length);
    for (const id of sources) {
      expect(extractorFor(id)?.source).toBe(id);
    }
  });

  it("imports mymind cards without a page extractor", () => {
    expect(extractorFor("mymind")).toBeNull();
    expect(resolveExtractor("https://access.mymind.com/").source).toBe("web");
    expect(sourceIdFromUrl("mymind", "https://access.mymind.com/")).toBeNull();
  });

  it("has no extractor for local", () => {
    expect(extractorFor("local")).toBeNull();
  });

  it("uses unique extractor ids", () => {
    const ids = EXTRACTOR_LIST.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("sync config totality", () => {
  for (const source of SOURCES) {
    it(`resolves a valid sync config for ${source}`, () => {
      const cfg = syncConfigFor(source);
      expect(["cursor", "scroll", "full", "none"]).toContain(cfg.strategy);
      expect(cfg.rate.minDelayMs).toBeGreaterThan(0);
      expect(cfg.rate.jitterFraction).toBeGreaterThanOrEqual(0);
      expect(cfg.rate.jitterFraction).toBeLessThanOrEqual(1);
      expect(cfg.rate.maxPerWindow).toBeGreaterThan(0);
      expect(cfg.rate.windowMs).toBeGreaterThan(0);
      expect(cfg.rate.firstSyncSlowdown).toBeGreaterThanOrEqual(1);
      expect(cfg.rate.maxPerHour).toBeGreaterThan(cfg.rate.maxPerWindow);
      expect(cfg.rate.maxPerDay).toBeGreaterThan(cfg.rate.maxPerHour);
    });
  }

  it("paces the sources that block accounts harder than the default", () => {
    for (const source of ["twitter", "instagram"] as const) {
      const rate = syncConfigFor(source).rate;
      expect(rate.maxPerHour).toBeLessThan(DEFAULT_RATE_PROFILE.maxPerHour);
      expect(rate.maxPerDay).toBeLessThan(DEFAULT_RATE_PROFILE.maxPerDay);
    }
  });

  it("treats web and local as non-syncing", () => {
    expect(syncConfigFor("web").strategy).toBe("none");
    expect(syncConfigFor("local").strategy).toBe("none");
  });
});

for (const extractor of EXTRACTOR_LIST) {
  describe(`extractor: ${extractor.id}`, () => {
    const tests = extractor.tests ?? [];

    it("declares at least one embedded test", () => {
      expect(tests.length).toBeGreaterThan(0);
    });

    for (const sample of tests) {
      it(`routes ${sample.url}`, () => {
        expect(extractor.suitable(new URL(sample.url))).toBe(true);
        expect(resolveExtractor(sample.url).id).toBe(extractor.id);
      });

      if (sample.id !== undefined) {
        it(`parses source id from ${sample.url}`, () => {
          expect(sourceIdFromUrl(extractor.source, sample.url)).toBe(sample.id);
        });
      }

      if (sample.profile) {
        const { url, handle } = sample.profile;
        it(`parses handle from ${url}`, () => {
          const segments = new URL(url).pathname.split("/").filter(Boolean);
          expect(extractor.handleFromPath?.(segments)).toBe(handle);
        });
      }
    }
  });
}
