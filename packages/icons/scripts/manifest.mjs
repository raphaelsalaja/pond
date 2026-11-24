/** Checks svg/manifest.json and the seed against their drawings and registered parts. */
import { flatten, segments } from "./geometry.mjs";
import { fileName } from "./lib.mjs";

const TOLERANCE = 0.03;
const BASE_MIN = 0.5;
/** A badge or slash cuts its host up to 3 from its own center line. */
const CUT = 3;
/** A badge clears its host out of this hole, matching `src/parts/badge.mjs`. */
const BADGE = { cx: 13.125, cy: 13.125, hole: 5 };
const inBadge = ([x, y]) =>
  Math.hypot(x - BADGE.cx, y - BADGE.cy) <= BADGE.hole + TOLERANCE;
export const cuts = (part) => /^(badge-|slash$)/.test(part);

function outline(nodes) {
  const lines = [];
  for (const [tag, attrs] of nodes) {
    for (const segment of segments(tag, attrs)) {
      const points = flatten([segment], 0.05);
      for (let i = 1; i < points.length; i++) {
        lines.push([points[i - 1], points[i]]);
      }
    }
  }
  return lines;
}

function near(point, lines, within = TOLERANCE) {
  for (const [a, b] of lines) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const length = dx * dx + dy * dy;
    const dot = (point[0] - a[0]) * dx + (point[1] - a[1]) * dy;
    const t = length ? Math.max(0, Math.min(1, dot / length)) : 0;
    const d = Math.hypot(point[0] - a[0] - dx * t, point[1] - a[1] - dy * t);
    if (d <= within) {
      return true;
    }
  }
  return false;
}

const points = (part) =>
  part.flatMap(([tag, attrs]) => flatten(segments(tag, attrs), 0.1));

/** Share of `part` that lies on the strokes of `nodes`, from 0 to 1. */
function coverage(part, nodes) {
  const lines = outline(nodes);
  const all = points(part);
  if (all.length === 0) {
    return 0;
  }
  return all.filter((point) => near(point, lines)).length / all.length;
}

/**
 * A miss for each named part that `nodes` no longer draws where its source does.
 * @remarks A host may leave its part only within `CUT` of a badge or slash, or inside a badge's hole, so a moved tab fails too.
 */
export function partMisses(file, names, nodes, parts, { dir = "parts" } = {}) {
  const misses = [];
  const lines = outline(nodes);
  for (const part of names) {
    const source = parts.get(part);
    if (!source) {
      misses.push({
        file,
        rule: "part-unknown",
        message: `no ${dir}/${part}.svg`,
      });
      continue;
    }
    const cutters = cuts(part)
      ? []
      : names
          .filter((other) => cuts(other) && parts.has(other))
          .flatMap((other) => outline(parts.get(other)));
    const badged =
      !cuts(part) &&
      names.some((other) => other.startsWith("badge-") && parts.has(other));
    const off = points(source).filter(
      (point) =>
        !near(point, lines) &&
        !near(point, cutters, CUT) &&
        !(badged && inBadge(point)),
    );
    if (off.length > 0) {
      const [x, y] = off[0].map((value) => Math.round(value * 1000) / 1000);
      misses.push({
        file,
        rule: "part-drift",
        message: `${part} leaves ${dir}/${part}.svg at (${x}, ${y})${cutters.length ? ", away from any cut" : ""}`,
      });
    }
  }
  return misses;
}

const styleOf = (entry) =>
  entry.variants?.find((variant) => !variant.state)?.style;
const hasOpen = (entry) =>
  Boolean(entry.variants?.some((variant) => variant.state === "open"));

