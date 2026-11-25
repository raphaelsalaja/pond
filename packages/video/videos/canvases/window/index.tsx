import { IconCanvas } from "@pond/icons";
import {
  App,
  anchor,
  boardToApp,
  ease,
  keyed,
  libraryPlaces,
  mix,
  PANEL,
  Pointer,
  progress,
  swatchCenter,
  toolCenter,
  toolIndex,
} from "@pond/video";
import type { End, Point } from "@pond/video";
import type { CSSProperties } from "react";
import { LOOKS, LOOP, media, NOTE, NOTE_TEXT, VIEW } from "../data";
import { CUES } from "../timeline";

const at = (x: number, y: number) => boardToApp(VIEW, x, y);
const toBoard = (point: Point) => ({
  x: (point.x - PANEL.left - VIEW.x) / VIEW.zoom,
  y: (point.y - PANEL.top - VIEW.y) / VIEW.zoom,
});

const ORDER = Object.values(LOOKS);
const linkFrom = anchor(LOOKS.lemaire.box, "bottom");
const linkTo = anchor(NOTE, "left");
const relinkFrom = anchor(NOTE, "right");
const relinkTo = anchor(LOOKS.light.box, "left");
const loopStart = LOOP[0] ?? [0, 0, 0.5];
const loopEnd = LOOP.at(-1) ?? loopStart;

/** The pointer's path in app coordinates; while drawing it follows the marker instead. */
const POINTER = [
  { at: CUES.pointerIn, x: 800, y: 450, move: 1 },
  { at: CUES.addSaves - 50, ...toolCenter(toolIndex("Add Saves")), move: 350 },
  { at: CUES.savesLand + 300, x: 930, y: 470, move: 600 },
  {
    at: CUES.noteTool - 50,
    ...toolCenter(toolIndex("Sticky Note")),
    move: 500,
  },
  { at: CUES.noteDrop - 50, ...at(NOTE.x + 96, NOTE.y + 96), move: 500 },
  { at: CUES.noteDrop + 400, ...at(NOTE.x + 250, NOTE.y + 170), move: 400 },
  { at: CUES.markerTool - 50, ...toolCenter(toolIndex("Marker")), move: 500 },
  { at: CUES.pickRed - 50, ...swatchCenter(3), move: 300 },
  { at: CUES.drawStart - 50, ...at(loopStart[0], loopStart[1]), move: 300 },
  { at: CUES.drawEnd, ...at(loopEnd[0], loopEnd[1]), move: 800 },
  { at: CUES.hoverLook, ...at(190, 420), move: 600 },
  { at: CUES.linkPress - 50, ...at(linkFrom.x, linkFrom.y - 4), move: 300 },
  { at: CUES.linkDrop, ...at(linkTo.x, linkTo.y), move: 650 },
  { at: CUES.relinkPress - 50, ...at(relinkFrom.x, relinkFrom.y), move: 450 },
  { at: CUES.relinkDrop, ...at(relinkTo.x, relinkTo.y), move: 550 },
  { at: CUES.pullBack - 200, ...at(1120, 800), move: 700 },
];

/** Which tool the dock highlights; each key slides the highlight in after its click. */
const ACTIVE = [
  { at: 0, tool: 0, move: 1 },
  { at: CUES.noteTool + 220, tool: toolIndex("Sticky Note"), move: 220 },
  { at: CUES.noteDrop + 220, tool: 0, move: 220 },
  { at: CUES.markerTool + 220, tool: toolIndex("Marker"), move: 220 },
  { at: CUES.escape + 220, tool: 0, move: 220 },
];

const CLICKS = [
  CUES.addSaves,
  CUES.noteTool,
  CUES.noteDrop,
  CUES.markerTool,
  CUES.pickRed,
];
const HOLDS: Array<[number, number]> = [
  [CUES.drawStart, CUES.drawEnd],
  [CUES.linkPress, CUES.linkDrop],
  [CUES.relinkPress, CUES.relinkDrop],
];

const within = (t: number, [from, to]: readonly [number, number]) =>
  t >= from && t < to;

function pointerAt(t: number): Point {
  if (within(t, [CUES.drawStart, CUES.drawEnd])) {
    const index = Math.round(
      progress(t, CUES.drawStart, CUES.drawEnd - CUES.drawStart) *
        (LOOP.length - 1),
    );
    const [x, y] = LOOP[index] ?? loopEnd;
    return at(x, y);
  }
  return keyed(t, POINTER);
}

function land(t: number, index: number): CSSProperties {
  const begin = CUES.savesLand + index * CUES.savesStep;
  const k = ease.outQuint(progress(t, begin, 600));
  return {
    opacity: ease.out(progress(t, begin, 260)),
    transform: `translateY(${(1 - k) * 28}px) scale(${mix(0.92, 1, k)})`,
    visibility: k <= 0 ? "hidden" : undefined,
  };
}

