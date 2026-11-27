import { JSDOM } from "jsdom";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { CAPTURE_ROOT_ATTRIBUTE } from "./screenshot-dom";
import {
  assessCapturedScheme,
  buildCaptureSchemeEvidenceExpression,
  captureSchemeDomEvidenceSchema,
  captureWithSchemeValidation,
} from "./screenshot-scheme";
import type {
  CaptureColorScheme,
  CaptureSchemeDomEvidence,
  CaptureSchemeRect,
  CapturedSchemeSample,
} from "./screenshot-scheme";
import {
  acquireTwitterThemeLock,
  createTwitterThemeCookieControl,
} from "./screenshot-theme";
import type { ThemeCookieJar } from "./screenshot-theme";

const WIDTH = 320;
const HEIGHT = 240;
const MEDIA_RECT = { x: 32, y: 72, width: 256, height: 144 };

async function postPng(args: {
  background: string;
  media?: string;
}): Promise<Buffer> {
  const media = args.media
    ? `<rect x="${MEDIA_RECT.x}" y="${MEDIA_RECT.y}" width="${MEDIA_RECT.width}" height="${MEDIA_RECT.height}" fill="${args.media}"/>`
    : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}"><rect width="${WIDTH}" height="${HEIGHT}" fill="${args.background}"/>${media}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

function evidence(
  scheme: CaptureColorScheme,
  options: { direct?: boolean; mediaRects?: Array<CaptureSchemeRect> } = {},
): CaptureSchemeDomEvidence {
  const light = scheme === "light";
  return {
    backgrounds: [
      {
        luminance: light ? 1 : 0,
        weight: 4,
        direct: options.direct ?? true,
      },
    ],
    foregrounds: [{ luminance: light ? 0 : 1, weight: 4, direct: false }],
    mediaRects: options.mediaRects ?? [],
  };
}

async function sample(
  scheme: CaptureColorScheme,
  options: { direct?: boolean; darkMedia?: boolean } = {},
): Promise<CapturedSchemeSample> {
  const light = scheme === "light";
  const mediaRects = options.darkMedia ? [MEDIA_RECT] : [];
  const pngArgs: Parameters<typeof postPng>[0] = {
    background: light ? "#ffffff" : "#000000",
  };
  if (options.darkMedia) pngArgs.media = "#050505";
  return {
    bytes: await postPng(pngArgs),
    width: WIDTH,
    height: HEIGHT,
    cssWidth: WIDTH,
    cssHeight: HEIGHT,
    evidence: evidence(scheme, {
      direct: options.direct ?? true,
      mediaRects,
    }),
  };
}

async function validateSample(
  scheme: CaptureColorScheme,
  current: CapturedSchemeSample,
) {
  let corrections = 0;
  const result = await captureWithSchemeValidation({
    scheme,
    attempt: async () => current,
    correct: async () => {
      corrections += 1;
      return false;
    },
  });
  return { result, corrections };
}

