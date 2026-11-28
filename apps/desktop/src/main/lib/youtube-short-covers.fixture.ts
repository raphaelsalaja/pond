/**
 * Recorded 2026-11-28 from live youtube.com Shorts and watch pages, trimmed to
 * the player fields that name a cover, plus the size of each bare i.ytimg.com
 * file. A file listed as null answered 404. Live checks of these facts live in
 * youtube-thumbnail.live.test.ts.
 */
export interface RecordedPlayer {
  videoDetails: { videoId: string; lengthSeconds: string };
  microformat: {
    playerMicroformatRenderer: {
      thumbnail: {
        isOriginalAspectRatio?: boolean;
        thumbnails: Array<{ url: string; width: number; height: number }>;
      };
    };
  };
}

export interface RecordedShort {
  id: string;
  shortsPlayer: RecordedPlayer;
  watchPlayer: RecordedPlayer;
  images: Record<string, { width: number; height: number } | null>;
}

const recordings: Array<RecordedShort> = [
  {
    id: "-st95jSkprQ",
    shortsPlayer: {
      videoDetails: {
        videoId: "-st95jSkprQ",
        lengthSeconds: "95",
      },
      microformat: {
        playerMicroformatRenderer: {
          thumbnail: {
            thumbnails: [
              {
                url: "https://i.ytimg.com/vi/-st95jSkprQ/oardefault.jpg?sqp=-oaymwEdCJUDENAFSFWQAgHyq4qpAwwIARUAAIhCcAHAAQY=&rs=AOn4CLBRrbGQZm0aAKGeZh_Gk-8neNnIVA",
                width: 405,
                height: 720,
              },
              {
                url: "https://i.ytimg.com/vi/-st95jSkprQ/oardefault.jpg?sqp=-oaymwEgCJUDEOAESFWQAgHyq4qpAw8IARUAAIhCcAHAAQbIAQE=&rs=AOn4CLBYYQEXtQRWzgeUawJo3DDL9PoMDw",
                width: 405,
                height: 608,
              },
            ],
            isOriginalAspectRatio: true,
          },
        },
      },
    },
    watchPlayer: {
      videoDetails: {
        videoId: "-st95jSkprQ",
        lengthSeconds: "95",
      },
      microformat: {
        playerMicroformatRenderer: {
          thumbnail: {
            thumbnails: [
              {
                url: "https://i.ytimg.com/vi/-st95jSkprQ/maxresdefault.jpg?sqp=-oaymwEmCIAKENAF8quKqQMa8AEB-AG2CIACgA-KAgwIABABGHIgVig7MA8=&rs=AOn4CLABMLsI7g2NtgJcM56l83OBxocclw",
                width: 1280,
                height: 720,
              },
            ],
          },
        },
      },
    },
    images: {
      "oardefault.jpg": {
        width: 1080,
        height: 1920,
      },
      "sardefault.jpg": null,
      "oar2.jpg": {
        width: 1080,
        height: 1920,
      },
      "hq720.jpg": {
        width: 1280,
        height: 720,
      },
      "frame0.jpg": {
        width: 268,
        height: 480,
      },
      "maxresdefault.jpg": {
        width: 1280,
        height: 720,
      },
    },
  },
  {
    id: "m6CRWM9sUzU",
    shortsPlayer: {
      videoDetails: {
        videoId: "m6CRWM9sUzU",
        lengthSeconds: "61",
      },
      microformat: {
        playerMicroformatRenderer: {
          thumbnail: {
            thumbnails: [
              {
                url: "https://i.ytimg.com/vi/m6CRWM9sUzU/sardefault.jpg?sqp=-oaymwEdCJUDENAFSFWQAgHyq4qpAwwIARUAAIhCcAHAAQY=&rs=AOn4CLC46zE3UnYb4f_DH7x59ZO86aLFyA",
                width: 405,
                height: 720,
              },
              {
                url: "https://i.ytimg.com/vi/m6CRWM9sUzU/sardefault.jpg?sqp=-oaymwEgCJUDEOAESFWQAgHyq4qpAw8IARUAAIhCcAHAAQbIAQE=&rs=AOn4CLBkYFGEUH7R8UBEp14O_utHPrc99g",
                width: 405,
                height: 608,
              },
            ],
            isOriginalAspectRatio: true,
          },
        },
      },
    },
    watchPlayer: {
      videoDetails: {
        videoId: "m6CRWM9sUzU",
        lengthSeconds: "61",
      },
      microformat: {
        playerMicroformatRenderer: {
          thumbnail: {
            thumbnails: [
              {
                url: "https://i.ytimg.com/vi/m6CRWM9sUzU/maxresdefault.jpg",
                width: 1280,
                height: 720,
              },
            ],
          },
        },
      },
    },
    images: {
      "oardefault.jpg": null,
      "sardefault.jpg": {
        width: 1778,
        height: 3160,
      },
      "oar2.jpg": {
        width: 1080,
        height: 1920,
      },
      "hq720.jpg": {
        width: 1280,
        height: 720,
      },
      "frame0.jpg": {
        width: 268,
        height: 480,
      },
      "maxresdefault.jpg": {
        width: 1280,
        height: 720,
      },
    },
  },
  {
    id: "dbXWZjYJ8t8",
    shortsPlayer: {
      videoDetails: {
        videoId: "dbXWZjYJ8t8",
        lengthSeconds: "58",
      },
      microformat: {
        playerMicroformatRenderer: {
          thumbnail: {
            thumbnails: [
              {
                url: "https://i.ytimg.com/vi/dbXWZjYJ8t8/hq720.jpg?sqp=-oaymwEdCJUDENAFSFXyq4qpAw8IARUAAIhCcAHAAQbQAQE=&rs=AOn4CLBWivaRWBd2suuFyFd6YI6SYeFrGQ",
                width: 405,
                height: 720,
              },
            ],
            isOriginalAspectRatio: true,
          },
        },
      },
    },
    watchPlayer: {
      videoDetails: {
        videoId: "dbXWZjYJ8t8",
        lengthSeconds: "58",
      },
      microformat: {
        playerMicroformatRenderer: {
          thumbnail: {
            thumbnails: [
              {
                url: "https://i.ytimg.com/vi/dbXWZjYJ8t8/maxresdefault.jpg?sqp=-oaymwEoCIAKENAF8quKqQMcGADwAQH4AbYIgAKAD4oCDAgAEAEYZSBXKEwwDw==&rs=AOn4CLDrlxgy3leQkH-TLqy-og_tBHdULg",
                width: 1280,
                height: 720,
              },
            ],
          },
        },
      },
    },
    images: {
      "oardefault.jpg": null,
      "sardefault.jpg": null,
      "oar2.jpg": {
        width: 1080,
        height: 1920,
      },
      "hq720.jpg": {
        width: 1280,
        height: 720,
      },
      "frame0.jpg": {
        width: 268,
        height: 480,
      },
      "maxresdefault.jpg": {
        width: 1280,
        height: 720,
      },
    },
  },
];
export const recordedShortIds = recordings.map((recording) => recording.id);

export function recordedShort(id: string): RecordedShort {
  const recording = recordings.find((entry) => entry.id === id);
  if (!recording) throw new Error(`no recorded Short ${id}`);
  return recording;
}
