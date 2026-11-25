/** Ported from xeet's `tools/sync-upstream.mjs` (Apache-2.0). */

interface Table {
  tag: string;
  data: Buffer;
}

function checksum(buf: Buffer): number {
  let sum = 0;
  const end = buf.length & ~3;
  for (let i = 0; i < end; i += 4) sum = (sum + buf.readUInt32BE(i)) >>> 0;
  if (end < buf.length) {
    const tail = Buffer.alloc(4);
    buf.copy(tail, 0, end);
    sum = (sum + tail.readUInt32BE(0)) >>> 0;
  }
  return sum;
}

interface Face {
  version: number;
  tables: Array<Table>;
}

function readFace(ttc: Buffer, face: number): Face {
  if (ttc.toString("latin1", 0, 4) !== "ttcf") {
    throw new Error("not a font collection");
  }
  const offset = ttc.readUInt32BE(12 + face * 4);
  const count = ttc.readUInt16BE(offset + 4);
  const tables: Array<Table> = [];
  for (let i = 0; i < count; i++) {
    const rec = offset + 12 + i * 16;
    const start = ttc.readUInt32BE(rec + 8);
    const length = ttc.readUInt32BE(rec + 12);
    tables.push({
      tag: ttc.toString("latin1", rec, rec + 4),
      data: Buffer.from(ttc.subarray(start, start + length)),
    });
  }
  return { version: ttc.readUInt32BE(offset), tables };
}

function writeFont(version: number, tables: Array<Table>): Buffer {
  tables.sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
  const head = tables.find((t) => t.tag === "head");
  if (head && head.data.length >= 12) head.data.writeUInt32BE(0, 8);
  const dir = 12 + tables.length * 16;
  let size = dir;
  for (const t of tables) size += (t.data.length + 3) & ~3;
  const out = Buffer.alloc(size);
  const pow2 = 1 << Math.floor(Math.log2(tables.length));
  out.writeUInt32BE(version, 0);
  out.writeUInt16BE(tables.length, 4);
  out.writeUInt16BE(pow2 * 16, 6);
  out.writeUInt16BE(Math.floor(Math.log2(tables.length)), 8);
  out.writeUInt16BE(tables.length * 16 - pow2 * 16, 10);
  let cursor = dir;
  let headAt = -1;
  tables.forEach((t, i) => {
    const rec = 12 + i * 16;
    out.write(t.tag, rec, 4, "latin1");
    out.writeUInt32BE(checksum(t.data), rec + 4);
    out.writeUInt32BE(cursor, rec + 8);
    out.writeUInt32BE(t.data.length, rec + 12);
    if (t.tag === "head") headAt = cursor;
    t.data.copy(out, cursor);
    cursor += (t.data.length + 3) & ~3;
  });
  if (headAt >= 0) {
    out.writeUInt32BE((0xb1_b0_af_ba - checksum(out)) >>> 0, headAt + 8);
  }
  return out;
}

/** Face 0 of Apple Color Emoji with only the `ppem` sbix strike: ~20 MB instead of ~190 MB. */
export function extractEmojiStrike(ttc: Buffer, ppem = 64): Buffer {
  const { version, tables } = readFace(ttc, 0);
  const sbixTable = tables.find((t) => t.tag === "sbix");
  if (!sbixTable) throw new Error("emoji font has no sbix table");
  const sbix = sbixTable.data;
  const strikes = sbix.readUInt32BE(4);
  const offsets = Array.from({ length: strikes }, (_, i) =>
    sbix.readUInt32BE(8 + i * 4),
  );
  const chosen = offsets.findIndex((o) => sbix.readUInt16BE(o) === ppem);
  if (chosen < 0) throw new Error(`emoji font has no ${ppem} ppem strike`);
  const start = offsets[chosen] ?? 0;
  const end = offsets[chosen + 1] ?? sbix.length;
  const strike = sbix.subarray(start, end);
  const next = Buffer.alloc(12 + strike.length);
  next.writeUInt16BE(sbix.readUInt16BE(0), 0);
  next.writeUInt16BE(sbix.readUInt16BE(2), 2);
  next.writeUInt32BE(1, 4);
  next.writeUInt32BE(12, 8);
  strike.copy(next, 12);
  sbixTable.data = next;
  return writeFont(version, tables);
}
