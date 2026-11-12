/** Face geometry, timing and behaviour for a flat character with two capsule eyes; no framework, no DOM. */

const TAU = Math.PI * 2;
const AXES = ["yaw", "pitch", "roll"] as const;
const EYE = ["w", "h", "tilt", "open"] as const;

type Vec = readonly [number, number, number];

interface Gaze {
  yaw: number;
  pitch: number;
  roll: number;
}

interface Eye {
  w: number;
  h: number;
  tilt: number;
  open: number;
}

/** A tail beat: seconds per stroke and degrees of swing. */
interface Fin {
  period: number;
  swing: number;
}

interface Face {
  gaze: Gaze;
  split: number;
  eyes: [Eye, Eye];
  fin: Fin;
}

/** Centre and radii of the face in SVG units. */
export interface Head {
  x: number;
  y: number;
  rx: number;
  ry: number;
}

interface Point {
  x: number;
  y: number;
}

interface EyeDraw {
  d: string;
  transform: string;
  opacity: number;
}

const REST: Gaze = { yaw: 24, pitch: 24, roll: -12 };

const pair = (w: number, h: number, tilt = 0, open = 1): [Eye, Eye] => [
  { w, h, tilt, open },
  { w, h, tilt: -tilt, open },
];

const fin = (period: number, swing: number): Fin => ({ period, swing });

/** Eye width and height are fractions of the mean head radius; split is the angle between the eyes in degrees. */
const FACES = {
  idle: {
    gaze: { yaw: 0, pitch: 0, roll: 0 },
    split: 15.5,
    eyes: pair(0.296, 0.652),
    fin: fin(1.8, 7),
  },
  attentive: {
    gaze: { yaw: 0, pitch: 0, roll: 0 },
    split: 16,
    eyes: pair(0.326, 0.696),
    fin: fin(1.2, 8),
  },
  excited: {
    gaze: { yaw: 0, pitch: -4, roll: 6 },
    split: 19,
    eyes: pair(0.457, 0.848, -8),
    fin: fin(0.5, 12),
  },
  happy: {
    gaze: { yaw: 0, pitch: 10, roll: 0 },
    split: 17.5,
    eyes: pair(0.522, 0.217, 18),
    fin: fin(0.7, 10),
  },
  sleepy: {
    gaze: { yaw: -6, pitch: -14, roll: 4 },
    split: 15,
    eyes: pair(0.296, 0.652, 0, 0.4),
    fin: fin(2.8, 4),
  },
  asleep: {
    gaze: { yaw: -8, pitch: -20, roll: 8 },
    split: 15,
    eyes: pair(0.348, 0.652, 0, 0),
    fin: fin(4.4, 2),
  },
  thinking: {
    gaze: { yaw: -18, pitch: 14, roll: 6 },
    split: 15.5,
    eyes: pair(0.296, 0.61),
    fin: fin(2.2, 5),
  },
  reading: {
    gaze: { yaw: 0, pitch: -8, roll: 0 },
    split: 15,
    eyes: pair(0.31, 0.56, 0, 0.82),
    fin: fin(1.3, 7),
  },
  writing: {
    gaze: { yaw: 8, pitch: -18, roll: -4 },
    split: 15,
    eyes: pair(0.3, 0.6, 0, 0.78),
    fin: fin(0.9, 8),
  },
  worried: {
    gaze: { yaw: -6, pitch: -12, roll: 12 },
    split: 17,
    eyes: pair(0.27, 0.6, 20, 0.86),
    fin: fin(2.6, 3),
  },
} satisfies Record<string, Face>;

type Mood = keyof typeof FACES;

/** Work a fish is doing or a run it wants you to see; it outranks pointer moods. */
export type Task =
  | "thinking"
  | "reading"
  | "writing"
  | "preparing"
  | "worried"
  | "pleased";

