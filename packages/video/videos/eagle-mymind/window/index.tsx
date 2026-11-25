import {
  App,
  ease,
  IMPORT_ITEMS,
  itemCenter,
  keyed,
  libraryPlaces,
  NEW_ITEMS,
  NEW_MENU,
  PLUS,
  Pointer,
  progress,
  submenuOf,
} from "@pond/video";
import type { Tile } from "@pond/video";
import type { CSSProperties } from "react";
import { EAGLE, EAGLE_TOTAL, FOLDERS, media, SMART } from "../data";
import { CUES } from "../timeline";

const IMPORT_START = CUES.eagleClick + 450;
const IMPORT_LENGTH = CUES.eagleDone - IMPORT_START;
const EAGLE_INDEX = IMPORT_ITEMS.findIndex(
  (item) => item.label === "Import Eagle Library",
);

const ROOT = { ...NEW_MENU, items: NEW_ITEMS };
const SUB = { ...submenuOf(NEW_MENU, 1, 224), items: IMPORT_ITEMS };

const TILES: Array<Tile> = EAGLE.map((shot, index) => ({
  key: shot.id,
  src: media(shot.id),
  title: shot.title,
  aspect: shot.aspect,
  ext: shot.ext ?? "JPG",
  at: CUES.folderLand + 80 + index * 105,
}));

const eagle = itemCenter(SUB, EAGLE_INDEX);
const importRow = itemCenter(ROOT, 1);
const firstSub = itemCenter(SUB, 0);

/** The pointer's path in app coordinates. */
const POINTER = [
  { at: 3700, x: 620, y: 430, move: 1 },
  { at: CUES.plusClick - 50, x: PLUS.x, y: PLUS.y, move: 420 },
  { at: CUES.importHover, x: importRow.x + 30, y: importRow.y, move: 260 },
  { at: CUES.importHover + 200, x: firstSub.x - 20, y: firstSub.y, move: 190 },
  { at: CUES.eagleClick - 60, x: eagle.x - 10, y: eagle.y, move: 380 },
  { at: CUES.eagleClick + 700, x: eagle.x + 120, y: eagle.y + 90, move: 600 },
];

/** Pond opens the New menu, picks Import Eagle Library, and the library fills in. */
export function ImportWindow({
  t,
  style,
}: {
  t: number;
  style: CSSProperties;
}) {
  const pointer = keyed(t, POINTER);
  const pointerOpacity =
    ease.out(progress(t, 3700, 250)) *
    (1 - ease.in(progress(t, CUES.eagleClick + 400, 400)));
  const pressed =
    (t >= CUES.plusClick && t < CUES.plusClick + 90) ||
    (t >= CUES.eagleClick && t < CUES.eagleClick + 90);
  const menuOpen = t >= CUES.plusClick + 40 && t < CUES.eagleClick + 200;

  const fill = ease.inOut(progress(t, IMPORT_START, IMPORT_LENGTH));
  const imported = Math.round(EAGLE_TOTAL * fill);
  return (
    <App.Window style={style}>
      <App.Sidebar
        t={t}
        places={libraryPlaces(imported, Math.round(64 * fill))}
        smart={SMART.map((label, index) => ({
          label,
          at: CUES.smartLand + index * 220,
        }))}
        folders={FOLDERS.map((folder, index) => ({
          label: folder.name,
          at: CUES.folderLand + index * CUES.folderStep,
          count: Math.round(folder.count * fill),
          depth: folder.depth,
          color: folder.color,
        }))}
        plusPressed={menuOpen}
      />
      <App.Panel>
        <App.Grid t={t} tiles={TILES} />
      </App.Panel>
      <App.Menu
        t={t}
        pointer={pointer}
        root={ROOT}
        sub={SUB}
        via={1}
        rootOpen={CUES.plusClick + 40}
        subOpen={CUES.importHover + 60}
        close={CUES.eagleClick + 80}
        click={CUES.eagleClick}
      />
      <Pointer
        x={pointer.x}
        y={pointer.y}
        opacity={pointerOpacity}
        pressed={pressed}
      />
    </App.Window>
  );
}
