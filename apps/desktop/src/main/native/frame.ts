import type { JsonValue } from "@pond/schema/json";
import type { NativeMessage } from "@pond/schema/native";
export const MAX_NATIVE_MSG = 8 * 1024 * 1024;
/** Chrome closes the port when the host sends more than 1 MiB; stay below it. */
export const MAX_NATIVE_REPLY = 1024 * 1024 - 4096;

export function encodeFrame(value: NativeMessage): Buffer {
  const payload = Buffer.from(JSON.stringify(value), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(payload.length, 0);
  return Buffer.concat([header, payload]);
}

/** Encodes a reply for the browser, substituting an error that fits the browser's limit. */
export function encodeReplyFrame(value: NativeMessage): Buffer {
  const frame = encodeFrame(value);
  if (frame.length - 4 <= MAX_NATIVE_REPLY) return frame;
  return encodeFrame({ ok: false, error: "too_large" });
}

export type DecodeFrame =
  | { status: "need-more" }
  | { status: "ok"; value: JsonValue }
  | { status: "invalid"; error: string };

/** Length-prefixed JSON: 32-bit little-endian size, then UTF-8 payload. */
export function tryDecodeFrame(buf: Buffer): DecodeFrame {
  if (buf.length < 4) return { status: "need-more" };
  const len = buf.readUInt32LE(0);
  if (len === 0 || len > MAX_NATIVE_MSG) {
    return { status: "invalid", error: "invalid" };
  }
  if (buf.length < 4 + len) return { status: "need-more" };
  try {
    return {
      status: "ok",
      value: JSON.parse(buf.subarray(4, 4 + len).toString("utf8")),
    };
  } catch {
    return { status: "invalid", error: "invalid" };
  }
}
