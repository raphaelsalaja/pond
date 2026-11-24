import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const fixtureDirectory = import.meta.dirname;
const sampleRate = 16_000;
const samples = sampleRate;
const wav = Buffer.alloc(44 + samples * 2);

wav.write("RIFF", 0, "ascii");
wav.writeUInt32LE(wav.length - 8, 4);
wav.write("WAVE", 8, "ascii");
wav.write("fmt ", 12, "ascii");
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(sampleRate, 24);
wav.writeUInt32LE(sampleRate * 2, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36, "ascii");
wav.writeUInt32LE(samples * 2, 40);
for (let index = 0; index < samples; index += 1) {
  const envelope = Math.sin((Math.PI * index) / samples);
  const value = Math.sin((2 * Math.PI * 440 * index) / sampleRate);
  wav.writeInt16LE(Math.round(value * envelope * 12_000), 44 + index * 2);
}
await writeFile(resolve(fixtureDirectory, "tone.wav"), wav);

const frameSpecs = [
  {
    name: "frame-0.png",
    background: { r: 28, g: 72, b: 156 },
    foreground: { r: 246, g: 196, b: 64 },
    left: 6,
  },
  {
    name: "frame-1.png",
    background: { r: 20, g: 112, b: 76 },
    foreground: { r: 238, g: 92, b: 78 },
    left: 26,
  },
];
for (const frame of frameSpecs) {
  await sharp({
    create: {
      width: 48,
      height: 48,
      channels: 3,
      background: frame.background,
    },
  })
    .composite([
      {
        input: Buffer.from(
          `<svg width="16" height="28"><rect width="16" height="28" rx="4" fill="rgb(${frame.foreground.r},${frame.foreground.g},${frame.foreground.b})"/></svg>`,
        ),
        left: frame.left,
        top: 10,
      },
    ])
    .png({ compressionLevel: 9 })
    .toFile(resolve(fixtureDirectory, frame.name));
}

await writeFile(
  resolve(fixtureDirectory, "frames.json"),
  `${JSON.stringify(
    {
      duration: 1,
      frames: [
        { path: "frame-0.png", timestamp: 0 },
        { path: "frame-1.png", timestamp: 0.5 },
      ],
    },
    null,
    2,
  )}\n`,
);