const TASK_FACE = {
  thinking: "thinking",
  reading: "reading",
  writing: "writing",
  preparing: "excited",
  worried: "worried",
  pleased: "happy",
} satisfies Record<Task, Mood>;

interface Glances {
  gap: readonly [number, number];
  yaw: readonly [number, number];
  pitch: readonly [number, number];
  /** Sweep left and right in turn, like eyes running along lines of text. */
  sweep?: boolean;
}

const TASK_GLANCES = {
  thinking: { gap: [1.6, 3], yaw: [-14, 6], pitch: [0, 10] },
  reading: { gap: [0.7, 0.85], yaw: [10, 15], pitch: [-3, 3], sweep: true },
  writing: { gap: [0.3, 0.5], yaw: [-5, 5], pitch: [-2, 2] },
} satisfies Partial<Record<Mood, Glances>>;

function glancesFor(mood: Mood): Glances | undefined {
  if (mood === "thinking" || mood === "reading" || mood === "writing")
    return TASK_GLANCES[mood];
  return undefined;
}

/** Seconds, except the chances, which are 0 to 1. */
const TIMING = {
  blink: 0.18,
  blinkClose: 0.45,
  blinkGap: [1.9, 4.6],
  doubleBlink: 0.18,
  glanceGap: [1.5, 4],
  glanceHold: [0.8, 1.8],
  wideGlance: 0.45,
  spin: 1.1,
  spinAfterAway: 6,
  hop: 0.75,
  happy: 1.4,
  sleepy: 24,
  asleep: 30,
  breath: 3.4,
  sleepBreath: 4.6,
  morph: 0.09,
  eyes: 0.06,
  body: 0.22,
  maxStep: 0.064,
} as const;

const clamp = (value: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));
const lerp = (from: number, to: number, amount: number) =>
  from + (to - from) * amount;
const ease = (dt: number, tau: number) => 1 - Math.exp(-dt / tau);
const radians = (value: number) => (value * Math.PI) / 180;
const degrees = (value: number) => (value * 180) / Math.PI;
const easeOutQuint = (t: number) => 1 - (1 - t) ** 5;
const round = (value: number) => Math.round(value * 1000) / 1000;

/** Smooth noise from three sines; each channel takes its own period and phase so nothing repeats in step. */
function wave(t: number, period: number, phase: number): number {
  const r = (t / period) * TAU;
  return (
    0.55 * Math.sin(r + phase) +
    0.3 * Math.sin(2 * r + phase * 1.7 + 1.1) +
    0.15 * Math.sin(3 * r + phase * 2.3 + 2.4)
  );
}

function turn(a: Vec, b: Vec, angle: number): [Vec, Vec] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [
    [a[0] * c + b[0] * s, a[1] * c + b[1] * s, a[2] * c + b[2] * s],
    [b[0] * c - a[0] * s, b[1] * c - a[1] * s, b[2] * c - a[2] * s],
  ];
}

function capsule(w: number, h: number): string {
  const r = Math.min(w, h) / 2;
  if (h >= w) {
    const y = h / 2 - r;
    return `M${round(-r)} ${round(-y)}a${round(r)} ${round(r)} 0 0 1 ${round(2 * r)} 0v${round(2 * y)}a${round(r)} ${round(r)} 0 0 1 ${round(-2 * r)} 0z`;
  }
  const x = w / 2 - r;
  return `M${round(-x)} ${round(r)}a${round(r)} ${round(r)} 0 0 1 0 ${round(-2 * r)}h${round(2 * x)}a${round(r)} ${round(r)} 0 0 1 0 ${round(2 * r)}z`;
}

