import { useEffect, useState } from "react";
import { qualityDecodeBudget } from "@/features/saves/lib/quality-decode-budget";

export function useQualityImage(
  thumbnail: string,
  sharper: string,
  enabled: boolean,
): string {
  const [source, setSource] = useState(thumbnail);

  useEffect(() => {
    setSource(thumbnail);
    if (!enabled || thumbnail === sharper) return;
    let current = true;
    const cancel = qualityDecodeBudget.schedule(async () => {
      const image = new Image();
      image.decoding = "async";
      image.src = sharper;
      await image.decode();
      if (current) setSource(sharper);
    });
    return () => {
      current = false;
      cancel();
    };
  }, [enabled, sharper, thumbnail]);

  return source;
}
