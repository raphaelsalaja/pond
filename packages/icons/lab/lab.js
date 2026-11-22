/** Icons Lab: opens from disk, reads data.js, which the icon build writes. */
(() => {
  const DATA = window.POND_ICONS;
  const root = document.getElementById("lab");

  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const paintTheme = () => {
    document.documentElement.dataset.theme = media.matches ? "dark" : "light";
  };
  paintTheme();
  media.addEventListener("change", paintTheme);

  const SVG_NS = "http://www.w3.org/2000/svg";
  const SVG_TAGS = new Set(["svg", "path", "circle", "rect", "g", "mask"]);

  function h(tag, attrs, ...children) {
    const el = SVG_TAGS.has(tag)
      ? document.createElementNS(SVG_NS, tag)
      : document.createElement(tag);
    for (const [key, value] of Object.entries(attrs ?? {})) {
      if (value == null || value === false) continue;
      if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
      else el.setAttribute(key, value === true ? "" : String(value));
    }
    for (const child of children.flat(Infinity)) {
      if (child == null || child === false) continue;
      el.append(child instanceof Node ? child : String(child));
    }
    return el;
  }

  if (!DATA) {
    root.append(
      h(
        "p",
        { class: "page description" },
        "No icon data yet. Run pnpm --filter @pond/icons generate, then reload.",
      ),
    );
    return;
  }

  let uid = 0;
  const nextId = (prefix) => `${prefix}-${++uid}`;
  const kebab = (key) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  const kebabAll = (attrs) =>
    Object.fromEntries(Object.entries(attrs).map(([k, v]) => [kebab(k), v]));
  const pascal = (name) =>
    name
      .split("-")
      .map((part) => part[0].toUpperCase() + part.slice(1))
      .join("");
  const componentName = (name) => `Icon${pascal(name)}`;
  /** `IconArrowRotate2` becomes `arrow-rotate-2`, matching scripts/lib.mjs. */
  const fileName = (component) =>
    component
      .replace(/^Icon/, "")
      .replace(/([a-z])([A-Z0-9])/g, "$1-$2")
      .replace(/([0-9])([A-Z])/g, "$1-$2")
      .toLowerCase();

  /** Draws like create-icon.ts: outline strokes stay 1.25 on screen up to 18px. */
  function drawNodes(nodes, style, size, cls) {
    const outline = style === "outline";
    const paint = outline
      ? {
          fill: "none",
          stroke: "currentColor",
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
          "stroke-width": 1.25,
        }
      : { fill: "currentColor" };
    const fixed =
      outline && size <= 18 ? { "vector-effect": "non-scaling-stroke" } : {};
    return h(
      "svg",
      {
        viewBox: "0 0 18 18",
        width: size,
        height: size,
        "aria-hidden": "true",
        class: cls,
        ...paint,
      },
      nodes.map(([tag, attrs]) => h(tag, { ...fixed, ...kebabAll(attrs) })),
    );
  }

  function icon(name, size = 18, cls) {
    const glyph = DATA.icons[name];
    return glyph ? drawNodes(glyph.nodes, glyph.style, size, cls) : null;
  }

  function partIcon(name, size, cls) {
    const nodes = DATA.parts[name];
    return nodes ? drawNodes(nodes, "outline", size, cls) : null;
  }

  function shape(value, paint = {}) {
    return typeof value === "string"
      ? h("path", { d: value, ...paint })
      : h("circle", { cx: value.cx, cy: value.cy, r: value.r, ...paint });
  }

  function glyph(
    { shapes = [], size = 18, width = 1.25, cap = "round", join = "round" },
    ...children
  ) {
    return h(
      "svg",
      {
        viewBox: "0 0 18 18",
        width: size,
        height: size,
        fill: "none",
        stroke: "currentColor",
        "stroke-width": width,
        "stroke-linecap": cap,
        "stroke-linejoin": join,
        "aria-hidden": "true",
      },
      shapes.map((value) => shape(value)),
      children,
    );
  }

  const SLASH = "M2.25 2.25L15.75 15.75";

  /** The base stops 1 short of the slash's edge: 1.25 stroke plus 1 each side. */
  function cleared(shapes, { size = 18, cap = "round", join = "round" } = {}) {
    const mask = nextId("clear");
    return glyph(
      { size, cap, join },
      h(
        "mask",
        { id: mask, maskUnits: "userSpaceOnUse", width: 18, height: 18 },
        h("rect", { width: 18, height: 18, fill: "white", stroke: "none" }),
        h("path", { d: SLASH, stroke: "black", "stroke-width": 3.25 }),
      ),
      h(
        "g",
        { mask: `url(#${mask})` },
        shapes.map((value) => shape(value)),
      ),
      h("path", { d: SLASH }),
    );
  }

  /** A library sidebar group whose last row starts selected. */
  function panel(rows) {
    const buttons = rows.map((row, index) =>
      h(
        "button",
        {
          type: "button",
          class: "row",
          "data-active": index === rows.length - 1,
          onclick: (event) => {
            for (const button of buttons) {
              button.toggleAttribute(
                "data-active",
                button === event.currentTarget,
              );
            }
          },
        },
        h("span", { class: "icon" }, row.icon()),
        h("span", { class: "text" }, row.label),
        row.count != null ? h("span", { class: "count" }, row.count) : null,
      ),
    );
    return h("div", { class: "panel" }, h("div", { class: "group" }, buttons));
  }

  function tile({ name, note, themes = ["dark", "light"], picked }, make) {
    return h(
      "figure",
      { class: "tile" },
      themes.map((theme) => h("div", { "data-theme": theme }, make())),
      h(
        "figcaption",
        { class: "caption" },
        h("span", { class: "name" }, picked ? `${name}, Picked` : name),
        note,
      ),
    );
  }

  function section(title, description, body) {
    return h(
      "section",
      { class: "section", id: title.toLowerCase().replace(/\s+/g, "-") },
      h(
        "header",
        { class: "heading" },
        h("h2", { class: "label" }, title),
        description ? h("p", { class: "description" }, description) : null,
      ),
      body,
    );
  }

  /** Butt ends are drawn 0.625 longer so each direction keeps the same ink extent. */
  const DIRECTIONS = [
    {
      name: "Keep the Old Style",
      values: "1.25 stroke, round ends and joins, every corner rounded",
      width: 1.25,
      cap: "round",
      join: "round",
      glyphs: {
        clock: [{ cx: 9, cy: 9, r: 7.29 }, "M9 5.49L9 9L11.43 10.62"],
        open: ["M4.68 13.32L13.32 4.68M8.46 4.68L13.32 4.68L13.32 9.54"],
        folderPlus: [
          "M8.622 15.48L4.95 15.48A3.24 3.24 0 0 1 1.71 12.24L1.71 5.76A3.24 3.24 0 0 1 4.95 2.52L6.624 2.52A1.89 1.89 0 0 1 8.136 3.276L8.892 4.41L13.05 4.41A3.24 3.24 0 0 1 16.29 7.65L16.29 9.292",
          "M13.86 11.43L13.86 16.29M11.43 13.86L16.29 13.86",
        ],
      },
    },
    {
      name: "Neutral",
      picked: true,
      values: "1.25 stroke, butt ends, 1.5 outside and 0 inside corners",
      width: 1.25,
      cap: "butt",
      join: "miter",
      glyphs: {
        clock: [{ cx: 9, cy: 9, r: 7.29 }, "M9 4.865L9 9L11.5 11.5"],
        open: ["M4.238 13.762L13.32 4.68M7.835 4.68L13.32 4.68L13.32 10.165"],
        folderPlus: [
          "M9.247 15.48L3.21 15.48A1.5 1.5 0 0 1 1.71 13.98L1.71 4.02A1.5 1.5 0 0 1 3.21 2.52L6.75 2.52L8.64 4.41L14.79 4.41A1.5 1.5 0 0 1 16.29 5.91L16.29 9.917",
          "M13.86 10.805L13.86 16.915M10.805 13.86L16.915 13.86",
        ],
      },
    },
    {
      name: "Round",
      values: "1.5 stroke, round ends, 3.5 corners, curves before corners",
      width: 1.5,
      cap: "round",
      join: "round",
      glyphs: {
        clock: [{ cx: 9, cy: 9, r: 7.165 }, "M9 5.7L9 9L11.25 10.5"],
        open: [
          "M4.805 13.195L12.756 5.244",
          "M8.6 4.805L11.695 4.805A1.5 1.5 0 0 1 13.195 6.305L13.195 9.4",
        ],
        folderPlus: [
          "M8.5 15.355L5.335 15.355A3.5 3.5 0 0 1 1.835 11.855L1.835 6.145A3.5 3.5 0 0 1 5.335 2.645L6.3 2.645C7.4 2.645 7.5 4.535 8.7 4.535L12.665 4.535A3.5 3.5 0 0 1 16.165 8.035L16.165 9.2",
          "M13.86 11.555L13.86 16.165M11.555 13.86L16.165 13.86",
        ],
      },
    },
  ];

  const DIRECTION_ROWS = [
    { label: "Recently Added", glyph: "clock", count: 24 },
    { label: "Open", glyph: "open" },
    { label: "New Folder", glyph: "folderPlus" },
  ];

  function directions() {
    return h(
      "div",
      { class: "tiles" },
      DIRECTIONS.map((direction) =>
        tile(
          {
            name: direction.name,
            note: direction.values,
            picked: direction.picked,
          },
          () =>
            panel(
              DIRECTION_ROWS.map((row) => ({
                label: row.label,
                count: row.count,
                icon: () =>
                  glyph({
                    shapes: direction.glyphs[row.glyph],
                    width: direction.width,
                    cap: direction.cap,
                    join: direction.join,
                  }),
              })),
            ),
        ),
      ),
    );
  }

  /** Silhouettes sit on the line icon's outer edge; stroked details step up to 1.5. */
  const DUO_GLYPHS = {
    image: {
      bg: "M4 1L11 1L15.5 5.5L15.5 15.5A1.5 1.5 0 0 1 14 17L4 17A1.5 1.5 0 0 1 2.5 15.5L2.5 2.5A1.5 1.5 0 0 1 4 1Z",
      fg: [
        { d: "M6.75 6A1.5 1.5 0 1 1 6.75 9A1.5 1.5 0 1 1 6.75 6Z" },
        {
          d: "M4.5 14.5L4.5 12.5L7.5 9.5L10 12L11.5 10.5L13.5 12.5L13.5 14.5Z",
        },
      ],
    },
    clock: {
      bg: { cx: 9, cy: 9, r: 7.9 },
      fg: [{ d: "M9 4.75L9 9L11.75 11.75", stroke: true }],
    },
    tag: {
      bg: "M2.5 3.5L11.5 3.5L17 9L11.5 14.5L2.5 14.5A1.5 1.5 0 0 1 1 13L1 5A1.5 1.5 0 0 1 2.5 3.5Z",
      fg: [
        {
          d: "M11.75 7.75A1.25 1.25 0 1 1 11.75 10.25A1.25 1.25 0 1 1 11.75 7.75Z",
        },
      ],
    },
    folderMore: {
      bg: "M1 3.5A1.5 1.5 0 0 1 2.5 2L6.75 2L8.5 3.75L15.5 3.75A1.5 1.5 0 0 1 17 5.25L17 14.5A1.5 1.5 0 0 1 15.5 16L2.5 16A1.5 1.5 0 0 1 1 14.5Z",
      fg: [
        {
          d: "M13.5 10A3.5 3.5 0 1 1 13.5 17A3.5 3.5 0 1 1 13.5 10ZM11.75 12.85A0.65 0.65 0 1 0 11.75 14.15A0.65 0.65 0 1 0 11.75 12.85ZM13.5 12.85A0.65 0.65 0 1 0 13.5 14.15A0.65 0.65 0 1 0 13.5 12.85ZM15.25 12.85A0.65 0.65 0 1 0 15.25 14.15A0.65 0.65 0 1 0 15.25 12.85Z",
        },
      ],
      badge: { cx: 13.5, cy: 13.5, r: 3.5 },
    },
  };

  const DUO_ROWS = [
    { label: "Images", glyph: "image", hue: "purple", count: 412 },
    { label: "Recently Added", glyph: "clock", hue: "orange" },
    { label: "Tags", glyph: "tag", hue: "green" },
    { label: "Moodboards", glyph: "folderMore", hue: "blue", count: 128 },
  ];

  /** The base loses the badge circle plus a 1px moat so the badge reads over its edge. */
  function duo(drawing, hue) {
    const { badge } = drawing;
    const mask = badge ? nextId("moat") : null;
    return h(
      "svg",
      {
        class: "duo",
        "data-hue": hue,
        viewBox: "0 0 18 18",
        width: 18,
        height: 18,
        "aria-hidden": "true",
      },
      badge
        ? h(
            "mask",
            { id: mask, maskUnits: "userSpaceOnUse", width: 18, height: 18 },
            h("rect", { width: 18, height: 18, fill: "white" }),
            h("circle", {
              cx: badge.cx,
              cy: badge.cy,
              r: badge.r + 1,
              fill: "black",
            }),
          )
        : null,
      h(
        "g",
        { class: "bg", mask: mask ? `url(#${mask})` : null },
        shape(drawing.bg),
      ),
      drawing.fg.map((part) =>
        h("path", {
          class: "fg",
          "data-stroke": part.stroke,
          d: part.d,
          "fill-rule": "evenodd",
        }),
      ),
    );
  }

  const DUOS = [
    {
      name: "Duo",
      note: "Default: the base at 0.35 under the detail, both currentColor",
      colored: false,
    },
    {
      name: "Duo, Two Colors",
      note: "The same drawings with .bg and .fg set from CSS",
      colored: true,
    },
  ];

  function fills() {
    return h(
      "div",
      { class: "tiles" },
      DUOS.map((entry) =>
        tile({ name: entry.name, note: entry.note, picked: true }, () =>
          panel(
            DUO_ROWS.map((row) => ({
              label: row.label,
              count: row.count,
              icon: () =>
                duo(DUO_GLYPHS[row.glyph], entry.colored ? row.hue : undefined),
            })),
          ),
        ),
      ),
    );
  }

  const neutral =
    (shapes, width = 1.25) =>
    (size) =>
      glyph({ shapes, size, width, cap: "butt", join: "miter" });
  const round = (shapes) => (size) => glyph({ shapes, size });

  const HEART =
    "M9 6.375A3.5 3.5 0 1 0 3.025 8.85L9 14.825L14.975 8.85A3.5 3.5 0 1 0 9 6.375Z";
  const TAG = [
    "M1.75 3.75L10.75 3.75L16 9L10.75 14.25L1.75 14.25L1.75 12.75L5.5 9L1.75 5.25Z",
  ];
  const FOLD = "M10.08 1.71L10.08 6.42L14.79 6.42";
  const OPEN_KEPT = neutral([
    "M4.238 13.762L13.32 4.68M7.835 4.68L13.32 4.68L13.32 10.165",
  ]);

  const VOICE = [
    {
      rule: "Lines run at 0°, 45° and 90°",
      broken: {
        note: "Head arms bent 13° off the diagonal",
        draw: neutral([
          "M4.238 13.762L13.32 4.68M9.5 3.8L13.32 4.68L12.44 8.5",
        ]),
      },
      kept: { note: "open: body and head on 45° and 90°", draw: OPEN_KEPT },
    },
    {
      rule: "A curve is a circle or a true arc, never a free curve",
      broken: {
        note: "A heart from free curves",
        draw: neutral([
          "M9 15C2 10.5 2.2 4.5 6 4.5C7.6 4.5 8.5 5.6 9 6.6C9.5 5.6 10.4 4.5 12 4.5C15.8 4.5 16 10.5 9 15Z",
        ]),
      },
      kept: { note: "Two r3.5 arcs on 45° tangents", draw: neutral([HEART]) },
    },
    {
      rule: "Open ends are butt, cut square and run on half a stroke",
      broken: {
        note: "Round ends, which allo's flat terminals never use",
        draw: round(["M9 4L9 14M4 9L14 9"]),
      },
      kept: {
        note: "Butt ends reaching the same ink extent",
        draw: neutral(["M9 3.375L9 14.625M3.375 9L14.625 9"]),
      },
    },
    {
      rule: "Box corners round to 1.5, diagonal corners and arrow heads stay sharp",
      broken: {
        note: "The old folder: r3.24 boxes and a rounded tab",
        draw: round([
          "M1.71 5.76A3.24 3.24 0 0 1 4.95 2.52L6.624 2.52A1.89 1.89 0 0 1 8.136 3.276L8.892 4.41L13.05 4.41A3.24 3.24 0 0 1 16.29 7.65L16.29 12.24A3.24 3.24 0 0 1 13.05 15.48L4.95 15.48A3.24 3.24 0 0 1 1.71 12.24Z",
        ]),
      },
      kept: {
        note: "r1.5 outside, a sharp 45° tab",
        draw: neutral([
          "M1.71 4.02A1.5 1.5 0 0 1 3.21 2.52L6.75 2.52L8.64 4.41L14.79 4.41A1.5 1.5 0 0 1 16.29 5.91L16.29 13.98A1.5 1.5 0 0 1 14.79 15.48L3.21 15.48A1.5 1.5 0 0 1 1.71 13.98Z",
        ]),
      },
    },
    {
      rule: "Every join is 90° or wider, so a miter never spikes",
      broken: {
        note: "A 53° tip whose miter runs 1.4 past the point",
        draw: neutral(["M5 4.5L14 9L5 13.5"]),
      },
      kept: {
        note: "A 90° tip, its miter 0.88 past the point",
        draw: neutral(["M5.8 3L11.8 9L5.8 15"]),
      },
    },
    {
      rule: "A shape that could stay open closes, and only a part cuts it",
      broken: {
        note: "A file left open at the corner for style",
        draw: neutral([
          "M3.21 12.6L3.21 3.21A1.5 1.5 0 0 1 4.71 1.71L10.08 1.71L14.79 6.42L14.79 14.79A1.5 1.5 0 0 1 13.29 16.29L6.9 16.29",
          FOLD,
        ]),
      },
      kept: {
        note: "file: closed, the fold drawn inside",
        draw: neutral([
          "M4.71 1.71L10.08 1.71L14.79 6.42L14.79 14.79A1.5 1.5 0 0 1 13.29 16.29L4.71 16.29A1.5 1.5 0 0 1 3.21 14.79L3.21 3.21A1.5 1.5 0 0 1 4.71 1.71Z",
          FOLD,
        ]),
      },
    },
    {
      rule: "A slash cuts top left to bottom right, 1 clear of the base",
      broken: {
        note: "Top right to bottom left, drawn over the base",
        draw: neutral([...TAG, "M15.75 2.25L2.25 15.75"]),
      },
      kept: {
        note: "tag-slash: the registered slash with a 1 gap",
        draw: (size) => cleared(TAG, { size, cap: "butt", join: "miter" }),
      },
    },
    {
      rule: "Moving things point up, outward arrows point up and right",
      broken: {
        note: "An open arrow pointing down and left",
        draw: neutral([
          "M13.762 4.238L4.68 13.32M4.68 7.835L4.68 13.32L10.165 13.32",
        ]),
      },
      kept: { note: "open: up and right, out of the row", draw: OPEN_KEPT },
    },
    {
      rule: "Details stay 3.4 apart between stroke centers",
      broken: {
        note: "Lines 2.5 apart, which fill in at 12px",
        draw: neutral(["M3 6.5L15 6.5M3 9L15 9M3 11.5L15 11.5"]),
      },
      kept: {
        note: "Lines 3.4 apart, still three at 12px",
        draw: neutral([
          "M2.375 5.6L15.625 5.6M2.375 9L15.625 9M2.375 12.4L15.625 12.4",
        ]),
      },
    },
    {
      rule: "An icon never takes more attention than the label beside it",
      broken: {
        note: "A frame and a 1.75 stroke to make it stand out",
        draw: neutral(
          [
            "M3.2 1.7L14.8 1.7A1.5 1.5 0 0 1 16.3 3.2L16.3 14.8A1.5 1.5 0 0 1 14.8 16.3L3.2 16.3A1.5 1.5 0 0 1 1.7 14.8L1.7 3.2A1.5 1.5 0 0 1 3.2 1.7Z",
            "M9 8A1.6 1.6 0 1 0 6.269 9.131L9 11.862L11.731 9.131A1.6 1.6 0 1 0 9 8Z",
          ],
          1.75,
        ),
      },
      kept: {
        note: "One object at the set's stroke, no frame",
        draw: neutral([HEART]),
      },
    },
  ];

  function example(side, label) {
    return h(
      "figure",
      { class: "example", "data-kept": label === "Kept" },
      h(
        "div",
        { class: "sizes" },
        [36, 18, 12].map((size) => side.draw(size)),
      ),
      h(
        "figcaption",
        { class: "caption" },
        h("span", { class: "name" }, label),
        side.note,
      ),
    );
  }

  function voice() {
    return h(
      "ol",
      { class: "rules" },
      VOICE.map((rule) =>
        h(
          "li",
          { class: "rule" },
          h("h3", { class: "subtitle" }, rule.rule),
          h(
            "div",
            { class: "pair" },
            example(rule.broken, "Broken"),
            example(rule.kept, "Kept"),
          ),
        ),
      ),
    );
  }

  const D = Math.SQRT1_2;

  /** Butt ends run on half the stroke, so each width keeps a round end's ink extent. */
  const SEEDS = [
    {
      label: "Recently Added",
      count: 24,
      draw: (e) => [
        { cx: 9, cy: 9, r: 7.29 },
        `M9 ${5.49 - e}L9 9L${11.058 + e * D} ${11.058 + e * D}`,
      ],
    },
    {
      label: "Open",
      draw: (e) => [
        `M${4.68 - e * D} ${13.32 + e * D}L13.32 4.68M${8.46 - e} 4.68L13.32 4.68L13.32 ${9.54 + e}`,
      ],
    },
    {
      label: "New Folder",
      draw: (e) => [
        `M${8.622 + e} 15.48L3.21 15.48A1.5 1.5 0 0 1 1.71 13.98L1.71 4.02A1.5 1.5 0 0 1 3.21 2.52L6.75 2.52L8.64 4.41L14.79 4.41A1.5 1.5 0 0 1 16.29 5.91L16.29 ${9.292 + e}`,
        `M13.86 ${11.43 - e}L13.86 ${16.29 + e}M${11.43 - e} 13.86L${16.29 + e} 13.86`,
      ],
    },
  ];

  const STROKES = [
    { width: 1, note: "0.2 under allo's 1.2 stem at 13px medium" },
    { width: 1.25, note: "The stem to the nearest quarter" },
    { width: 1.5, note: "0.3 over the stem" },
  ];

  function strokes() {
    return h(
      "div",
      { class: "tiles" },
      STROKES.map(({ width, note }) =>
        tile({ name: String(width), note }, () =>
          panel(
            SEEDS.map((seed) => ({
              label: seed.label,
              count: seed.count,
              icon: () =>
                glyph({
                  shapes: seed.draw(width / 2),
                  width,
                  cap: "butt",
                  join: "miter",
                }),
            })),
          ),
        ),
      ),
    );
  }

  /** Seed files render as written, with strokes held on screen up to 18px like the build. */
  function seedIcon(text, size) {
    const template = document.createElement("template");
    template.innerHTML = text.trim();
    const svg = template.content.firstElementChild;
    svg.setAttribute("width", size);
    svg.setAttribute("height", size);
    svg.setAttribute("aria-hidden", "true");
    if (size <= 18) {
      for (const shape of svg.querySelectorAll("path, circle")) {
        shape.setAttribute("vector-effect", "non-scaling-stroke");
      }
    }
    return svg;
  }

  const SEED = Object.keys(DATA.seed ?? {}).sort((a, b) => a.localeCompare(b));

  const SEED_ROWS = [
    { label: "Recently Added", name: "clock", count: 24 },
    { label: "Images", name: "image", count: 412 },
    { label: "Files", name: "file" },
    { label: "Folders", name: "folder" },
    { label: "Tags", name: "tag" },
    { label: "Favorites", name: "heart" },
    { label: "Trash", name: "trash" },
  ];

  const SEED_STYLES = [
    { name: "Line", pick: (drawing) => drawing.outline },
    {
      name: "Duo",
      note: "Shapes with no body, like arrows, stay a line",
      pick: (drawing) => drawing.duo ?? drawing.outline,
    },
  ];

  function seed() {
    const rows = SEED_ROWS.filter((row) => DATA.seed?.[row.name]);
    return h(
      "div",
      { class: "stack" },
      h(
        "div",
        { class: "tiles" },
        SEED_STYLES.map((style) =>
          tile({ name: style.name, note: style.note }, () =>
            panel(
              rows.map((row) => ({
                label: row.label,
                count: row.count,
                icon: () => seedIcon(style.pick(DATA.seed[row.name]), 18),
              })),
            ),
          ),
        ),
      ),
      h(
        "ul",
        { class: "seeds" },
        SEED.map((name) => {
          const drawing = DATA.seed[name];
          const columns = [
            ["Old", DATA.svgs[name]],
            ["Line", drawing.outline],
            ["Duo", drawing.duo],
          ];
          return h(
            "li",
            { class: "seed" },
            h("span", { class: "name" }, name),
            h(
              "div",
              { class: "columns" },
              columns.map(([label, text]) =>
                h(
                  "figure",
                  { class: "column", "data-old": label === "Old" },
                  text
                    ? [36, 18, 12].map((size) => seedIcon(text, size))
                    : h("span", { class: "art" }, "Stays a line"),
                  h("figcaption", { class: "note" }, label),
                ),
              ),
            ),
          );
        }),
      ),
    );
  }

  const SEED_PARTS = Object.keys(DATA.seedParts ?? {})
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({
      name,
      users: Object.entries(DATA.seedManifest ?? {})
        .filter(([, entry]) => entry.parts.includes(name))
        .map(([user]) => user),
    }));

  function seedPart(name) {
    const svg = seedIcon(DATA.seedParts[name], PART_SIZE);
    svg.classList.add("part");
    return svg;
  }

  function seedParts() {
    return h(
      "div",
      { class: "boards" },
      SEED_PARTS.map(({ name, users }) =>
        h(
          "section",
          { class: "board" },
          h(
            "h3",
            { class: "subtitle" },
            name,
            h("span", { class: "count" }, users.length),
          ),
          h(
            "div",
            { class: "cells" },
            cell(`seed/parts/${name}.svg`, seedPart(name)),
            users.flatMap((user) => {
              const drawing = DATA.seed[user];
              const duo = /^(badge-|slash$)/.test(name) && drawing.duo;
              return [
                cell(user, seedIcon(drawing.outline, PART_SIZE), seedPart(name)),
                duo
                  ? cell(`${user}, Duo`, seedIcon(duo, PART_SIZE), seedPart(name))
                  : null,
              ];
            }),
          ),
        ),
      ),
    );
  }

  const ENTRIES = Object.entries(DATA.manifest).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const styleOf = (entry) =>
    entry.variants.find((variant) => !variant.state)?.style;
  const hasOpen = (entry) =>
    entry.variants.some((variant) => variant.state === "open");

  function catalogue() {
    let search = "";
    let style = "all";
    let size = 18;
    const status = h("span", { class: "note", role: "status" });
    const tally = h("span", { class: "tally" });
    const results = h("div");

    function copy(text, message) {
      void navigator.clipboard.writeText(text).then(() => {
        status.textContent = message;
      });
    }

    function segments(label, items, get, set) {
      const buttons = items.map(([value, text]) =>
        h(
          "button",
          {
            type: "button",
            "aria-pressed": String(get() === value),
            onclick: () => {
              set(value);
              for (const [index, button] of buttons.entries()) {
                button.setAttribute(
                  "aria-pressed",
                  String(items[index][0] === value),
                );
              }
              render();
            },
          },
          text,
        ),
      );
      return h(
        "div",
        { class: "segments", role: "group", "aria-label": label },
        buttons,
      );
    }

    function card(name) {
      const component = componentName(name);
      return h(
        "li",
        { class: "glyph" },
        h("span", { class: "art" }, icon(name, size)),
        h("span", { class: "small" }, name),
        h(
          "span",
          { class: "actions" },
          h(
            "button",
            {
              type: "button",
              title: "Copy Name",
              "aria-label": `Copy ${component}`,
              onclick: () => copy(component, `Copied ${component}`),
            },
            icon("copy", 12),
          ),
          h(
            "button",
            {
              type: "button",
              title: "Copy SVG",
              "aria-label": `Copy ${name}.svg`,
              onclick: () => copy(DATA.svgs[name] ?? "", `Copied ${name}.svg`),
            },
            icon("code", 12),
          ),
        ),
      );
    }

    function render() {
      const query = search.trim().toLowerCase();
      const shown = ENTRIES.filter(
        ([name, entry]) =>
          (style === "all" || styleOf(entry) === style) &&
          (!query ||
            name.includes(query) ||
            entry.concept.toLowerCase().includes(query) ||
            entry.tags.some((tag) => tag.includes(query))),
      );
      tally.textContent = `${shown.length} of ${ENTRIES.length}`;
      results.replaceChildren(
        shown.length === 0
          ? h(
              "div",
              { class: "empty" },
              `No icons for “${search.trim()}”`,
              h(
                "button",
                {
                  type: "button",
                  onclick: () => {
                    search = "";
                    input.value = "";
                    render();
                  },
                },
                "Clear Search",
              ),
            )
          : h(
              "ul",
              { class: "grid" },
              shown.map(([name]) => card(name)),
            ),
      );
    }

    const input = h("input", {
      class: "search",
      type: "search",
      placeholder: "Search…",
      "aria-label": "Search icons",
      oninput: (event) => {
        search = event.currentTarget.value;
        render();
      },
    });

    render();
    return h(
      "div",
      { class: "stack" },
      h(
        "div",
        { class: "toolbar" },
        input,
        segments(
          "Style",
          [
            ["all", "All"],
            ["outline", "Outline"],
            ["fill", "Solid"],
          ],
          () => style,
          (value) => {
            style = value;
          },
        ),
        segments(
          "Size",
          [
            [12, "12"],
            [18, "18"],
            [24, "24"],
          ],
          () => size,
          (value) => {
            size = value;
          },
        ),
        status,
        tally,
      ),
      results,
    );
  }

  function concepts() {
    const rows = ENTRIES.filter(([, entry]) => !entry.picker).sort(
      ([a, x], [b, y]) =>
        x.concept.localeCompare(y.concept) || a.localeCompare(b),
    );
    const picker = ENTRIES.filter(([, entry]) => entry.picker).length;
    return h(
      "div",
      { class: "stack" },
      h(
        "table",
        { class: "table" },
        h(
          "thead",
          null,
          h(
            "tr",
            null,
            ["Concept", "Icon", "Tags"].map((label) => h("th", null, label)),
          ),
        ),
        h(
          "tbody",
          null,
          rows.map(([name, entry]) =>
            h(
              "tr",
              null,
              h(
                "td",
                null,
                h("span", { class: "concept" }, icon(name), entry.concept),
              ),
              h("td", null, h("code", null, name)),
              h("td", { class: "tags" }, entry.tags.join(", ")),
            ),
          ),
        ),
      ),
      h(
        "p",
        { class: "note" },
        `${picker} folder picker objects sit outside this table. Each names an object, not an action, and has an open state.`,
      ),
    );
  }

  const EYE = [
    "M1.71 9C3.218 5.732 5.833 3.972 9 3.972C12.167 3.972 14.782 5.732 16.29 9C14.782 12.268 12.167 14.028 9 14.028C5.833 14.028 3.218 12.268 1.71 9Z",
    { cx: 9, cy: 9, r: 2.262 },
  ];

  const EXPLORE = [
    {
      concept: "Share",
      neighbours: [
        { label: "Copy", icon: "copy" },
        { label: "Move To", icon: "folder-send" },
      ],
      attempts: [
        {
          name: "Folder Send",
          note: "Already means Move To, one row up",
          icon: () => icon("folder-send"),
        },
        {
          name: "Paper Plane",
          note: "Reads as Send a message",
          icon: () =>
            glyph({
              shapes: [
                "M3.586 8.328A1.1 1.1 0 0 1 3.698 6.323L14.304 2.276A1.1 1.1 0 0 1 15.724 3.696L11.677 14.302A1.1 1.1 0 0 1 9.672 14.414L7.688 10.57A0.6 0.6 0 0 0 7.43 10.312Z",
                "M7.6 10.4L11.6 6.4",
              ],
            }),
        },
        {
          name: "Forward Arrow",
          note: "Reads as Forward or Reply",
          icon: () =>
            glyph({
              shapes: [
                "M2.25 14.4L2.25 12.15A4.86 4.86 0 0 1 7.11 7.29L15.75 7.29",
                "M12.15 3.69L15.75 7.29L12.15 10.89",
              ],
            }),
        },
        {
          name: "Nodes",
          note: "One meaning in the set, shipped as share",
          picked: true,
          icon: () => icon("share"),
        },
      ],
    },
    {
      concept: "Hide",
      neighbours: [
        { label: "Lock", icon: "lock" },
        { label: "Delete", icon: "trash" },
      ],
      attempts: [
        {
          name: "Registered Slash",
          note: "The slash part, corner to corner, shipped as eye-slash",
          picked: true,
          icon: () => icon("eye-slash"),
        },
        {
          name: "Short Slash",
          note: "Ends 0.5 inside the registered slash at each corner",
          icon: () => glyph({ shapes: [...EYE, "M2.75 2.75L15.25 15.25"] }),
        },
        {
          name: "Full Clearance",
          note: "The eye stops 1 short of the slash and the pupil splits in two",
          icon: () => cleared(EYE),
        },
        {
          name: "Small Cut",
          note: "Stays inside the eye, so the part is not reused",
          icon: () => glyph({ shapes: [...EYE, "M5.4 5.4L12.6 12.6"] }),
        },
      ],
    },
  ];

  function explore() {
    return h(
      "div",
      { class: "stack" },
      EXPLORE.map((concept) =>
        h(
          "div",
          { class: "stack" },
          h("h3", { class: "subtitle" }, concept.concept),
          h(
            "div",
            { class: "tiles" },
            concept.attempts.map((attempt) =>
              tile(
                {
                  name: attempt.name,
                  note: attempt.note,
                  themes: ["light"],
                  picked: attempt.picked,
                },
                () =>
                  panel([
                    ...concept.neighbours.map((row) => ({
                      label: row.label,
                      icon: () => icon(row.icon),
                    })),
                    { label: concept.concept, icon: attempt.icon },
                  ]),
              ),
            ),
          ),
        ),
      ),
    );
  }

  const NEXT = DATA.next ?? {};
  const NEXT_FAMILIES = Object.entries(DATA.nextFamilies ?? {});

  function stagedRow(name, columns) {
    return h(
      "li",
      { class: "seed" },
      h("span", { class: "name" }, name),
      h(
        "div",
        { class: "columns" },
        columns
          .filter(([, text]) => text)
          .map(([label, text]) =>
            h(
              "figure",
              { class: "column", "data-old": label.startsWith("Old") },
              [36, 18, 12].map((size) => seedIcon(text, size)),
              h("figcaption", { class: "note" }, label),
            ),
          ),
      ),
    );
  }

  function neutralSet() {
    return h(
      "div",
      { class: "stack" },
      NEXT_FAMILIES.map(([family, names]) => {
        const drawn = names.filter((name) => NEXT[name]);
        return h(
          "div",
          { class: "stack" },
          h(
            "h3",
            { class: "subtitle" },
            family,
            h("span", { class: "count" }, `${drawn.length} of ${names.length}`),
          ),
          h(
            "ul",
            { class: "seeds" },
            drawn.map((name) => {
              const files = NEXT[name];
              return stagedRow(name, [
                ["Old", DATA.svgs[name]],
                ["Old, Open", DATA.svgs[`${name}-open`]],
                ["Line", files.outline],
                ["Duo", files.duo],
                ["Open", files.open],
                ["Duo, Open", files.duoOpen],
                ["Solid", files.fill],
              ]);
            }),
          ),
        );
      }),
    );
  }

  function neutralAttempts() {
    return h(
      "ul",
      { class: "seeds" },
      Object.entries(DATA.nextAttempts ?? {})
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, attempts]) =>
          stagedRow(name, [
            ["Old", DATA.svgs[name]],
            ...attempts.map((attempt) => [
              attempt.picked ? `${attempt.note}, Picked` : attempt.note,
              attempt.svg,
            ]),
          ]),
        ),
    );
  }

  const PARTS = Object.keys(DATA.parts)
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({
      name,
      users: ENTRIES.filter(([, entry]) => entry.parts?.includes(name)).map(
        ([user]) => user,
      ),
    }));

  /** Drawn outside the badge slot on purpose, so they never declare the part. */
  const EXCEPTIONS = [
    { icon: "filter-plus", part: "badge-plus" },
    { icon: "filter-off", part: "badge-xmark" },
  ];

  const PART_SIZE = 48;

  function cell(label, ...layers) {
    return h(
      "figure",
      { class: "cell" },
      h("span", { class: "overlay" }, layers),
      h("figcaption", { class: "small" }, label),
    );
  }

  function parts() {
    return h(
      "div",
      { class: "boards" },
      PARTS.map(({ name, users }) =>
        h(
          "section",
          { class: "board" },
          h(
            "h3",
            { class: "subtitle" },
            name,
            h("span", { class: "count" }, users.length),
          ),
          h(
            "div",
            { class: "cells" },
            cell(`parts/${name}.svg`, partIcon(name, PART_SIZE, "part")),
            users.map((user) =>
              cell(
                user,
                icon(user, PART_SIZE),
                partIcon(name, PART_SIZE, "part"),
              ),
            ),
          ),
        ),
      ),
      h(
        "section",
        { class: "board" },
        h("h3", { class: "subtitle" }, "Outside the Slot"),
        h(
          "div",
          { class: "cells" },
          EXCEPTIONS.map((entry) =>
            cell(
              entry.icon,
              icon(entry.icon, PART_SIZE),
              partIcon(entry.part, PART_SIZE, "part"),
            ),
          ),
        ),
      ),
    );
  }

  const STATES = ["To Do", "Removed", "Coupled"];

  function detail(entry) {
    if (entry.state === "Coupled") return entry.to;
    if (entry.state === "Removed") {
      return `Removed, ${entry.references} references`;
    }
    return "To Do";
  }

  function migration() {
    const entries = Object.entries(DATA.migration).sort(
      ([a, x], [b, y]) =>
        STATES.indexOf(x.state) - STATES.indexOf(y.state) ||
        a.localeCompare(b),
    );
    const tally = STATES.map(
      (state) =>
        `${entries.filter(([, entry]) => entry.state === state).length} ${state}`,
    ).join(", ");
    return h(
      "div",
      { class: "stack" },
      h("p", { class: "note" }, tally),
      h(
        "ul",
        { class: "migration" },
        entries.map(([name, entry]) =>
          h(
            "li",
            { "data-state": entry.state },
            h(
              "span",
              { class: "art" },
              entry.state === "Coupled" ? icon(fileName(entry.to)) : null,
            ),
            h(
              "span",
              { class: "text" },
              h("span", { class: "from" }, name),
              h("span", { class: "to" }, detail(entry)),
            ),
          ),
        ),
      ),
    );
  }

  function counts() {
    const entries = Object.values(DATA.manifest);
    const solid = entries.filter((entry) => styleOf(entry) === "fill").length;
    const open = entries.filter(hasOpen).length;
    return `${entries.length} icons: ${entries.length - solid} outline and ${solid} solid, plus ${open} open states. ${PARTS.length} registered parts.`;
  }

  root.className = "page";
  root.append(
    h(
      "header",
      { class: "header" },
      h("h1", { class: "title" }, "Icons"),
      h(
        "p",
        { class: "description" },
        `${counts()} Read from packages/icons when the icon build last ran.`,
      ),
    ),
    section(
      "Style",
      "The same three icons in each direction, in the library sidebar row, dark and light.",
      directions(),
    ),
    section(
      "Fill",
      "Duo in Neutral shapes, in one color and in two. Click a row to move the selection.",
      fills(),
    ),
    section(
      "Voice",
      "How every Neutral icon is built. Each rule shows the drawing it rules out beside the one it keeps, at 36, 18 and 12px.",
      voice(),
    ),
    section(
      "Stroke",
      "Three Neutral seed icons at three strokes in the library sidebar row, beside its own 13px labels.",
      strokes(),
    ),
    section(
      "Seed",
      `${SEED.length} icons in the Neutral voice, drawn before the rest. Each sits beside the drawing it replaces, at 36, 18 and 12px.`,
      seed(),
    ),
    section(
      "Seed Parts",
      "Each Neutral part in accent over every seed icon that names it. The build fails when a part leaves its source away from a badge or slash.",
      seedParts(),
    ),
    section(
      "Neutral Set",
      "Every icon redrawn in Neutral, by family, beside the drawing it replaces, at 36, 18 and 12px.",
      neutralSet(),
    ),
    section(
      "Neutral Attempts",
      "Each new Neutral concept as its row of attempts. The picked one ships.",
      neutralAttempts(),
    ),
    section("All Icons", null, catalogue()),
    section(
      "Concepts",
      "Each concept has one icon, shown beside its label at 18px.",
      concepts(),
    ),
    section(
      "Explore",
      "Each new concept as a row of attempts, set in its menu group beside its neighbours.",
      explore(),
    ),
    section(
      "Parts",
      "Each part is drawn in accent over every icon that uses it. A dark line beside the accent is drift.",
      parts(),
    ),
    section(
      "Migration",
      "Every icon from before the redraw, coupled to its replacement or removed.",
      migration(),
    ),
  );
})();