/** A solid twin shares its outline's concept; any other repeat is a miss. */
export function validate({ glyphs, manifest, migration = {}, parts }) {
  const misses = [];
  const miss = (file, rule, message) => misses.push({ file, rule, message });

  const concepts = new Map();
  for (const [name, entry] of Object.entries(manifest)) {
    const file = `svg/${name}`;
    const glyph = glyphs.get(name);
    if (!glyph) {
      miss("svg/manifest.json", "manifest-orphan", `${name} has no drawing`);
      continue;
    }
    if (!entry.concept) {
      miss(file, "concept-missing", "no concept");
    }
    if (!entry.tags?.length) {
      miss(file, "tags-missing", "no tags");
    }
    if (entry.concept && !entry.picker) {
      const key = entry.concept.toLowerCase();
      concepts.set(key, [...(concepts.get(key) ?? []), name]);
    }

    if (entry.base) {
      const base = glyphs.get(entry.base);
      if (!base || !manifest[entry.base]) {
        miss(file, "base-missing", `base ${entry.base} has no drawing`);
      } else if (base.style === glyph.style) {
        const share = coverage(base.nodes, glyph.nodes);
        if (share < BASE_MIN) {
          miss(
            file,
            "base-drift",
            `reuses ${Math.round(share * 100)}% of ${entry.base}`,
          );
        }
      }
    }

    misses.push(...partMisses(file, entry.parts ?? [], glyph.nodes, parts));
  }

  for (const [name, entry] of Object.entries(migration)) {
    const file = "migration.json";
    if (entry.state === "Coupled") {
      const target = fileName((entry.to ?? "").replace(/^Icon/, ""));
      if (!glyphs.has(target)) {
        miss(file, "migration-target", `${name} couples to ${entry.to}`);
      }
    } else if (entry.state === "Removed") {
      if (glyphs.has(name) || entry.references !== 0) {
        miss(file, "migration-removed", `${name} is removed but still used`);
      }
    } else {
      miss(file, "migration-todo", `${name} has no replacement`);
    }
  }

  for (const names of concepts.values()) {
    const twins = names.filter((name) => {
      const { base } = manifest[name];
      return !(
        names.includes(base) &&
        styleOf(manifest[base]) !== styleOf(manifest[name])
      );
    });
    if (twins.length > 1) {
      for (const name of twins) {
        miss(
          `svg/${name}`,
          "concept-shared",
          `"${manifest[name].concept}" also answers ${twins.filter((n) => n !== name).join(", ")}`,
        );
      }
    }
  }
  return misses;
}

export function report(misses) {
  const counts = new Map();
  for (const { rule } of misses) {
    counts.set(rule, (counts.get(rule) ?? 0) + 1);
  }
  const rows = [...counts].sort((a, b) => b[1] - a[1]);
  return [
    "# Icon report",
    "",
    "The build stops until every line here is fixed. Fix the drawing, svg/manifest.json, or migration.json, then run `pnpm --filter @pond/icons generate`.",
    "",
    ...misses.map(
      ({ file, rule, message }) => `- ${file} - [${rule}] ${message}`,
    ),
    "",
    "| Rule | Count |",
    "| --- | --- |",
    ...rows.map(([rule, count]) => `| ${rule} | ${count} |`),
    "",
  ].join("\n");
}

const cell = (value) => value.replaceAll("|", String.raw`\|`);

export function conceptsTable(manifest) {
  const entries = Object.entries(manifest);
  const concepts = entries
    .filter(([, entry]) => !entry.picker)
    .sort(([a, x], [b, y]) =>
      x.concept === y.concept
        ? a.localeCompare(b)
        : x.concept.localeCompare(y.concept),
    );
  const picker = entries.filter(([, entry]) => entry.picker);
  return [
    "# Concepts",
    "",
    "Generated from `svg/manifest.json` by `pnpm --filter @pond/icons generate`. Edit the manifest, not this file.",
    "",
    "Each concept has one icon, and each icon answers one concept. A solid twin shares its outline's concept. Tags are the words someone searches for.",
    "",
    "| Concept | Icon | Style | Tags |",
    "| --- | --- | --- | --- |",
    ...concepts.map(
      ([name, entry]) =>
        `| ${cell(entry.concept)} | \`${name}\` | ${styleOf(entry)} | ${cell(entry.tags.join(", "))} |`,
    ),
    "",
    "## Folder picker",
    "",
    "The folder icon picker (`folder-icons.tsx`) is a catalogue of objects, not concepts, so these are exempt from the one-concept rule. Each has an `-open` drawing for an expanded folder.",
    "",
    picker.map(([name]) => `\`${name}\``).join(", "),
    "",
  ].join("\n");
}

export function counts(manifest, parts) {
  const entries = Object.values(manifest);
  const solid = entries.filter((entry) => styleOf(entry) === "fill").length;
  const open = entries.filter(hasOpen).length;
  const picker = entries.filter((entry) => entry.picker).length;
  return `${entries.length} icons: ${entries.length - solid} outline and ${solid} solid, plus ${open} open states. ${picker} are folder picker objects. ${parts.size} registered parts.`;
}
