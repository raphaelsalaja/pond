export function downsamplePeaks(
  samples: Float32Array,
  buckets: number,
): Array<number> {
  if (buckets <= 0) {
    return [];
  }
  const peaks = Array.from({ length: buckets }, () => 0);
  if (samples.length === 0) {
    return peaks;
  }
  const width = samples.length / buckets;
  for (let index = 0; index < buckets; index += 1) {
    const start = Math.floor(index * width);
    const end = Math.max(start + 1, Math.floor((index + 1) * width));
    let peak = 0;
    for (
      let sample = start;
      sample < end && sample < samples.length;
      sample += 1
    ) {
      peak = Math.max(peak, Math.abs(samples[sample] ?? 0));
    }
    peaks[index] = peak;
  }
  return peaks;
}
