export type TextEncoding = "utf8" | "utf-16le" | "utf-16be" | "windows-1252";

export interface DecodedText {
  text: string;
  encoding: TextEncoding;
  hadBom: boolean;
}

function decodeUtf16Be(bytes: Uint8Array): string {
  const swapped = new Uint8Array(bytes.length - (bytes.length % 2));
  for (let index = 0; index + 1 < bytes.length; index += 2) {
    swapped[index] = bytes[index + 1] ?? 0;
    swapped[index + 1] = bytes[index] ?? 0;
  }
  return new TextDecoder("utf-16le").decode(swapped);
}

function likelyUtf16(bytes: Uint8Array): "utf-16le" | "utf-16be" | null {
  const sample = bytes.subarray(0, Math.min(bytes.length, 4096));
  let evenZeros = 0;
  let oddZeros = 0;
  for (let index = 0; index < sample.length; index += 1) {
    if (sample[index] !== 0) continue;
    if (index % 2 === 0) evenZeros += 1;
    else oddZeros += 1;
  }
  const threshold = Math.max(2, sample.length / 8);
  if (oddZeros > threshold && oddZeros > evenZeros * 2) return "utf-16le";
  if (evenZeros > threshold && evenZeros > oddZeros * 2) return "utf-16be";
  return null;
}

export function decodeTextBytes(input: Uint8Array): DecodedText {
  if (
    input.length >= 3 &&
    input[0] === 0xef &&
    input[1] === 0xbb &&
    input[2] === 0xbf
  ) {
    return {
      text: new TextDecoder("utf-8").decode(input.subarray(3)),
      encoding: "utf8",
      hadBom: true,
    };
  }
  if (input.length >= 2 && input[0] === 0xff && input[1] === 0xfe) {
    return {
      text: new TextDecoder("utf-16le").decode(input.subarray(2)),
      encoding: "utf-16le",
      hadBom: true,
    };
  }
  if (input.length >= 2 && input[0] === 0xfe && input[1] === 0xff) {
    return {
      text: decodeUtf16Be(input.subarray(2)),
      encoding: "utf-16be",
      hadBom: true,
    };
  }
  const utf16 = likelyUtf16(input);
  if (utf16) {
    return {
      text:
        utf16 === "utf-16le"
          ? new TextDecoder("utf-16le").decode(input)
          : decodeUtf16Be(input),
      encoding: utf16,
      hadBom: false,
    };
  }
  try {
    return {
      text: new TextDecoder("utf-8", { fatal: true }).decode(input),
      encoding: "utf8",
      hadBom: false,
    };
  } catch {
    return {
      text: new TextDecoder("windows-1252").decode(input),
      encoding: "windows-1252",
      hadBom: false,
    };
  }
}
