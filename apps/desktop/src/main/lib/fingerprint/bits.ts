export function popcount32(value: number): number {
  let bits = value - ((value >>> 1) & 0x55555555);
  bits = (bits & 0x33333333) + ((bits >>> 2) & 0x33333333);
  bits = (bits + (bits >>> 4)) & 0x0f0f0f0f;
  return Math.imul(bits, 0x01010101) >>> 24;
}

const LOW_32 = 0xffffffffn;

export function popcount64(value: bigint): number {
  return (
    popcount32(Number(value & LOW_32)) +
    popcount32(Number((value >> 32n) & LOW_32))
  );
}

export function hamming64(left: bigint, right: bigint): number {
  return popcount64(left ^ right);
}
