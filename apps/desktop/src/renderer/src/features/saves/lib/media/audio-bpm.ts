const MIN_BPM = 60;
const MAX_BPM = 180;

export function estimateBpm(
  samples: Float32Array,
  sampleRate: number,
): number | null {
  if (samples.length < sampleRate || sampleRate <= 0) {
    return null;
  }
  const step = Math.max(1, Math.round(sampleRate / 4000));
  const envelope = new Float32Array(Math.ceil(samples.length / step));
  let energy = 0;
  for (
    let index = 0, out = 0;
    index < samples.length;
    index += step, out += 1
  ) {
    let peak = 0;
    const end = Math.min(samples.length, index + step);
    for (let sample = index; sample < end; sample += 1) {
      peak = Math.max(peak, Math.abs(samples[sample] ?? 0));
    }
    envelope[out] = peak;
    energy += peak;
  }
  if (energy < 1e-6) {
    return null;
  }
  const rate = sampleRate / step;
  const minLag = Math.round((60 / MAX_BPM) * rate);
  const maxLag = Math.min(
    envelope.length - 1,
    Math.round((60 / MIN_BPM) * rate),
  );
  if (maxLag <= minLag) {
    return null;
  }
  let bestLag = minLag;
  let best = 0;
  const scores = new Float32Array(maxLag + 1);
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let sum = 0;
    const count = envelope.length - lag;
    for (let index = 0; index + lag < envelope.length; index += 1) {
      sum += (envelope[index] ?? 0) * (envelope[index + lag] ?? 0);
    }
    const score = count > 0 ? sum / count : 0;
    scores[lag] = score;
    if (score > best) {
      best = score;
      bestLag = lag;
    }
  }
  if (best <= 0) {
    return null;
  }
  while (bestLag >= minLag * 2) {
    const half = Math.round(bestLag / 2);
    if ((scores[half] ?? 0) < best * 0.5) {
      break;
    }
    bestLag = half;
    best = scores[bestLag] ?? best;
  }
  return Math.round((60 * rate) / bestLag);
}
