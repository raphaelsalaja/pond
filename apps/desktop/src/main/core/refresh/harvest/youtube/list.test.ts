import { runInNewContext } from "node:vm";
import { JSDOM } from "jsdom";
import { expect, it } from "vitest";
import { buildYoutubeListExpression } from "./list";

const lockup = `<yt-lockup-view-model>
  <div>
    <a class="ytLockupViewModelContentImage" href="/watch?v=fOT0BUpITw8&amp;list=WL&amp;index=1">
      <img src="https://i.ytimg.com/vi/fOT0BUpITw8/hqdefault.jpg">
    </a>
    <yt-lockup-metadata-view-model>
      <h3><a class="ytLockupMetadataViewModelTitle" href="/watch?v=fOT0BUpITw8&amp;list=WL&amp;index=1">BELLAKEO</a></h3>
      <div class="ytContentMetadataViewModelMetadataRow"><a href="/channel/UCzrM_068Odho89mTRrrxqbA">Peso Pluma</a></div>
      <div class="ytContentMetadataViewModelMetadataRow"><span>768M</span><span>2y ago</span></div>
    </yt-lockup-metadata-view-model>
  </div>
</yt-lockup-view-model>`;

function runList(body: string, loggedIn: boolean) {
  const { window } = new JSDOM(
    `<!doctype html><html><body>${body}</body></html>`,
    { url: "https://www.youtube.com/playlist?list=WL" },
  );
  return runInNewContext(buildYoutubeListExpression({ knownIds: [] }), {
    document: window.document,
    location: window.location,
    window: { scrollBy: () => {}, innerHeight: 800 },
    ytcfg: { get: (key: string) => (key === "LOGGED_IN" ? loggedIn : null) },
    URL,
    setTimeout: (fn: () => void) => setTimeout(fn, 0),
  });
}

it("reports a signed-out session instead of an empty list", async () => {
  await expect(
    runList(
      "<yt-alert-renderer>The playlist does not exist.</yt-alert-renderer>",
      false,
    ),
  ).resolves.toEqual({ ok: false, reason: "auth_required" });
});

it("reads playlist items rendered as lockups", async () => {
  const result = await runList(lockup, true);
  expect(result.entries).toEqual([
    {
      sourceId: "fOT0BUpITw8",
      url: "https://www.youtube.com/watch?v=fOT0BUpITw8",
      title: "BELLAKEO",
      author: "Peso Pluma",
      mediaUrl: "https://i.ytimg.com/vi/fOT0BUpITw8/hqdefault.jpg",
      mediaType: "video",
    },
  ]);
});
