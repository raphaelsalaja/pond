import {
  EXTENSION_LIKE_SOURCES,
  sourceFlag,
} from "@pond/schema/browser-extension";
import {
  EXTERNAL_SOURCE_IDS,
  type ExternalSource,
  sourceLabel,
} from "@pond/schema/sources";
import { Settings, Switch } from "@pond/ui";
import { sourcesSkippingLikes } from "@shared/import-scope";
import { Fragment } from "react";
import { useAccounts } from "@/features/sources";
import { usePrefs } from "@/shared/state/prefs";

const SAVES = {
  twitter: "Save posts when you bookmark them.",
  instagram: "Save posts when you save them to a collection.",
  pinterest: "Save Pins when you save them to a board.",
  arena: "Save blocks when you connect them to a channel.",
  cosmos: "Save elements when you save them to a cluster.",
  tiktok: "Save videos when you add them to Favorites.",
  youtube: "Save videos when you add them to a playlist.",
  reddit: "Save posts when you save them.",
  threads: "Save posts when you save them.",
  github: "Save repositories when you star them.",
  substack: "Save posts when you save them.",
  tumblr: "Save posts with the Pond toolbar button.",
  savee: "Save items with the Pond toolbar button.",
  behance: "Save projects with the Pond toolbar button.",
  vimeo: "Save videos with the Pond toolbar button.",
  dribbble: "Save shots with the Pond toolbar button.",
  unsplash: "Save photos with the Pond toolbar button.",
  bluesky: "Save posts with the Pond toolbar button.",
  marked: "Save refs with the Pond toolbar button.",
} satisfies Record<ExternalSource, string>;

const LIKE_SOURCES: ReadonlySet<ExternalSource> = new Set(
  EXTENSION_LIKE_SOURCES,
);

export function ExtensionSources() {
  const [extension, patch, loaded] = usePrefs("extension");
  const { accounts } = useAccounts();
  const skipping = sourcesSkippingLikes(accounts);

  return (
    <Settings.List>
      {EXTERNAL_SOURCE_IDS.map((source) => {
        const label = sourceLabel(source);
        const on = sourceFlag(extension.enabled, source);
        const upvotes = source === "reddit";
        const accountSkips = skipping.has(source);
        return (
          <Fragment key={source}>
            <Settings.Item>
              <Settings.ItemDetails>
                <Settings.ItemTitle>{label}</Settings.ItemTitle>
                <Settings.ItemDescription>
                  {SAVES[source]}
                </Settings.ItemDescription>
              </Settings.ItemDetails>
              <Settings.ItemControl>
                <Switch.Root
                  aria-label={label}
                  checked={on}
                  disabled={!loaded}
                  onCheckedChange={(next) =>
                    void patch({
                      enabled: { ...extension.enabled, [source]: next },
                    })
                  }
                />
              </Settings.ItemControl>
            </Settings.Item>
            {LIKE_SOURCES.has(source) ? (
              <Settings.Item disabled={!on || accountSkips}>
                <Settings.ItemDetails>
                  <Settings.ItemTitle>
                    {upvotes ? "Include Upvotes" : "Include Likes"}
                  </Settings.ItemTitle>
                  <Settings.ItemDescription>
                    {accountSkips
                      ? `Off while your ${label} Account skips ${upvotes ? "Upvotes" : "Likes"}.`
                      : upvotes
                        ? "Also save posts you upvote."
                        : "Also save what you like."}
                  </Settings.ItemDescription>
                </Settings.ItemDetails>
                <Settings.ItemControl>
                  <Switch.Root
                    aria-label={`${label} ${upvotes ? "Upvotes" : "Likes"}`}
                    checked={
                      !accountSkips && sourceFlag(extension.likes, source)
                    }
                    disabled={!loaded || !on || accountSkips}
                    onCheckedChange={(next) =>
                      void patch({
                        likes: { ...extension.likes, [source]: next },
                      })
                    }
                  />
                </Settings.ItemControl>
              </Settings.Item>
            ) : null}
          </Fragment>
        );
      })}
    </Settings.List>
  );
}
