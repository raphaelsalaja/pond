import { useEffect, useMemo } from "react";
import { composeContentDescription } from "@/features/saves/lib/content-description";
import {
  collectIdentityRows,
  type DetailRow,
} from "@/features/saves/lib/detail";
import {
  pickAuthorAvatarUrl,
  pickSourceIconUrl,
} from "@/features/saves/lib/media/url";
import { ensureRawJson } from "@/features/saves/lib/raw-json";
import type { Save } from "@/features/saves/types";
import { accountRefsFromSync } from "@/features/search/query";
import { getSourceIcon, getSourceLogo } from "@/features/sources";
import { usePrefs } from "@/shared/state/prefs";
import { useSave } from "./use-saves";

type SourceIcon = ReturnType<typeof getSourceIcon>;

interface SaveDetailView {
  save: Save | undefined;
  rows: DetailRow[];
  description: string;
  colors: string[];
  avatarUrl: string | null;
  sourceLogo: string | null;
  sourceIcon: SourceIcon;
}

export function useSaveDetail(id: string): SaveDetailView {
  const save = useSave(id);
  const [sync] = usePrefs("sync");

  const rawJson = save?.rawJson;
  useEffect(() => {
    void rawJson;
    void ensureRawJson(id);
  }, [id, rawJson]);

  return useMemo<SaveDetailView>(() => {
    if (!save) {
      return {
        save: undefined,
        rows: [],
        description: "",
        colors: [],
        avatarUrl: null,
        sourceLogo: null,
        sourceIcon: null,
      };
    }

    return {
      save,
      rows: collectIdentityRows(save, accountRefsFromSync(sync)),
      description: composeContentDescription(save),
      colors: save.dominantColors?.slice(0, 8) ?? [],
      avatarUrl: pickAuthorAvatarUrl(save),
      sourceLogo:
        getSourceLogo(save.source) ??
        (save.source === "web" ? pickSourceIconUrl(save) : null),
      sourceIcon: getSourceIcon(save.source),
    };
  }, [save, sync]);
}
