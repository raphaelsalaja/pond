import { describe, expect, it } from "vitest";
import {
  cuesToSubtitles,
  cuesToTranscript,
  formatTimestamp,
  parseCaptions,
} from "./captions-transcript";

const ROLLING_VTT = `WEBVTT
Kind: captions
Language: en

00:00:00.320 --> 00:00:02.990 align:start position:0%
 
hello<00:00:00.640><c> and</c><00:00:01.000><c> welcome</c>

00:00:02.990 --> 00:00:03.000 align:start position:0%
hello and welcome
 

00:00:03.000 --> 00:00:05.200 align:start position:0%
hello and welcome
to<00:00:03.400><c> the</c><c> show</c>

00:00:35.000 --> 00:00:37.000
it&#39;s &amp; done
`;

const SRT = `1
00:00:01,000 --> 00:00:02,500
First line

2
00:01:02,000 --> 00:01:04,000
<i>Second</i> line
`;

describe("parseCaptions", () => {
  it("strips inline timing and dedupes rolling lines", () => {
    expect(parseCaptions(ROLLING_VTT)).toEqual([
      { start: 0.32, end: 2.99, text: "hello and welcome" },
      { start: 3, end: 5.2, text: "to the show" },
      { start: 35, end: 37, text: "it's & done" },
    ]);
  });

  it("reads SRT", () => {
    expect(parseCaptions(SRT)).toEqual([
      { start: 1, end: 2.5, text: "First line" },
      { start: 62, end: 64, text: "Second line" },
    ]);
  });
});

describe("cuesToTranscript", () => {
  const cues = parseCaptions(ROLLING_VTT);

  it("groups lines into timestamped paragraphs", () => {
    expect(cuesToTranscript(cues)).toBe(
      "0:00 hello and welcome to the show\n\n0:35 it's & done",
    );
  });

  it("keeps only the trimmed range, timed from the clip start", () => {
    expect(cuesToTranscript(cues, { start: 30, end: 40 })).toBe(
      "0:05 it's & done",
    );
  });
});

describe("formatTimestamp", () => {
  it("adds hours only when needed", () => {
    expect(formatTimestamp(65.9)).toBe("1:05");
    expect(formatTimestamp(3725)).toBe("1:02:05");
  });
});

describe("cuesToSubtitles", () => {
  const cues = [
    { start: 1, end: 2.5, text: "First line" },
    { start: 1, end: 2.5, text: "Second line" },
    { start: 40, end: 42, text: "Later" },
  ];

  it("writes numbered SubRip blocks and joins lines that share a timing", () => {
    expect(cuesToSubtitles(cues, "srt")).toBe(
      "1\n00:00:01,000 --> 00:00:02,500\nFirst line\nSecond line\n\n2\n00:00:40,000 --> 00:00:42,000\nLater\n",
    );
  });

  it("writes a WebVTT header and dotted milliseconds", () => {
    expect(cuesToSubtitles(cues.slice(2), "vtt")).toBe(
      "WEBVTT\n\n00:00:40.000 --> 00:00:42.000\nLater\n",
    );
  });

  it("drops cues outside a trim and shifts the rest to start at zero", () => {
    expect(cuesToSubtitles(cues, "srt", { start: 39, end: 41 })).toBe(
      "1\n00:00:01,000 --> 00:00:02,000\nLater\n",
    );
  });
});
