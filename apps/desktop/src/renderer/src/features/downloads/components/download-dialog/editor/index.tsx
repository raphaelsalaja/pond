import { clsx as cn } from "clsx";
import type { KeyboardEvent } from "react";
import { Frame } from "../frame";
import { type Clip, frameAt } from "../lib/clip";
import { useRangeDrag } from "../lib/drag";
import { usePlayer } from "../lib/player";
import { storyboardTile } from "../lib/range";
import { Timeline } from "../timeline";
import { Transport } from "../transport";
import styles from "./styles.module.css";

/** Keys pressed inside these belong to the control, not the editor shortcuts. */
const OWN_KEYS =
  'input, textarea, select, [role="slider"], [role="combobox"], [data-own-keys]';

/** Playback and trim state for the editor, with its keyboard shortcuts. */
export function useEditor(clip: Clip) {
  const { range, duration, replay, probe } = clip;

  const targets = [
    0,
    duration,
    ...probe.chapters.map((chapter) => chapter.start),
  ];
  if (replay) targets.push(replay.start, replay.end);
  const drag = useRangeDrag(clip, { enabled: true, targets });
  const player = usePlayer(clip, drag);
  targets.push(player.time);

  const setStart = () =>
    clip.setRange({
      start: Math.min(player.time, range.end - 1),
      end: range.end,
    });
  const setEnd = () =>
    clip.setRange({
      start: range.start,
      end: Math.max(player.time, range.start + 1),
    });

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const { target } = event;
    if (!(target instanceof Element) || target.closest(OWN_KEYS)) return;
    if (event.key === " " && target.closest("button")) return;
    const step = event.shiftKey ? 10 : 1;
    const actions = new Map<string, () => void>([
      [" ", player.toggle],
      ["ArrowLeft", () => player.seek(player.time - step)],
      ["ArrowRight", () => player.seek(player.time + step)],
      ["Home", () => player.seek(range.start)],
      ["End", () => player.seek(range.end)],
      ["i", setStart],
      ["o", setEnd],
    ]);
    const action = actions.get(event.key);
    if (!action) return;
    event.preventDefault();
    action();
  };

  return {
    clip,
    drag,
    player,
    onKeyDown,
  };
}

type EditorState = ReturnType<typeof useEditor>;

interface PartProps extends React.ComponentPropsWithoutRef<"div"> {
  editor: EditorState;
}

function Root({ editor, className, ...props }: PartProps) {
  return (
    <div
      className={cn(styles.root, className)}
      role="application"
      aria-label="Trim"
      onKeyDown={editor.onKeyDown}
      {...props}
    />
  );
}

function Panel({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  return <div className={cn(styles.panel, className)} {...props} />;
}

/** The preview stream when the site offers one, otherwise the frame under the playhead. */
function Screen({ editor, className, ...props }: PartProps) {
  const { clip, player } = editor;
  const { probe } = clip;
  return (
    <div className={cn(styles.screen, className)} {...props}>
      {player.playable && probe.preview ? (
        <video
          ref={player.video}
          className={styles.video}
          src={probe.preview}
          poster={probe.thumbnail ?? undefined}
          preload="metadata"
          playsInline
          onClick={player.toggle}
          onError={player.fail}
        >
          <track kind="captions" />
        </video>
      ) : (
        <Frame
          className={styles.video}
          tile={
            probe.storyboard
              ? storyboardTile(probe.storyboard, player.time)
              : null
          }
          src={frameAt(clip, player.time) ?? probe.thumbnail}
        />
      )}
    </div>
  );
}

interface ControlsProps extends PartProps {
  aside?: React.ReactNode;
}

function Controls({ editor, aside, className }: ControlsProps) {
  return (
    <Transport
      clip={editor.clip}
      player={editor.player}
      aside={aside}
      className={cn(styles.transport, className)}
    />
  );
}

interface DockProps extends PartProps {
  marks?: number;
}

function Dock({ editor, marks = 7, className, ...props }: DockProps) {
  return (
    <div className={cn(styles.dock, className)} {...props}>
      <Timeline
        clip={editor.clip}
        drag={editor.drag}
        player={editor.player}
        marks={marks}
      />
    </div>
  );
}

export const Editor = {
  Root,
  Panel,
  Screen,
  Controls,
  Dock,
};
