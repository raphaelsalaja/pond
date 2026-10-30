export function markedRef(id: string, savedAt?: string) {
  return {
    id,
    source: "marked",
    platform: "x",
    sourceUrl: "https://x.com/augustasdesign/status/2113878354516394052",
    title: "A scheduling assistant card in a chat",
    description: null,
    text: "sidebar component in action",
    author: {
      name: "Augustas",
      handle: "augustasdesign",
      avatarUrl: "/seed/avatars/augustasdesign.jpg",
      profileUrl: "https://x.com/augustasdesign",
      verified: true,
    },
    media: [
      {
        id: "dae90c14-65b9-5908-b6a6-4b6a82fc3fae",
        kind: "video",
        url: "/seed/media/x-augustasdesign-2113878354516394052.mp4",
        posterUrl:
          "/seed/media/preview/x-augustasdesign-2113878354516394052.jpg",
        width: 2880,
        height: 2880,
        alt: "A white chat card asking Tempra to find 45 minutes.",
      },
    ],
    markedCategories: ["saas"],
    aiDescription:
      "A small assistant card answers a scheduling request with a chosen slot.",
    aiTags: ["AI", "Card", "Input"],
    createdAt: "2026-10-24T06:20:48.000Z",
    publishedAt: "2026-10-24T06:20:48.000Z",
    save: savedAt
      ? {
          id: `save-${id}`,
          refId: id,
          categories: [],
          note: null,
          createdAt: savedAt,
        }
      : null,
    collectionIds: [],
  };
}
