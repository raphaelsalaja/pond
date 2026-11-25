import type { ApiFailure } from "./api";
import type { AlfredSave } from "./responses";

interface AlfredModifier {
  arg: string;
  subtitle: string;
}

/** @see https://www.alfredapp.com/help/workflows/inputs/script-filter/json/ */
export interface AlfredItem {
  uid?: string;
  title: string;
  subtitle?: string;
  arg?: string;
  valid?: boolean;
  quicklookurl?: string;
  mods?: { cmd?: AlfredModifier; alt?: AlfredModifier };
}

/** Local files carry a `pond:local/<id>` URL, which only Pond can open. */
function webUrl(url: string): string | null {
  return /^https?:\/\//i.test(url) ? url : null;
}

export function saveItems(saves: ReadonlyArray<AlfredSave>): Array<AlfredItem> {
  return saves.map((save) => {
    const pond = `pond://item/${save.id}`;
    const link = webUrl(save.url);
    const meta = [save.siteName ?? save.source, save.tags.join(", ")]
      .filter(Boolean)
      .join(" · ");
    const item: AlfredItem = {
      uid: save.id,
      title: save.title || "Untitled",
      subtitle: meta,
      arg: link ?? pond,
      mods: { cmd: { arg: pond, subtitle: "Open in Pond" } },
    };
    if (link) {
      item.quicklookurl = link;
      item.mods = { ...item.mods, alt: { arg: link, subtitle: "Copy Link" } };
    }
    return item;
  });
}

export function errorItems(failure: ApiFailure): Array<AlfredItem> {
  switch (failure) {
    case "offline":
      return [
        {
          title: "Pond isn't running",
          subtitle: "Open Pond, then try again.",
          arg: "pond://library",
        },
      ];
    case "unauthorized":
      return [
        {
          title: "Pond didn't accept the token",
          subtitle:
            "Create a token in Settings, then paste it in the workflow.",
          arg: "pond://settings/local-api",
        },
      ];
    case "forbidden":
      return [
        {
          title: "The token can't search",
          subtitle: "Give it Search Saves access in Settings.",
          arg: "pond://settings/local-api",
        },
      ];
    case "failed":
      return [
        {
          title: "Pond couldn't search",
          subtitle: "Try again in a moment.",
          valid: false,
        },
      ];
  }
}
