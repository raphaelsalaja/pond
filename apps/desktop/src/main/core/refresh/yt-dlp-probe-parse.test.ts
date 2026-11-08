import { describe, expect, it } from "vitest";
import type { z } from "zod";
import {
  frameSourceOf,
  toDownloadProbe,
  YtdlpProbeInfoSchema,
} from "./yt-dlp-probe-parse";

type ProbeFixture = z.input<typeof YtdlpProbeInfoSchema>;

function info(fixture: ProbeFixture) {
  return YtdlpProbeInfoSchema.parse(fixture);
}

const youtube = info({
  _type: "video",
  id: "abc",
  title: "  A talk  ",
  uploader: "Channel",
  duration: 600,
  webpage_url: "https://www.youtube.com/watch?v=abc",
  webpage_url_domain: "youtube.com",
  thumbnails: [
    { url: "https://i.ytimg.com/small.jpg", width: 120, preference: -10 },
    { url: "https://i.ytimg.com/max.jpg", width: 1280, preference: 0 },
  ],
  heatmap: [
    { start_time: 0, end_time: 6, value: 0.25 },
    { start_time: 6, end_time: 12, value: 0.5 },
    { start_time: 12, end_time: 12, value: 1 },
  ],
  chapters: [{ start_time: 0, end_time: 300, title: "Intro" }],
  formats: [
    {
      format_id: "sb0",
      format_note: "storyboard",
      ext: "mhtml",
      width: 160,
      height: 90,
      columns: 5,
      rows: 5,
      fragments: [
        { url: "https://i.ytimg.com/sb/0.jpg", duration: 250 },
        { url: "https://i.ytimg.com/sb/1.jpg", duration: 250 },
        { url: "https://i.ytimg.com/sb/2.jpg", duration: 100 },
      ],
    },
    {
      format_id: "sb1",
      format_note: "storyboard",
      ext: "mhtml",
      width: 48,
      height: 27,
      columns: 10,
      rows: 10,
      fragments: [{ url: "https://i.ytimg.com/sb/s.jpg", duration: 600 }],
    },
    {
      format_id: "140",
      vcodec: "none",
      acodec: "mp4a.40.2",
      abr: 129,
      filesize: 9_000,
    },
    {
      format_id: "251",
      vcodec: "none",
      acodec: "opus",
      abr: 140,
      filesize: 10_000,
    },
    {
      format_id: "137",
      vcodec: "avc1",
      acodec: "none",
      height: 1080,
      fps: 30,
      tbr: 2000,
      filesize: 100_000,
    },
    {
      format_id: "248",
      vcodec: "vp9",
      acodec: "none",
      height: 1080,
      fps: 30,
      tbr: 1500,
      filesize: 80_000,
    },
    {
      format_id: "136",
      vcodec: "avc1",
      acodec: "none",
      height: 720,
      fps: 30,
      tbr: 1000,
      url: "https://v/720",
    },
    {
      format_id: "18",
      ext: "mp4",
      vcodec: "avc1",
      acodec: "mp4a",
      height: 360,
      fps: 30,
      tbr: 400,
      filesize_approx: 30_000,
      url: "https://v/360",
      protocol: "https",
      http_headers: { "User-Agent": "UA" },
    },
  ],
  subtitles: {
    en: [{ ext: "vtt", name: "English" }],
    live_chat: [{ ext: "json" }],
  },
  automatic_captions: {
    "en-orig": [{ ext: "vtt", name: "English (Original)" }],
    "fr-orig": [{ ext: "vtt", name: "French (Original)" }],
    de: [{ ext: "vtt", name: "German" }],
  },
});

describe("toDownloadProbe", () => {
  const probe = toDownloadProbe(youtube, "https://youtu.be/abc", "youtube");
  if (probe.kind !== "single") throw new Error("expected a single probe");

  it("reads the basics", () => {
    expect(probe.title).toBe("A talk");
    expect(probe.site).toBe("youtube.com");
    expect(probe.author).toBe("Channel");
    expect(probe.thumbnail).toBe("https://i.ytimg.com/max.jpg");
    expect(probe.duration).toBe(600);
  });

  it("normalizes the heatmap and drops empty spans", () => {
    expect(probe.heatmap).toEqual([
      { start: 0, end: 6, value: 0.5 },
      { start: 6, end: 12, value: 1 },
    ]);
  });

  it("picks the sharpest storyboard and lays out its sheets", () => {
    expect(probe.storyboard).toEqual({
      tileWidth: 160,
      tileHeight: 90,
      columns: 5,
      rows: 5,
      interval: 10,
      sheets: [
        { url: "https://i.ytimg.com/sb/0.jpg", start: 0, duration: 250 },
        { url: "https://i.ytimg.com/sb/1.jpg", start: 250, duration: 250 },
        { url: "https://i.ytimg.com/sb/2.jpg", start: 500, duration: 100 },
      ],
    });
  });

  it("keeps yt-dlp's pick per height with video and audio sizes combined", () => {
    expect(probe.videoOptions).toEqual([
      { height: 1080, fps: 30, size: 90_000 },
      { height: 720, fps: 30, size: 75_000_000 + 10_000 },
      { height: 360, fps: 30, size: 30_000 },
    ]);
    expect(probe.audioSize).toBe(10_000);
  });

  it("previews the stream that carries sound and picture", () => {
    expect(probe.preview).toBe("https://v/360");
  });

  it("lists uploaded captions and original-language automatic captions", () => {
    expect(probe.captions).toEqual([
      { lang: "en", name: "English", automatic: false },
      { lang: "fr-orig", name: "French", automatic: true },
    ]);
  });
});

