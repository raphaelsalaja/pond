import type { Save } from "@pond/schema/db";
import { useCallback } from "react";
import { usePrefs } from "../pool/prefs";
import { reveal, useIsRevealed } from "../pool/reveal";

export interface NsfwGuard {
  shouldBlur: boolean;
  isFlagged: boolean;
  reveal: () => void;
}

export function useNsfwGuard(
  save: Pick<Save, "id" | "nsfwScore" | "nsfwLabel">,
): NsfwGuard {
  const [safety, , ready] = usePrefs("safety");
  const revealed = useIsRevealed(save.id);

  const isFlagged = ready ? isSaveFlagged(save, safety) : false;
  const shouldBlur = ready && safety.blur === "on" && isFlagged && !revealed;

  const doReveal = useCallback(() => {
    reveal.reveal(save.id);
  }, [save.id]);

  return { shouldBlur, isFlagged, reveal: doReveal };
}

function isSaveFlagged(
  save: Pick<Save, "nsfwScore" | "nsfwLabel">,
  safety: ReturnType<typeof usePrefs<"safety">>[0],
): boolean {
  if (typeof save.nsfwScore !== "number") return false;
  if (save.nsfwScore < safety.threshold) return false;
  const label = save.nsfwLabel;
  if (label === "porn") return safety.categories.porn;
  if (label === "hentai") return safety.categories.hentai;
  if (label === "sexy") return safety.categories.sexy;
  return false;
}