/** Pond on the Spring Shoot canvas: saves land, a note and a marker loop go on, and connectors tie it together. */
export function CanvasWindow({
  t,
  style,
}: {
  t: number;
  style: CSSProperties;
}) {
  const pointer = pointerAt(t);
  const onBoard = toBoard(pointer);
  const pointerOpacity =
    ease.out(progress(t, CUES.pointerIn, 250)) *
    (1 - ease.in(progress(t, CUES.pullBack - 300, 400)));
  const pressed =
    CLICKS.some((click) => within(t, [click, click + 90])) ||
    HOLDS.some((hold) => within(t, hold));

  const active = keyed(t, ACTIVE).tool;
  const noteTool =
    ease.out(progress(t, CUES.noteTool + 40, 180)) *
    (1 - ease.in(progress(t, CUES.noteDrop, 150)));
  const markerTool =
    ease.out(progress(t, CUES.markerTool + 40, 180)) *
    (1 - ease.in(progress(t, CUES.escape, 150)));

  const note = ease.outBack(progress(t, CUES.noteDrop + 20, 420));
  const typed = Math.floor(
    progress(t, CUES.typing, CUES.typed - CUES.typing) * NOTE_TEXT.length,
  );
  const typing = t >= CUES.noteDrop && t < CUES.typed + 300;

  const connecting =
    within(t, [CUES.linkPress, CUES.linkDrop]) ||
    within(t, [CUES.relinkPress, CUES.relinkDrop]);
  const hoverLook =
    ease.out(progress(t, CUES.hoverLook - 150, 150)) *
    (1 - ease.out(progress(t, CUES.linkDrop + 100, 200)));
  const hoverNote =
    ease.out(progress(t, CUES.relinkPress - 300, 150)) *
    (1 - ease.out(progress(t, CUES.relinkDrop + 100, 200)));
  const handles = (own = 0) => (connecting ? 1 : own);

  const firstLink: End | Point = t < CUES.linkDrop ? onBoard : linkTo;
  const secondLink: End | Point = t < CUES.relinkDrop ? onBoard : relinkTo;

  return (
    <App.Window
      crumb={{ icon: <IconCanvas size={16} />, label: "Spring Shoot" }}
      style={style}
    >
      <App.Sidebar
        t={t}
        places={libraryPlaces(1284, 212, false)}
        canvases={[
          { label: "Spring Shoot", active: true },
          { label: "Studio Visit" },
        ]}
        folders={[
          { label: "Fashion", at: 0, count: 96, color: "var(--ds-orange)" },
          { label: "Interiors", at: 0, count: 58, color: "var(--ds-green)" },
          { label: "Objects", at: 0, count: 37, color: "var(--ds-purple)" },
        ]}
      />
      <App.Panel>
        <App.Board
          viewport={VIEW}
          chrome={
            <>
              <App.Zoom zoom={VIEW.zoom} />
              <App.Tools
                active={active}
                palette={noteTool + markerTool}
                color={t < CUES.pickRed ? "yellow" : "red"}
              />
            </>
          }
        >
          {t >= CUES.linkPress ? (
            <App.Connector id="link" from={linkFrom} to={firstLink} />
          ) : null}
          {t >= CUES.relinkPress ? (
            <App.Connector id="relink" from={relinkFrom} to={secondLink} />
          ) : null}
          {ORDER.map((look, index) => (
            <App.Card
              key={look.id}
              box={look.box}
              src={media(look.id)}
              title={look.title}
              meta={look.meta}
              handles={handles(look === LOOKS.lemaire ? hoverLook : 0)}
              activeHandle={
                look === LOOKS.lemaire &&
                within(t, [CUES.linkPress, CUES.linkDrop])
                  ? "bottom"
                  : undefined
              }
              style={land(t, index)}
            />
          ))}
          {t >= CUES.noteDrop ? (
            <App.Note
              box={NOTE}
              color="yellow"
              text={NOTE_TEXT.slice(0, typed)}
              caret={typing}
              selected={typing}
              handles={handles(hoverNote)}
              activeHandle={
                within(t, [CUES.relinkPress, CUES.relinkDrop])
                  ? "right"
                  : undefined
              }
              style={{
                opacity: Math.min(1, note * 1.4),
                transform: `scale(${mix(0.86, 1, note)})`,
              }}
            />
          ) : null}
          <App.Stroke
            points={LOOP}
            progress={progress(
              t,
              CUES.drawStart,
              CUES.drawEnd - CUES.drawStart,
            )}
            color="red"
          />
        </App.Board>
      </App.Panel>
      <Pointer
        x={pointer.x}
        y={pointer.y}
        opacity={pointerOpacity}
        pressed={pressed}
      />
    </App.Window>
  );
}