/** Projects both eyes onto a sphere behind the face, so they narrow near the rim and fade round the back. */
function drawEyes(
  face: Pick<Face, "eyes" | "split">,
  gaze: Gaze,
  lid: number,
  head: Head,
): [EyeDraw, EyeDraw] {
  const r = (head.rx + head.ry) / 2;
  let forward: Vec = [0, 0, 1];
  let right: Vec = [1, 0, 0];
  let up: Vec = [0, 1, 0];
  [forward, right] = turn(forward, right, radians(gaze.yaw));
  [up, forward] = turn(up, forward, radians(gaze.pitch));
  [right, up] = turn(right, up, radians(gaze.roll));

  const draw = (eye: Eye, side: -1 | 1): EyeDraw => {
    const [point, tangent] = turn(forward, right, radians(face.split * side));
    const c = Math.cos(radians(eye.tilt));
    const s = Math.sin(radians(eye.tilt));
    const squash = 0.06 + 0.94 * clamp(Math.min(lid, eye.open));
    const matrix = [
      tangent[0] * c + up[0] * s,
      (tangent[1] * c + up[1] * s) * squash,
      -tangent[0] * s + up[0] * c,
      (-tangent[1] * s + up[1] * c) * squash,
      head.x + point[0] * head.rx,
      head.y + point[1] * head.ry,
    ];
    return {
      d: capsule(eye.w * r, eye.h * r),
      transform: `matrix(${matrix.map(round).join(",")})`,
      opacity: round(clamp(point[2] / 0.12)),
    };
  };
  return [draw(face.eyes[0], -1), draw(face.eyes[1], 1)];
}

export function faceFor(task: Task | null): Mood {
  return task ? TASK_FACE[task] : "idle";
}

/** Milliseconds between frames; drift and sleep read the same at lower rates, and every display refresh wakes the GPU process. */
export function frameGap(mood: Mood): number {
  if (mood === "idle") return 1000 / 30;
  if (mood === "sleepy") return 1000 / 20;
  if (mood === "asleep") return 1000 / 8;
  return 0;
}

/** The resting pose, for the first paint and for reduced motion. */
export function restingEyes(head: Head, mood: Mood = "idle") {
  const face = FACES[mood];
  const gaze = {
    yaw: REST.yaw + face.gaze.yaw,
    pitch: REST.pitch + face.gaze.pitch,
    roll: REST.roll + face.gaze.roll,
  };
  return drawEyes(face, gaze, 1, head);
}

function blinkLid(since: number): number {
  const r = since / TIMING.blink;
  if (r < 0 || r > 1) return 1;
  const close = TIMING.blinkClose;
  return r < close ? 1 - r / close : (r - close) / (1 - close);
}

/** Anticipation squash, airborne stretch, then a settling wobble; y is in head radii, negative is up. */
function hop(since: number) {
  if (since < 0 || since > TIMING.hop) return { y: 0, sx: 1, sy: 1 };
  if (since < 0.08) {
    const k = Math.sin((since / 0.08) * (Math.PI / 2));
    return { y: 0, sx: 1 + 0.08 * k, sy: 1 - 0.12 * k };
  }
  if (since < 0.46) {
    const k = (since - 0.08) / 0.38;
    const stretch = 0.1 * Math.abs(1 - 2 * k);
    return { y: -1.74 * k * (1 - k), sx: 1 - stretch * 0.6, sy: 1 + stretch };
  }
  const k = (since - 0.46) / 0.29;
  const squash = 0.14 * (1 - k) ** 2 * Math.cos(k * TAU * 1.2);
  return { y: 0, sx: 1 + squash * 0.7, sy: 1 - squash };
}

export interface Pose {
  mood: Mood;
  /** For the group that holds the body, the tail and the clipped eyes. */
  transform: string;
  eyes: [EyeDraw, EyeDraw];
  /** Tail angle in degrees and its foreshortening as it sweeps toward and away from you. */
  tail: { angle: number; scale: number };
  /** The hop's stretch, eased a beat late, for parts that trail the body. */
  trail: number;
}

export type Avatar = ReturnType<typeof createAvatar>;

