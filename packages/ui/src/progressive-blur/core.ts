import { BOTTOM, CURVE, type Recipe, SHARP, SOFT, TOP } from "./apple";

export type Side = "top" | "bottom" | "left" | "right";

/**
 * How the wide blur blends over the sharp one: `blend` needs WebKit's `mix-blend-mode` on backdrops,
 * `filter` needs Chromium's SVG `backdrop-filter`, `plain` is one opacity for everything else.
 */
export type Technique = "auto" | "blend" | "filter" | "plain";

export interface ProgressiveBlurOptions {
  /** Where the blur is strongest. */
  side?: Side;
  /** The color the edge fades into, the first background behind the element by default. */
  color?: string;
  scheme?: "light" | "dark" | "auto";
  /** Where the fall begins, as a fraction of the element's size. */
  start?: number;
  /** Where the fall reaches nothing. */
  end?: number;
  technique?: Technique;
}

const LEVELS = 4;
const STOPS = 24;
const DIRECTION = {
  top: "to bottom",
  bottom: "to top",
  left: "to right",
  right: "to left",
} satisfies Record<Side, string>;

const clamp = (n: number) => Math.min(1, Math.max(0, n));

function mask(t: number, start: number, end: number) {
  if (t <= start) return 1;
  if (t >= end) return 0;
  const u = ((t - start) / (end - start)) * (CURVE.length - 1);
  const i = Math.floor(u);
  const a = CURVE[i] ?? 0;
  const b = CURVE[i + 1] ?? a;
  return a + (b - a) * (u - i);
}

function gradient(
  side: Side,
  start: number,
  end: number,
  alpha: (m: number) => number,
) {
  const stops = [0, start];
  for (let i = 1; i < STOPS; i++) {
    stops.push(start + ((end - start) * i) / STOPS);
  }
  stops.push(end, 1);
  const list = stops.map((t) => {
    const a = Math.round(alpha(mask(t, start, end)) * 1000) / 1000;
    return `rgb(0 0 0 / ${a}) ${Math.round(t * 10000) / 100}%`;
  });
  return `linear-gradient(${DIRECTION[side]}, ${list.join(", ")})`;
}

function sharp(m: number) {
  let i = 1;
  while (i < SHARP.length - 1 && (SHARP[i]?.[0] ?? 1) < m) i++;
  const [m0, s0] = SHARP[i - 1] ?? [0, 0];
  const [m1, s1] = SHARP[i] ?? [1, 0];
  return s0 + (s1 - s0) * clamp((m - m0) / (m1 - m0));
}

/** Lighten only moves pixels the wide blur brightens (`up`), darken only those it dims (`down`). */
function reach(r: Recipe, m: number) {
  const n = r.normal * m;
  return { up: n + r.lighten * m * (1 - n), down: n + r.darken * m * (1 - n) };
}

function detect(): Exclude<Technique, "auto"> {
  const ua = navigator.userAgent;
  if (/Chrome\//.test(ua)) return "filter";
  if (/AppleWebKit/.test(ua) && !/Android/.test(ua)) return "blend";
  return "plain";
}

function backdropColor(element: HTMLElement) {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const color = getComputedStyle(node).backgroundColor;
    if (color && color !== "transparent" && !/^rgba\(.*,\s*0\)$/.test(color)) {
      return color;
    }
  }
  return "Canvas";
}

const SVG = "http://www.w3.org/2000/svg";
const filters = new Map<string, string>();

function svgFilter(r: Recipe) {
  const key = `${r.fill}-${r.normal}-${r.lighten}-${r.darken}`;
  const known = filters.get(key);
  if (known && document.getElementById(known)) return known;
  const id = `pond-progressive-blur-${filters.size}`;
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
  svg.innerHTML = `<filter id="${id}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
    <feGaussianBlur in="SourceGraphic" stdDeviation="${r.fill}" edgeMode="duplicate" result="b"/>
    <feComposite in="SourceGraphic" in2="b" operator="arithmetic" k2="${1 - r.normal}" k3="${r.normal}" result="n"/>
    <feBlend in="n" in2="b" mode="lighten" result="lighter"/>
    <feComposite in="n" in2="lighter" operator="arithmetic" k2="${1 - r.lighten}" k3="${r.lighten}" result="l"/>
    <feBlend in="l" in2="b" mode="darken" result="darker"/>
    <feComposite in="l" in2="darker" operator="arithmetic" k2="${1 - r.darken}" k3="${r.darken}"/>
  </filter>`;
  document.body.append(svg);
  filters.set(key, id);
  return id;
}

