import { IconAlbum2 } from "@pond/icons";
import {
  App,
  Camera,
  Caption,
  defineVideo,
  ease,
  Fade,
  Frame,
  Lockup,
  libraryPlaces,
  progress,
  WHOLE,
} from "@pond/video";
import type { Tile } from "@pond/video";
import {
  FOLDERS,
  GRID,
  LIBRARY_TOTAL,
  MEDIA,
  media,
  TAG_TOTAL,
  VIEWS,
} from "./data";
import { STATES } from "./menu";
import { CUES, DURATION, end, start } from "./timeline";

/** Frames the popup at 1.5x with its top just below the caption's fade. */
const MENU_CROP = { x: 320, y: 160, width: 1280 };

/** Frames the sidebar's folder list, where the save lands. */
const FOLDER_CROP = { x: 100, y: 500, width: 1000 };

const CAMERA = [
  { at: 0, ...WHOLE, move: 1 },
  { at: CUES.menuOpen + 200, ...WHOLE, move: 1 },
  { at: CUES.pushIn, ...MENU_CROP, move: 900 },
  { at: CUES.enterChairs, ...MENU_CROP, move: 1 },
  { at: CUES.folderFocus, ...FOLDER_CROP, move: 850 },
];

const TILES: Array<Tile> = GRID.map((shot) => ({
  key: shot.id,
  src: media(shot.id),
  title: shot.title,
  aspect: shot.aspect,
  ext: "JPG",
  at: 0,
}));

function Composition({ t }: { t: number }) {
  const rise = ease.outQuint(progress(t, CUES.windowRise, 1150));
  const hide = ease.inOut(progress(t, end("added") - 450, 350));
  const opacity =
    (t < CUES.windowRise ? 0 : Math.min(1, rise * 3)) * (1 - hide);
  const added = t >= CUES.added ? 1 : 0;

  return (
    <Frame>
      <Camera t={t} keys={CAMERA} opacity={opacity}>
        <App.Window
          crumb={{ icon: <IconAlbum2 size={16} />, label: "All" }}
          style={{ transform: `translateY(${(1 - rise) * 700}px)` }}
        >
          <App.Sidebar
            t={t}
            places={libraryPlaces(LIBRARY_TOTAL, TAG_TOTAL)}
            smart={VIEWS.map((label) => ({ label, at: 0 }))}
            folders={FOLDERS.map((folder, index) => ({
              label: folder.name,
              at: 0,
              count: folder.count + (index === 0 ? added : 0),
              pulse: index === 0 ? CUES.added : undefined,
            }))}
          />
          <App.Panel>
            <App.Grid t={t} tiles={TILES} />
          </App.Panel>
          <App.CommandMenu
            t={t}
            open={CUES.menuOpen}
            close={CUES.enterChairs}
            states={STATES}
          />
        </App.Window>
      </Camera>
      <Fade edge="top" height={230} opacity={opacity} />
      <Fade edge="bottom" opacity={opacity} />
      <Lockup t={t} enter={CUES.logo} />
      <Caption
        t={t}
        y={540}
        size={56}
        text="One search for [everything] in Pond."
        enter={start("hook") + 200}
        exit={CUES.windowRise - 420}
      />
      <Caption
        t={t}
        y={118}
        size={54}
        text="Press [⌘K] to search Pond."
        enter={start("reveal") + 500}
        exit={end("reveal") - 250}
      />
      <Caption
        t={t}
        y={118}
        size={54}
        text="Mistype it. Pond still finds it."
        enter={start("typo") + 250}
        exit={end("typo") - 300}
      />
      <Caption
        t={t}
        y={118}
        size={54}
        text="Folders and saves rank in one list."
        enter={start("list") + 350}
        exit={end("list") - 300}
      />
      <Caption
        t={t}
        y={118}
        size={54}
        text="Press [Tab] for a save's actions."
        enter={start("actions") + 150}
        exit={end("actions") - 150}
      />
      <Caption
        t={t}
        y={118}
        size={54}
        text="Added to [Chairs] from the keyboard."
        enter={start("added") + 250}
        exit={end("added") - 450}
      />
    </Frame>
  );
}

export const video = defineVideo({
  title: "Pond: Command menu",
  duration: DURATION,
  poster: 11_600,
  media: MEDIA,
  Composition,
});