describe("screenshot scheme validation", () => {
  it("accepts a light capture with light chrome", async () => {
    const { result, corrections } = await validateSample(
      "light",
      await sample("light"),
    );

    expect(result.ok).toBe(true);
    expect(corrections).toBe(0);
  });

  it("accepts a dark capture with dark chrome", async () => {
    const { result, corrections } = await validateSample(
      "dark",
      await sample("dark"),
    );

    expect(result.ok).toBe(true);
    expect(corrections).toBe(0);
  });

  it("retries and rejects a persistent light mismatch", async () => {
    let attempts = 0;
    let corrections = 0;
    const darkSample = await sample("dark");

    const result = await captureWithSchemeValidation({
      scheme: "light",
      attempt: async () => {
        attempts += 1;
        return darkSample;
      },
      correct: async () => {
        corrections += 1;
        return true;
      },
    });

    expect(result).toEqual({ ok: false, reason: "scheme_mismatch" });
    expect(attempts).toBe(2);
    expect(corrections).toBe(1);
  });

  it("retries and rejects a persistent dark mismatch", async () => {
    let attempts = 0;
    let corrections = 0;
    const lightSample = await sample("light");

    const result = await captureWithSchemeValidation({
      scheme: "dark",
      attempt: async () => {
        attempts += 1;
        return lightSample;
      },
      correct: async () => {
        corrections += 1;
        return true;
      },
    });

    expect(result).toEqual({ ok: false, reason: "scheme_mismatch" });
    expect(attempts).toBe(2);
    expect(corrections).toBe(1);
  });

  it("accepts light after a correction reload", async () => {
    let current: CaptureColorScheme = "dark";
    let corrections = 0;

    const result = await captureWithSchemeValidation({
      scheme: "light",
      attempt: async () => sample(current),
      correct: async () => {
        corrections += 1;
        current = "light";
        return true;
      },
    });

    expect(result.ok).toBe(true);
    expect(corrections).toBe(1);
  });

  it("accepts dark after a correction reload", async () => {
    let current: CaptureColorScheme = "light";
    let corrections = 0;

    const result = await captureWithSchemeValidation({
      scheme: "dark",
      attempt: async () => sample(current),
      correct: async () => {
        corrections += 1;
        current = "dark";
        return true;
      },
    });

    expect(result.ok).toBe(true);
    expect(corrections).toBe(1);
  });

  it("collects chrome colors and media masks from the capture root", () => {
    const dom = new JSDOM(
      `<article data-pond-capture style="background-color: rgb(255, 255, 255)"><span style="color: rgb(0, 0, 0)">post text</span><img src="https://example.com/dark.jpg"></article>`,
      { url: "https://x.com/a/status/1", runScripts: "outside-only" },
    );
    /** SAFETY: the fixture script only gives the fixed elements deterministic layout boxes. */
    dom.window.eval(`
      Element.prototype.getBoundingClientRect = function () {
        if (this.tagName === "ARTICLE") return { left: 10, top: 20, right: 310, bottom: 220, width: 300, height: 200, x: 10, y: 20 };
        if (this.tagName === "IMG") return { left: 40, top: 90, right: 290, bottom: 210, width: 250, height: 120, x: 40, y: 90 };
        if (this.tagName === "SPAN") return { left: 20, top: 30, right: 160, bottom: 55, width: 140, height: 25, x: 20, y: 30 };
        return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 };
      };
    `);

    /** SAFETY: the expression is built by the module under test from fixed fixture values. */
    const raw = dom.window.eval(
      buildCaptureSchemeEvidenceExpression(CAPTURE_ROOT_ATTRIBUTE, {
        x: 10,
        y: 20,
        width: 300,
        height: 200,
      }),
    );
    const evidence = captureSchemeDomEvidenceSchema.parse(raw);

    expect(evidence.backgrounds[0]?.luminance).toBeCloseTo(1);
    expect(evidence.backgrounds[0]?.direct).toBe(true);
    expect(evidence.foregrounds[0]).toMatchObject({ luminance: 0 });
    expect(evidence.mediaRects).toEqual([
      { x: 30, y: 70, width: 250, height: 120 },
    ]);
  });

  it("does not mistake masked dark media in a light post for dark chrome", async () => {
    const current = await sample("light", { direct: false, darkMedia: true });

    await expect(assessCapturedScheme(current)).resolves.toBe("light");
    const { result } = await validateSample("light", current);
    expect(result.ok).toBe(true);
  });

  it("rejects light pixels when foreground evidence still belongs to dark chrome", async () => {
    const current = await sample("light");
    current.evidence.foregrounds = [{ luminance: 1, weight: 5, direct: false }];

    await expect(assessCapturedScheme(current)).resolves.toBe("conflict");
    const { result } = await validateSample("light", current);
    expect(result).toEqual({ ok: false, reason: "scheme_mismatch" });
  });

  it("does not accept matching pixels without page chrome evidence", async () => {
    const current = await sample("light");
    current.evidence = { backgrounds: [], foregrounds: [], mediaRects: [] };

    await expect(assessCapturedScheme(current)).resolves.toBe("unknown");
    const { result } = await validateSample("light", current);
    expect(result).toEqual({ ok: false, reason: "scheme_mismatch" });
  });
});

