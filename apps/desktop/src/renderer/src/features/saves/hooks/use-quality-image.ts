import { useEffect, useState } from "react";
import { qualityDecodeBudget } from "@/features/saves/lib/quality-decode-budget";

export function useQualityImage(
  thumbnail: string,
  sharper: string,
  enabled: boolean,
): string {
  const key = `${enabled}\n${thumbnail}\n${sharper}`;
  const [decoded, setDecoded] = useState({ key, sharp: false });
  if (decoded.key !== key) {
    setDecoded({ key, sharp: false });
  }
  const source = decoded.key === key && decoded.sharp ? sharper : thumbnail;

  useEffect(() => {
    if (!enabled || thumbnail === sharper) {
      return;
    }
    let current = true;
    const cancel = qualityDecodeBudget.schedule(async () => {
      const image = new Image();
      image.decoding = "async";
      image.src = sharper;
      await image.decode();
      if (current) {
        setDecoded({ key, sharp: true });
      }
    });
    return () => {
      current = false;
      cancel();
    };
  }, [enabled, key, sharper, thumbnail]);

  return source;
}