/** Pass a seeded random to make every frame repeatable for tests and contact sheets. */
export function createAvatar({
  head,
  pivot,
  random = Math.random,
}: {
  head: Head;
  pivot: Point;
  random?: () => number;
}) {
  const r = (head.rx + head.ry) / 2;
  const span = (min: number, max: number) => min + random() * (max - min);
  const between = ([min, max]: readonly [number, number]) => span(min, max);
  /** Fish mount together in lists, so each drifts on its own clock. */
  const phase = span(0, 100);

  const face: Face = structuredClone(FACES.idle);
  const gaze = { ...REST };
  const lean = { x: 0, y: 0, angle: 0, excited: 0, trail: 0 };
  const glance = { yaw: 0, pitch: 0, until: 0, next: span(1.5, 3), side: 1 };
  let t = 0;
  let quiet = 0;
  let inside = false;
  let overAction = false;
  let pointer: Point | null = null;
  let task: Task | null = null;
  let leftAt = -10;
  let blinkAt = -10;
  let nextBlink = span(1, 2.5);
  let spinAt = -10;
  let hopAt = -10;
  let happyUntil = -10;
  let stroke = span(0, TAU);

  const mood = (): Mood => {
    if (t < happyUntil) return "happy";
    if (task) return TASK_FACE[task];
    if (overAction) return "excited";
    if (inside) return "attentive";
    if (quiet > TIMING.asleep) return "asleep";
    if (quiet > TIMING.sleepy) return "sleepy";
    return "idle";
  };

  const follow = (at: Point): Gaze => {
    const yaw = clamp(degrees(Math.atan2(at.x, 90)), -45, 45);
    const pitch = 12 + clamp(degrees(Math.atan2(-at.y, 70)), -45, 35) * 0.6;
    return { yaw, pitch, roll: REST.roll - yaw * 0.1 };
  };

  const press = () => {
    hopAt = t;
    happyUntil = t + TIMING.happy;
    quiet = 0;
  };

  const pickGlance = (current: Mood) => {
    const plan = glancesFor(current);
    if (plan) {
      glance.side = -glance.side;
      glance.yaw = plan.sweep
        ? glance.side * between(plan.yaw)
        : between(plan.yaw);
      glance.pitch = between(plan.pitch);
      glance.next = t + between(plan.gap);
      glance.until = glance.next;
      return;
    }
    if (current !== "idle") return;
    const wide = random() < TIMING.wideGlance;
    glance.yaw = wide ? span(-40, 30) : span(-10, 10);
    glance.pitch = wide ? span(-25, 12) : span(-6, 6);
    glance.until = t + between(TIMING.glanceHold);
    glance.next = glance.until + between(TIMING.glanceGap);
    if (Math.abs(glance.yaw) > 25) blinkAt = t;
  };

  return {
    get mood() {
      return mood();
    },
    task(next: Task | null) {
      if (next === task) return;
      if (next === "pleased") hopAt = t;
      task = next;
      quiet = 0;
      glance.next = t;
    },
    enter() {
      if (quiet > TIMING.sleepy || t - leftAt > TIMING.spinAfterAway) {
        spinAt = t;
        blinkAt = t;
      }
      inside = true;
      quiet = 0;
    },
    /** Offset of the pointer from the character's centre, in CSS pixels. */
    move(x: number, y: number) {
      pointer = { x, y };
      inside = true;
      quiet = 0;
    },
    leave() {
      inside = false;
      pointer = null;
      leftAt = t;
    },
    hover(on: boolean) {
      overAction = on;
    },
    press,
    step(seconds: number): Pose {
      const dt = Math.min(seconds, TIMING.maxStep);
      t += dt;
      const current = mood();
      if (!inside && !task) quiet += dt;

      if (t > glance.next) pickGlance(current);
      if (t > glance.until) {
        glance.yaw = 0;
        glance.pitch = 0;
      }

      if (t > nextBlink && current !== "asleep") {
        blinkAt = t;
        nextBlink = t + between(TIMING.blinkGap);
        if (random() < TIMING.doubleBlink) nextBlink = t + 0.24;
      }

      const target = FACES[current];
      const morph = ease(dt, TIMING.morph);
      face.split = lerp(face.split, target.split, morph);
      face.fin.period = lerp(face.fin.period, target.fin.period, morph);
      face.fin.swing = lerp(face.fin.swing, target.fin.swing, morph);
      for (const key of AXES)
        face.gaze[key] = lerp(face.gaze[key], target.gaze[key], morph);
      face.eyes.forEach((eye, index) => {
        for (const key of EYE)
          eye[key] = lerp(
            eye[key],
            target.eyes[index]?.[key] ?? eye[key],
            morph,
          );
      });

      const aim =
        pointer && !task && current !== "happy"
          ? follow(pointer)
          : {
              yaw: REST.yaw + glance.yaw,
              pitch: REST.pitch + glance.pitch,
              roll: REST.roll,
            };
      const snap = ease(dt, TIMING.eyes);
      for (const key of AXES)
        gaze[key] = lerp(gaze[key], aim[key] + face.gaze[key], snap);

      const at = t + phase;
      const drift = pointer ? 0.35 : current === "asleep" ? 0 : 1;
      const spin =
        t - spinAt < TIMING.spin
          ? 360 * (1 - easeOutQuint((t - spinAt) / TIMING.spin))
          : 0;
      const roll = wave(at, 13.7, 3.2) * 2.2 * drift;
      const final = {
        yaw:
          gaze.yaw +
          (wave(at, 11.3, 0.4) * 5.5 + wave(at, 3.7, 2.1) * 1.6) * drift -
          spin,
        pitch:
          gaze.pitch +
          (wave(at, 9.1, 1.3) * 4.2 + wave(at, 4.3, 0.7) * 1.3) * drift,
        roll: gaze.roll + roll,
      };

      const settle = ease(dt, TIMING.body);
      const turned = gaze.yaw - REST.yaw;
      lean.angle = lerp(
        lean.angle,
        clamp(turned * 0.07, -4, 4) + roll * 0.5,
        settle,
      );
      lean.x = lerp(lean.x, clamp(turned * 0.0022, -0.11, 0.11) * r, settle);
      lean.y = lerp(
        lean.y,
        clamp((REST.pitch - gaze.pitch) * 0.0017, -0.076, 0.076) * r,
        settle,
      );
      lean.excited = lerp(lean.excited, current === "excited" ? 1 : 0, settle);

      const resting = current === "asleep" || current === "sleepy";
      const breath = resting
        ? Math.sin((at / TIMING.sleepBreath) * TAU) * 0.03
        : Math.sin((at / TIMING.breath) * TAU) * 0.012;
      const jump = hop(t - hopAt);
      lean.trail = lerp(lean.trail, jump.sy - 1, settle);
      const x = lean.x + wave(at, 7.9, 1.9) * 0.033 * r;
      const y =
        lean.y +
        wave(at, 5.3, 0.3) * 0.065 * r +
        jump.y * r -
        Math.abs(Math.sin(t * TAU * 1.4)) * 0.076 * r * lean.excited;
      const sx = jump.sx * (1 - breath * 0.4);
      const sy = jump.sy * (1 + breath);

      stroke += (dt / face.fin.period) * TAU;
      const beat = Math.sin(stroke);

      return {
        mood: current,
        transform: `translate(${round(x)} ${round(y)}) rotate(${round(lean.angle)} ${pivot.x} ${pivot.y}) translate(${pivot.x} ${pivot.y}) scale(${round(sx)} ${round(sy)}) translate(${-pivot.x} ${-pivot.y})`,
        eyes: drawEyes(face, final, blinkLid(t - blinkAt), head),
        tail: {
          angle: round(beat * face.fin.swing * 0.5 - lean.trail * 90),
          scale: round(1 - 0.22 * beat * beat),
        },
        trail: round(lean.trail),
      };
    },
  };
}
