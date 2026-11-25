import { z } from "zod";
import { statusFeed } from "@/features/downloads/status-feed";
import type { Save } from "@/features/saves/types";

export const REVERSE_SEARCH_ENGINES = [
  {
    key: "google-lens",
    label: "Google Lens",
    url: (u) => `https://lens.google.com/uploadbyurl?url=${u}`,
  },
  {
    key: "yandex",
    label: "Yandex",
    url: (u) => `https://yandex.com/images/search?rpt=imageview&url=${u}`,
  },
  {
    key: "bing",
    label: "Bing",
    url: (u) =>
      `https://www.bing.com/images/search?view=detailv2&iss=sbi&form=SBIVSP&q=imgurl:${u}`,
  },
  {
    key: "tineye",
    label: "TinEye",
    url: (u) => `https://www.tineye.com/search?url=${u}`,
  },
  {
    key: "saucenao",
    label: "SauceNAO",
    url: (u) => `https://saucenao.com/search.php?url=${u}`,
  },
  {
    key: "baidu",
    label: "Baidu",
    url: (_u) => "https://graph.baidu.com/pcpage/index",
    usesImageUrl: false,
  },
  {
    key: "sogou",
    label: "Sogou",
    url: (_u) => "https://pic.sogou.com/ris",
    usesImageUrl: false,
  },
] as const satisfies ReadonlyArray<{
  key: string;
  label: string;
  url: (encoded: string) => string;
  usesImageUrl?: boolean;
}>;

const PublicUrlReplySchema = z
  .object({
    ok: z.boolean().catch(false),
    url: z.string().nullish().catch(null),
  })
  .catch({ ok: false, url: null });

export async function reverseImageSearch(
  save: Save,
  engineKey: string,
): Promise<void> {
  const engine = REVERSE_SEARCH_ENGINES.find((e) => e.key === engineKey);
  if (!engine) return;
  if ("usesImageUrl" in engine && !engine.usesImageUrl) {
    await window.pond.openExternal(engine.url(""));
    return;
  }
  const result = PublicUrlReplySchema.parse(
    await window.pond.query("saves.publicImageUrl", { id: save.id }),
  );
  if (!result.ok || !result.url) {
    statusFeed.error(
      "Reverse Image Search",
      "No public image URL is available for this save.",
    );
    return;
  }
  const encoded = encodeURIComponent(result.url);
  await window.pond.openExternal(engine.url(encoded));
}
