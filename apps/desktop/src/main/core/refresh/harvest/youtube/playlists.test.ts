import { describe, expect, it } from "vitest";
import { parseYoutubePlaylists } from "./playlists";

function lockup(id: string, title: string, badge: string) {
  return {
    lockupViewModel: {
      contentType: "LOCKUP_CONTENT_TYPE_PLAYLIST",
      contentId: id,
      contentImage: {
        collectionThumbnailViewModel: {
          primaryThumbnail: {
            thumbnailViewModel: {
              overlays: [
                {
                  thumbnailOverlayBadgeViewModel: {
                    thumbnailBadges: [
                      { thumbnailBadgeViewModel: { text: badge } },
                    ],
                  },
                },
              ],
            },
          },
        },
      },
      metadata: { lockupMetadataViewModel: { title: { content: title } } },
    },
  };
}

describe("parseYoutubePlaylists", () => {
  it("lists Watch Later first, then playlists with their video counts", () => {
    const data = {
      contents: {
        items: [
          lockup("PLtype", "Type Specimens", "1,204 videos"),
          lockup("LL", "Liked videos", "88 videos"),
          lockup("PLtype", "Type Specimens", "1,204 videos"),
          {
            lockupViewModel: {
              contentType: "LOCKUP_CONTENT_TYPE_VIDEO",
              contentId: "dQw4w9WgXcQ",
            },
          },
        ],
      },
    };
    expect(parseYoutubePlaylists(data)).toEqual([
      { id: "WL", name: "Watch Later", itemCount: null },
      { id: "PLtype", name: "Type Specimens", itemCount: 1204 },
    ]);
  });

  it("reads the older grid playlist layout", () => {
    const data = [
      {
        gridPlaylistRenderer: {
          playlistId: "PLgrid",
          title: { runs: [{ text: "Motion" }, { text: " Studies" }] },
          videoCountText: { runs: [{ text: "12" }, { text: " videos" }] },
        },
      },
    ];
    expect(parseYoutubePlaylists(data)).toContainEqual({
      id: "PLgrid",
      name: "Motion Studies",
      itemCount: 12,
    });
  });

  it("keeps Watch Later when the page has no playlists", () => {
    expect(parseYoutubePlaylists(null)).toEqual([
      { id: "WL", name: "Watch Later", itemCount: null },
    ]);
  });
});
