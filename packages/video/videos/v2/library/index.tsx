import {
  IconAlbum2,
  IconClockPlus,
  IconFolderBan,
  IconHistory,
  IconNodes3,
  IconShuffle,
  IconTag,
  IconTagSlash,
  IconTrashXmark,
  IconWindowDownload,
} from "@pond/icons";
import {
  APP_HEIGHT,
  APP_WIDTH,
  App,
  ease,
  keyed,
  mix,
  Pointer,
  progress,
  type Tile,
  tileRect,
} from "@pond/video";
import { added, LIBRARY, media, PREVIEW } from "../data";
import { CUES, end } from "../timeline";
import { Pane } from "./pane";
import styles from "./styles.module.css";

const TILES: Tile[] = LIBRARY.map((shot, index) => ({
  key: shot.id,
  src: media(shot.id),
  title: shot.title,
  aspect: shot.aspect,
  ext: shot.ext ?? "JPG",
  date: added(shot),
  at: CUES.windowRise + 260 + index * 45,
}));

const TARGET = tileRect(TILES, PREVIEW.index, "2.0");
const CENTER = {
  x: TARGET.left + TARGET.width / 2,
  y: TARGET.top + TARGET.height / 2,
};

/** The save page's media: centered in the space left of the 320px Details track. */
const VIEWER = (() => {
  const left = 248;
  const right = APP_WIDTH - 320;
  const pad = 32;
  const height = Math.min(
    APP_HEIGHT - 44 - pad * 2,
    (right - left - pad * 2) / PREVIEW.aspect,
  );
  const width = height * PREVIEW.aspect;
  return {
    left: left + (right - left - width) / 2,
    top: 44 + (APP_HEIGHT - 44 - height) / 2,
    width,
    height,
  };
})();

const POINTER = [
  { at: CUES.tileClick - 1000, x: CENTER.x + 220, y: CENTER.y + 260, move: 1 },
  { at: CUES.tileClick - 40, ...CENTER, move: 820 },
  {
    at: CUES.tileClick + 1200,
    x: CENTER.x + 60,
    y: CENTER.y + 120,
    move: 900,
  },
];

const PLACES = [
  { label: "All", icon: <IconAlbum2 />, count: "2,418", active: true },
  { label: "Untagged", icon: <IconTagSlash />, count: 37 },
  { label: "Recently Added", icon: <IconClockPlus />, count: 64 },
  { label: "Uncategorized", icon: <IconFolderBan />, count: 112 },
  { label: "Recently Used", icon: <IconHistory /> },
  { label: "Tags", icon: <IconTag />, count: 186 },
  { label: "Trash", icon: <IconTrashXmark />, count: 3 },
  { label: "Random", icon: <IconShuffle /> },
];

const HARVESTING = [
  { label: "Downloads", icon: <IconWindowDownload /> },
  { label: "Sources", icon: <IconNodes3 /> },
];

const FOLDERS = ["Interiors", "Fashion", "Cars", "Studio"];

/** The 2.0 library sidebar, shared by every scene set inside the library. */
export function LibrarySidebar({ t }: { t: number }) {
  return (
    <App.Sidebar
      t={t}
      look="2.0"
      places={PLACES}
      harvesting={HARVESTING}
      smart={[{ label: "Five Stars", at: 0 }]}
      fish={[
        {
          label: "Koi",
          icon: (
            <App.Fish t={t} species="koi" color="orange" size={16} seed={3} />
          ),
          count: "9:28 AM",
        },
      ]}
      canvases={[{ label: "Cabin" }]}
      folders={FOLDERS.map((label) => ({ label, at: 0 }))}
    />
  );
}

/** The 2.0 library on one white surface; a save opens into the viewer with Details beside it. */
export function Library({ t }: { t: number }) {
  const rise = ease.outQuint(progress(t, CUES.windowRise, 1100));
  const away = ease.inOut(progress(t, end("preview") - 650, 600));
  if (t < CUES.windowRise - 50 || away >= 1) return null;

  const pointer = keyed(t, POINTER);
  const pointerOpacity =
    ease.out(progress(t, CUES.tileClick - 1000, 260)) *
    (1 - ease.in(progress(t, CUES.tileClick + 900, 400)));
  const pressed = t >= CUES.tileClick && t < CUES.tileClick + 100;
  const opened = t >= CUES.paneOpen;
  const leave = ease.out(progress(t, CUES.paneOpen, 320));
  const fly = ease.outQuint(progress(t, CUES.paneOpen, 760));
  const scroll = mix(
    0,
    150,
    ease.inOut(progress(t, CUES.paneOpen + 1900, 1500)),
  );

  return (
    <App.Window
      look="2.0"
      crumb={{
        icon: <IconAlbum2 size={16} />,
        label: "All",
        trail: opened ? PREVIEW.title : undefined,
      }}
      style={{
        opacity: Math.min(1, rise * 2) * (1 - away),
        transform: `translateY(${(1 - rise) * 140}px) scale(${mix(0.97, 1, rise) * mix(1, 0.96, away)})`,
        filter: away > 0.01 ? `blur(${away * 10}px)` : undefined,
      }}
    >
      <LibrarySidebar t={t} />
      {leave < 1 ? (
        <div className={styles.library} style={{ opacity: 1 - leave }}>
          <App.Search />
          <App.Grid
            t={t}
            tiles={TILES}
            look="2.0"
            selected={t >= CUES.tileClick + 30 ? PREVIEW.id : undefined}
          />
        </div>
      ) : null}
      {opened ? (
        <img
          alt=""
          src={media(PREVIEW.id)}
          className={styles.viewer}
          style={{
            left: mix(TARGET.left, VIEWER.left, fly),
            top: mix(TARGET.top, VIEWER.top, fly),
            width: mix(TARGET.width, VIEWER.width, fly),
            height: mix(TARGET.height, VIEWER.height, fly),
            boxShadow: fly < 1 ? undefined : "none",
          }}
        />
      ) : null}
      <Pane t={t} open={CUES.paneOpen + 80} scroll={scroll} />
      <Pointer
        x={pointer.x}
        y={pointer.y}
        opacity={pointerOpacity}
        pressed={pressed}
      />
    </App.Window>
  );
}
