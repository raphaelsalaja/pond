export function isoDurationToMillis(input: string): number | null {
  const m = input.match(
    /^([+-]?)P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?$/,
  );
  if (!m) return null;
  const [, signRaw = "", y = "0", mo = "0", w = "0", d = "0"] = m;
  const days = Number(y) * 365 + Number(mo) * 30 + Number(w) * 7 + Number(d);
  if (!Number.isFinite(days) || days === 0) return 0;
  const sign = signRaw === "-" ? -1 : 1;
  return sign * days * 86_400_000;
}