interface Layer {
  backdrop?: string;
  blend?: string;
  background?: string;
  alpha: (m: number) => number;
}

function layers(
  r: Recipe,
  technique: Exclude<Technique, "auto">,
  color: string,
): Layer[] {
  /** The veil sits under the blur so the wide blur smears its fade too. */
  const out: Layer[] = [{ background: color, alpha: (m) => r.veil * m }];
  const most = sharp(1);
  for (let k = 1; k <= LEVELS; k++) {
    const from = (most * (k - 1)) / LEVELS;
    const to = (most * k) / LEVELS;
    /** Each level blurs the ones under it, so variances add up to the level reached. */
    const sigma = Math.sqrt(to * to - from * from);
    out.push({
      backdrop: `blur(${sigma.toFixed(2)}px)`,
      alpha: (m) => clamp((sharp(m) - from) / (to - from)),
    });
  }
  const wide = `blur(${r.fill}px)`;
  if (technique === "blend") {
    if (r.normal) out.push({ backdrop: wide, alpha: (m) => r.normal * m });
    if (r.lighten) {
      out.push({
        backdrop: wide,
        blend: "lighten",
        alpha: (m) => r.lighten * m,
      });
    }
    if (r.darken) {
      out.push({ backdrop: wide, blend: "darken", alpha: (m) => r.darken * m });
    }
  } else if (technique === "filter") {
    const full = reach(r, 1);
    out.push({
      backdrop: `url(#${svgFilter(r)})`,
      alpha: (m) => {
        const { up, down } = reach(r, m);
        return (up / full.up + down / full.down) / 2;
      },
    });
  } else {
    out.push({
      backdrop: wide,
      alpha: (m) => {
        const { up, down } = reach(r, m);
        return (up + down) / 2;
      },
    });
  }
  return out;
}

/**
 * Fills an empty, positioned `host` with the iOS soft scroll edge and returns its cleanup.
 * @remarks `backdrop-filter` stops at the nearest ancestor with opacity, a filter or a mask, so keep the host outside them.
 */
export function progressiveBlur(
  host: HTMLElement,
  options: ProgressiveBlurOptions = {},
): () => void {
  let nodes: HTMLElement[] = [];
  const dark = matchMedia("(prefers-color-scheme: dark)");

  function render() {
    for (const node of nodes) node.remove();
    const side = options.side ?? "top";
    const edge = side === "bottom" ? BOTTOM : TOP;
    const start = options.start ?? edge.start;
    const end = options.end ?? edge.end;
    const scheme = options.scheme ?? "auto";
    const recipe =
      SOFT[scheme === "auto" ? (dark.matches ? "dark" : "light") : scheme];
    const technique =
      !options.technique || options.technique === "auto"
        ? detect()
        : options.technique;
    const color = options.color ?? backdropColor(host);

    nodes = layers(recipe, technique, color).map((layer) => {
      const node = document.createElement("div");
      const style = node.style;
      style.cssText = "position:absolute;inset:0;pointer-events:none";
      if (layer.backdrop) {
        style.setProperty("backdrop-filter", layer.backdrop);
        style.setProperty("-webkit-backdrop-filter", layer.backdrop);
      }
      if (layer.blend) style.mixBlendMode = layer.blend;
      if (layer.background) style.background = layer.background;
      const image = gradient(side, start, end, layer.alpha);
      style.setProperty("mask-image", image);
      style.setProperty("-webkit-mask-image", image);
      return node;
    });
    host.prepend(...nodes);
  }

  const onScheme = () => {
    if ((options.scheme ?? "auto") === "auto") render();
  };
  dark.addEventListener("change", onScheme);
  render();

  return () => {
    dark.removeEventListener("change", onScheme);
    for (const node of nodes) node.remove();
    nodes = [];
  };
}