function memoryCookieJar(initial: Array<Electron.Cookie>): ThemeCookieJar & {
  values(host: string): Array<string>;
} {
  const cookies = new Map<string, Electron.Cookie>();
  const keyFor = (
    domain: string,
    path: string,
    name: string,
    hostOnly: boolean,
  ) =>
    `${hostOnly ? "host" : "domain"}:${domain.replace(/^\./, "")}:${path}:${name}`;
  const write = (cookie: Electron.Cookie) => {
    cookies.set(
      keyFor(
        cookie.domain ?? "",
        cookie.path ?? "/",
        cookie.name,
        cookie.hostOnly === true,
      ),
      cookie,
    );
  };
  for (const cookie of initial) write(cookie);
  return {
    get: async (filter) =>
      Array.from(cookies.values()).filter(
        (cookie) => !filter.name || cookie.name === filter.name,
      ),
    set: async (details) => {
      const host = new URL(details.url).host;
      const domain = details.domain ?? host;
      const cookie: Electron.Cookie = {
        name: details.name ?? "",
        value: details.value ?? "",
        domain,
        hostOnly: details.domain === undefined,
        path: details.path ?? "/",
        secure: details.secure,
        httpOnly: details.httpOnly,
        sameSite: details.sameSite ?? "lax",
      };
      if (details.expirationDate !== undefined) {
        cookie.expirationDate = details.expirationDate;
      }
      write(cookie);
    },
    remove: async (url, name) => {
      const host = new URL(url).host;
      for (const [key, cookie] of cookies) {
        const domain = cookie.domain?.replace(/^\./, "") ?? "";
        if (
          cookie.name === name &&
          (domain === host || host.endsWith(`.${domain}`))
        ) {
          cookies.delete(key);
        }
      }
    },
    values: (host) =>
      Array.from(cookies.values())
        .filter((cookie) => {
          const domain = cookie.domain?.replace(/^\./, "") ?? "";
          return (
            cookie.name === "night_mode" &&
            (domain === host || host.endsWith(`.${domain}`))
          );
        })
        .map((cookie) => cookie.value),
  };
}

describe("twitter theme cookie control", () => {
  it("forces both schemes and restores the account cookie", async () => {
    const jar = memoryCookieJar([
      {
        name: "night_mode",
        value: "1",
        domain: ".x.com",
        path: "/",
        secure: true,
        sameSite: "lax",
      },
    ]);
    const control = createTwitterThemeCookieControl(jar);

    await expect(control.setScheme("light")).resolves.toBe(true);
    expect(jar.values("x.com")).toEqual(["0"]);
    await expect(control.setScheme("dark")).resolves.toBe(true);
    expect(jar.values("x.com")).toEqual(["2"]);

    await control.restore();
    expect(jar.values("x.com")).toEqual(["1"]);
  });
});

describe("twitter theme lock", () => {
  it("serializes overlapping captures", async () => {
    const first = await acquireTwitterThemeLock("partition-a");
    let secondAcquired = false;
    const secondPromise = acquireTwitterThemeLock("partition-a").then(
      (release) => {
        secondAcquired = true;
        return release;
      },
    );

    await Promise.resolve();
    expect(secondAcquired).toBe(false);
    first();
    const second = await secondPromise;
    expect(secondAcquired).toBe(true);
    second();
  });

  it("stops waiting when the capture aborts", async () => {
    const first = await acquireTwitterThemeLock("partition-b");
    const controller = new AbortController();
    const waiting = acquireTwitterThemeLock("partition-b", controller.signal);
    const rejection = expect(waiting).rejects.toThrow(
      "twitter theme lock wait aborted",
    );

    controller.abort();
    await rejection;
    first();
  });
});
