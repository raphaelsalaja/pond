import { cssVars } from "@pond/ui";
import type {
  FishColor,
  FishPresence,
  FishSpecies,
  FishSummary,
} from "@shared/fish-contracts";
import { clsx as cn } from "clsx";
import { useEffect, useId, useRef, useState } from "react";
import { SPECIES_ART, type SpeciesArt } from "./art";
import {
  type Avatar,
  createAvatar,
  faceFor,
  type Pose,
  restingEyes,
  type Task,
} from "./face";
import styles from "./styles.module.css";
import { animate, type Rig, reducedMotion } from "./ticker";

export { SPECIES_LABELS } from "./art";

export type FishMood = "calm" | "busy" | "worried" | "pleased";

export function fishMood(
  fish: Pick<FishSummary, "activity" | "lastRun">,
): FishMood {
  if (fish.activity) return "busy";
  if (!fish.lastRun || fish.lastRun.seen) return "calm";
  return fish.lastRun.status === "failed" ? "worried" : "pleased";
}

export function fishColorCss(color: FishColor): string {
  return `var(--ds-${color})`;
}

/** Spread on a container to retint its accent controls, focus rings and your bubbles in the fish's color. */
export function fishAccent(color: FishColor) {
  return {
    "data-accent": color,
    style: cssVars({
      "--accent-hue": `var(--ds-${color})`,
      "--accent-hue-tint": `var(--ds-${color}-tint)`,
      "--accent-hue-border": `var(--ds-${color}-border)`,
      "--accent-hue-contrast": `var(--ds-${color}-contrast)`,
      "--message-accent": "var(--ds-accent)",
      "--message-accent-foreground": "var(--ds-accent-contrast)",
    }),
  };
}

function taskOf(activity: FishPresence, mood: FishMood): Task | null {
  if (mood === "worried" || mood === "pleased") return mood;
  if (activity === "searching") return "reading";
  return activity;
}

/** The control a fish sits in; hovering it excites the fish and pressing it makes the fish hop. */
const HOST =
  "a, button, [role='button'], [role='menuitem'], [role='option'], [role='tab']";

function partTransform(
  [x, y]: readonly [number, number],
  angle: number,
  scale = 1,
): string {
  return `rotate(${angle} ${x} ${y}) translate(${x} ${y}) scale(${scale} 1) translate(${-x} ${-y})`;
}

function Stage({ art, task }: { art: SpeciesArt; task: Task | null }) {
  const id = useId();
  const clipId = `fish-${id.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [rest] = useState(() => restingEyes(art.head, faceFor(task)));
  const svgRef = useRef<SVGSVGElement>(null);
  const bodyRef = useRef<SVGGElement>(null);
  const tailRef = useRef<SVGPathElement>(null);
  const lureRef = useRef<SVGGElement>(null);
  const backEyeRef = useRef<SVGPathElement>(null);
  const frontEyeRef = useRef<SVGPathElement>(null);
  const avatarRef = useRef<Avatar | null>(null);
  const rigRef = useRef<Rig | null>(null);
  const taskRef = useRef(task);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const avatar = createAvatar({ head: art.head, pivot: art.pivot });
    avatar.task(taskRef.current);
    const writeEyes = (eyes: Pose["eyes"]) => {
      [backEyeRef.current, frontEyeRef.current].forEach((node, index) => {
        const eye = eyes[index];
        if (!node || !eye) return;
        node.setAttribute("d", eye.d);
        node.setAttribute("transform", eye.transform);
        node.setAttribute("opacity", String(eye.opacity));
      });
    };
    const rig: Rig = {
      element: svg,
      avatar,
      write(pose) {
        bodyRef.current?.setAttribute("transform", pose.transform);
        tailRef.current?.setAttribute(
          "transform",
          partTransform(art.tail.root, pose.tail.angle, pose.tail.scale),
        );
        if (art.lure) {
          lureRef.current?.setAttribute(
            "transform",
            partTransform(
              art.lure.root,
              pose.tail.angle * 0.5 + pose.trail * 140,
            ),
          );
        }
        writeEyes(pose.eyes);
      },
      rest() {
        bodyRef.current?.removeAttribute("transform");
        tailRef.current?.removeAttribute("transform");
        lureRef.current?.removeAttribute("transform");
        writeEyes(restingEyes(art.head, faceFor(taskRef.current)));
      },
    };
    avatarRef.current = avatar;
    rigRef.current = rig;

    const host = svg.closest(HOST) ?? svg;
    const enter = () => avatar.hover(true);
    const leave = () => avatar.hover(false);
    const press = (event: Event) => {
      if ("button" in event && event.button === 0) avatar.press();
    };
    host.addEventListener("pointerenter", enter);
    host.addEventListener("pointerleave", leave);
    host.addEventListener("pointerdown", press);
    const stop = animate(rig);
    return () => {
      stop();
      host.removeEventListener("pointerenter", enter);
      host.removeEventListener("pointerleave", leave);
      host.removeEventListener("pointerdown", press);
      avatarRef.current = null;
      rigRef.current = null;
    };
  }, [art]);

  useEffect(() => {
    taskRef.current = task;
    avatarRef.current?.task(task);
    if (reducedMotion()) rigRef.current?.rest();
  }, [task]);

  const [back, front] = rest;
  return (
    <svg
      ref={svgRef}
      className={styles.stage}
      viewBox={art.viewBox}
      aria-hidden="true"
    >
      <defs>
        <clipPath id={clipId}>
          {art.body.map((d) => (
            <path key={d} d={d} />
          ))}
        </clipPath>
      </defs>
      <g ref={bodyRef} fill="var(--avatar-body)">
        <path ref={tailRef} d={art.tail.d} />
        {art.lure ? (
          <g ref={lureRef}>
            <path
              d={art.lure.stalk}
              fill="none"
              stroke="var(--avatar-body)"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            <circle cx={art.lure.bulb[0]} cy={art.lure.bulb[1]} r="1.6" />
          </g>
        ) : null}
        {art.body.map((d) => (
          <path key={d} d={d} />
        ))}
        <g clipPath={`url(#${clipId})`} fill="var(--avatar-eyes)">
          <path
            ref={backEyeRef}
            d={back.d}
            transform={back.transform}
            opacity={back.opacity}
          />
          <path
            ref={frontEyeRef}
            d={front.d}
            transform={front.transform}
            opacity={front.opacity}
          />
        </g>
      </g>
    </svg>
  );
}

interface FishMarkProps extends React.ComponentPropsWithoutRef<"span"> {
  color: FishColor;
  species: FishSpecies;
  activity?: FishPresence;
  mood?: FishMood;
  size?: number;
}

export function FishMark({
  color,
  species,
  activity = null,
  mood = "calm",
  size = 16,
  className,
  style,
  ...props
}: FishMarkProps) {
  return (
    <span
      className={cn(styles.mark, className)}
      style={{
        ...cssVars({
          "--fish-color": fishColorCss(color),
          "--fish-size": `${size}px`,
        }),
        ...style,
      }}
      aria-hidden="true"
      {...props}
    >
      <Stage
        key={species}
        art={SPECIES_ART[species]}
        task={taskOf(activity, mood)}
      />
    </span>
  );
}