describe("toDownloadProbe playlists", () => {
  it("reads flat entries", () => {
    const probe = toDownloadProbe(
      info({
        _type: "playlist",
        title: "Mix",
        webpage_url: "https://www.youtube.com/playlist?list=PL",
        entries: [
          {
            url: "https://www.youtube.com/watch?v=1",
            title: "One",
            duration: 60,
          },
          { url: "not-a-url", title: "Bad" },
          { url: "https://www.youtube.com/watch?v=2", duration: null },
        ],
      }),
      "https://www.youtube.com/playlist?list=PL",
      "youtube",
    );
    expect(probe.kind).toBe("playlist");
    if (probe.kind !== "playlist") return;
    expect(probe.site).toBe("youtube.com");
    expect(probe.entries).toEqual([
      {
        url: "https://www.youtube.com/watch?v=1",
        title: "One",
        duration: 60,
        thumbnail: null,
      },
      {
        url: "https://www.youtube.com/watch?v=2",
        title: "Untitled",
        duration: null,
        thumbnail: null,
      },
    ]);
  });
});

describe("frameSourceOf", () => {
  it("prefers the smallest direct stream", () => {
    expect(frameSourceOf(youtube)).toEqual({
      url: "https://v/360",
      headers: { "User-Agent": "UA" },
      duration: 600,
    });
  });

  it("needs a duration", () => {
    expect(frameSourceOf(info({ formats: [] }))).toBeNull();
  });
});

describe("formats without codec names", () => {
  const archive = info({
    _type: "video",
    title: "Big Buck Bunny",
    duration: 596,
    webpage_url: "https://archive.org/details/BigBuckBunny_124",
    formats: [
      {
        format_id: "1",
        url: "https://ia/360.mp4",
        protocol: "https",
        height: 360,
        filesize: 61_000_000,
      },
      {
        format_id: "2",
        url: "https://ia/720.avi",
        protocol: "https",
        height: 720,
        filesize: 332_000_000,
      },
    ],
  });

  it("treats a format with a height as video", () => {
    const probe = toDownloadProbe(
      archive,
      "https://archive.org/details/BigBuckBunny_124",
      "web",
    );
    if (probe.kind !== "single") throw new Error("expected a single probe");
    expect(probe.videoOptions.map((option) => option.height)).toEqual([
      720, 360,
    ]);
    expect(probe.videoOptions[0]?.size).toBe(332_000_000);
  });

  it("samples frames from it", () => {
    expect(frameSourceOf(archive)?.url).toBe("https://ia/360.mp4");
  });

  it("previews the file a browser can play", () => {
    const probe = toDownloadProbe(archive, "https://archive.org", "web");
    expect(probe.kind === "single" && probe.preview).toBe("https://ia/360.mp4");
  });
});

describe("preview streams", () => {
  const single = (formats: ProbeFixture["formats"]) => {
    const probe = toDownloadProbe(
      info({ _type: "video", duration: 10, formats }),
      "https://example.com/v",
      "web",
    );
    if (probe.kind !== "single") throw new Error("expected a single probe");
    return probe.preview;
  };

  it("picks the sharpest stream up to 720p", () => {
    expect(
      single([
        { url: "https://v/480.mp4", height: 480, acodec: "aac" },
        { url: "https://v/720.mp4", height: 720, acodec: "aac" },
        { url: "https://v/1080.mp4", height: 1080, acodec: "aac" },
      ]),
    ).toBe("https://v/720.mp4");
  });

  it("skips HLS and streams that need a cookie or referer", () => {
    expect(
      single([
        {
          url: "https://v/a.m3u8",
          ext: "mp4",
          height: 720,
          protocol: "m3u8_native",
        },
        {
          url: "https://v/b.mp4",
          height: 480,
          http_headers: { Referer: "https://example.com" },
        },
      ]),
    ).toBeNull();
  });

  it("plays audio when the link has no video", () => {
    expect(
      single([{ url: "https://a/s.mp3", vcodec: "none", acodec: "mp3" }]),
    ).toBe("https://a/s.mp3");
  });
});
