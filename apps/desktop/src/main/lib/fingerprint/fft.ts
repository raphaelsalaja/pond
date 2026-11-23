interface Twiddles {
  cos: Float64Array;
  sin: Float64Array;
  reverse: Uint32Array;
}

const cache = new Map<number, Twiddles>();

function twiddles(size: number): Twiddles {
  const cached = cache.get(size);
  if (cached) return cached;
  const bits = Math.log2(size);
  if (!Number.isInteger(bits))
    throw new Error("FFT size must be a power of two");
  const cos = new Float64Array(size / 2);
  const sin = new Float64Array(size / 2);
  for (let index = 0; index < size / 2; index++) {
    cos[index] = Math.cos((2 * Math.PI * index) / size);
    sin[index] = -Math.sin((2 * Math.PI * index) / size);
  }
  const reverse = new Uint32Array(size);
  for (let index = 0; index < size; index++) {
    let value = 0;
    for (let bit = 0; bit < bits; bit++)
      value |= ((index >>> bit) & 1) << (bits - 1 - bit);
    reverse[index] = value;
  }
  const table = { cos, sin, reverse };
  cache.set(size, table);
  return table;
}

/** In-place iterative radix-2 FFT. */
export function fft(real: Float64Array, imag: Float64Array): void {
  const size = real.length;
  const { cos, sin, reverse } = twiddles(size);
  for (let index = 0; index < size; index++) {
    const swap = reverse[index] as number;
    if (swap <= index) continue;
    const r = real[index] as number;
    real[index] = real[swap] as number;
    real[swap] = r;
    const i = imag[index] as number;
    imag[index] = imag[swap] as number;
    imag[swap] = i;
  }
  for (let span = 2; span <= size; span *= 2) {
    const half = span / 2;
    const stride = size / span;
    for (let start = 0; start < size; start += span) {
      for (let offset = 0; offset < half; offset++) {
        const wr = cos[offset * stride] as number;
        const wi = sin[offset * stride] as number;
        const even = start + offset;
        const odd = even + half;
        const oddReal = real[odd] as number;
        const oddImag = imag[odd] as number;
        const tr = wr * oddReal - wi * oddImag;
        const ti = wr * oddImag + wi * oddReal;
        real[odd] = (real[even] as number) - tr;
        imag[odd] = (imag[even] as number) - ti;
        real[even] = (real[even] as number) + tr;
        imag[even] = (imag[even] as number) + ti;
      }
    }
  }
}
