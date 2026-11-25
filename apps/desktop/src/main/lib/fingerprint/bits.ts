export function popcount32(value: number): number {
  let bits = value - ((value >>> 1) & 0x55_55_55_55);
  bits = (bits & 0x33_33_33_33) + ((bits >>> 2) & 0x33_33_33_33);
  bits = (bits + (bits >>> 4)) & 0x0f_0f_0f_0f;
  return Math.imul(bits, 0x01_01_01_01) >>> 24;
}

const LOW_32 = 0xff_ff_ff_ffn;

export function popcount64(value: bigint): number {
  return (
    popcount32(Number(value & LOW_32)) +
    popcount32(Number((value >> 32n) & LOW_32))
  );
}

export function hamming64(left: bigint, right: bigint): number {
  return popcount64(left ^ right);
}
