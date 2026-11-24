const ICON =
  '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="12" height="12" rx="3"/><path d="M6.5 9h5"/></svg>';

const BORDER = "var(--ds-shadow-border)";
const OUTLINE = "inset 0 0 0 var(--ds-border-width) var(--ds-border-strong)";
const ACCENT_EDGE = "inset 0 0 0 var(--ds-border-width) var(--ds-accent-border)";
const SELECTED_ROW = "color-mix(in oklab, var(--ds-accent-tint) 70%, transparent)";

/**
 * Each state lists only what it changes from rest. Token names drop the `--ds-` prefix;
 * anything containing a space or parenthesis is used as a raw CSS value.
 */
const SECTIONS = [
  {
    title: "Buttons",
    items: [
      {
        name: "Ghost",
        source: "ui/button",
        kind: "button",
        backdrop: "page",
        rest: { fg: "foreground-secondary" },
        hover: { bg: "surface-primary", fg: "foreground-primary" },
        active: { bg: "surface-secondary", fg: "foreground-primary" },
        activeLabel: "Pressed",
      },
      {
        name: "Ghost icon",
        source: "ui/button",
        kind: "icon",
        backdrop: "page",
        rest: { fg: "foreground-tertiary" },
        hover: { bg: "surface-primary", fg: "foreground-primary" },
        active: { bg: "surface-secondary", fg: "foreground-primary" },
        activeLabel: "Pressed",
      },
      {
        name: "Tertiary",
        source: "ui/button",
        kind: "button",
        backdrop: "page",
        rest: { bg: "surface-primary", fg: "foreground-secondary" },
        hover: { bg: "surface-secondary", fg: "foreground-primary" },
      },
      {
        name: "Secondary",
        source: "ui/button",
        kind: "button",
        backdrop: "page",
        rest: { bg: "background-primary", fg: "foreground-primary", sh: BORDER },
        hover: { bg: "background-secondary" },
      },
      {
        name: "Primary",
        source: "ui/button",
        kind: "button",
        backdrop: "page",
        rest: { bg: "accent", fg: "accent-contrast" },
        hover: { bg: "accent-hover" },
        active: { bg: "accent-hover" },
        activeLabel: "Pressed",
      },
      {
        name: "Text",
        source: "ui/button",
        kind: "button",
        backdrop: "page",
        rest: { fg: "foreground-tertiary" },
        hover: { fg: "foreground-primary" },
        active: { fg: "foreground-primary" },
        activeLabel: "Pressed",
      },
      {
        name: "Dialog close",
        source: "ui/dialog",
        kind: "icon",
        backdrop: "elevated",
        rest: { fg: "foreground-secondary" },
        hover: { bg: "surface-primary", fg: "foreground-primary" },
      },
    ],
  },
  {
    title: "Toggles",
    items: [
      {
        name: "Toggle",
        source: "ui/toggle",
        kind: "pill",
        label: "Toggle",
        backdrop: "page",
        rest: { fg: "foreground-tertiary" },
        hover: { bg: "surface-primary", fg: "foreground-primary" },
        active: { bg: "background-primary", fg: "foreground-primary", sh: BORDER },
        activeLabel: "Pressed",
      },
      {
        name: "Outline toggle",
        source: "ui/toggle",
        kind: "pill",
        label: "Toggle",
        backdrop: "page",
        rest: { fg: "foreground-tertiary", sh: OUTLINE },
        hover: { bg: "surface-primary", fg: "foreground-primary" },
        active: { bg: "surface-secondary", fg: "foreground-primary", sh: "none" },
        activeLabel: "Pressed",
      },
      {
        name: "Tiles group",
        source: "ui/toggle",
        kind: "tile-toggle",
        label: "Grid",
        backdrop: "page",
        rest: { bg: "surface-primary", fg: "foreground-tertiary" },
        hover: { bg: "surface-secondary", fg: "foreground-primary" },
        active: { bg: "background-primary", fg: "foreground-primary", sh: BORDER },
        activeLabel: "Pressed",
      },
      {
        name: "Outline group",
        source: "ui/toggle",
        kind: "segment",
        label: "Day",
        backdrop: "page",
        rest: { fg: "foreground-tertiary" },
        hover: { bg: "surface-primary", fg: "foreground-primary" },
        active: { bg: "surface-secondary", fg: "foreground-primary" },
        activeLabel: "Pressed",
      },
    ],
  },
  {
    title: "Tabs",
    items: [
      {
        name: "Tab",
        source: "ui/tabs",
        kind: "tab",
        label: "Saves",
        backdrop: "page",
        rest: { bg: "background-primary", fg: "foreground-tertiary" },
        hover: { bg: "background-secondary", fg: "foreground-primary" },
        active: { bg: "background-tertiary", fg: "foreground-primary" },
        activeLabel: "Active",
      },
      {
        name: "Secondary tab",
        source: "ui/tabs",
        kind: "tab",
        label: "Saves",
        backdrop: "window",
        rest: { fg: "foreground-tertiary" },
        hover: { bg: "surface-primary", fg: "foreground-primary" },
        active: { bg: "background-primary", fg: "foreground-primary", sh: BORDER },
        activeLabel: "Active",
      },
    ],
  },
  {
    title: "Sidebar",
    items: [
      {
        name: "Row",
        source: "ui/sidebar, fish, canvas, smart folders",
        kind: "row",
        label: "Inbox",
        icon: true,
        backdrop: "page",
        rest: { fg: "foreground-tertiary" },
        hover: { bg: "surface-primary", fg: "foreground-primary" },
        active: { bg: "surface-secondary", fg: "foreground-primary" },
        activeLabel: "Active",
      },
      {
        name: "Search result",
        source: "ui/sidebar",
        kind: "row",
        label: "Design references",
        backdrop: "page",
        rest: { fg: "foreground-secondary" },
        hover: { bg: "surface-primary", fg: "foreground-primary" },
      },
      {
        name: "Tile",
        source: "ui/sidebar",
        kind: "tile",
        label: "Library",
        icon: true,
        backdrop: "page",
        rest: { fg: "foreground-secondary" },
        hover: { bg: "surface-primary", fg: "foreground-primary" },
        active: { bg: "surface-secondary", fg: "foreground-primary" },
        activeLabel: "Active",
      },
    ],
  },
  {
    title: "Menus",
    items: [
      {
        name: "Menu item",
        source: "ui/shared/styles/popup",
        kind: "menu",
        label: "Open in New Tab",
        icon: true,
        backdrop: "elevated",
        rest: { fg: "foreground-secondary" },
        hover: { bg: "surface-primary", fg: "foreground-primary" },
        active: { bg: "surface-primary", fg: "foreground-primary" },
        activeLabel: "Submenu open",
      },
      {
        name: "Select item",
        source: "ui/select",
        kind: "menu",
        label: "Newest First",
        backdrop: "elevated",
        rest: { fg: "foreground-secondary" },
        hover: { bg: "surface-primary", fg: "foreground-primary" },
      },
      {
        name: "Picker item",
        source: "ui/picker-panel",
        kind: "menu",
        label: "Reference",
        icon: true,
        backdrop: "elevated",
        rest: { fg: "foreground-secondary" },
        hover: { bg: "surface-primary" },
        active: { fg: "foreground-primary" },
        activeLabel: "Checked",
      },
    ],
  },
  {
    title: "Lists and Rows",
    items: [
      {
        name: "Data table row",
        source: "ui/data-table",
        kind: "table-row",
        label: "Untitled save",
        trailing: "2 MB",
        backdrop: "page",
        rest: { fg: "foreground-secondary" },
        hover: { bg: "surface-primary" },
        active: { bg: SELECTED_ROW },
        activeLabel: "Selected",
      },
      {
        name: "Content row",
        source: "ui/content-row",
        kind: "tall-row",
        label: "Weekly digest",
        icon: true,
        backdrop: "page",
        rest: { fg: "foreground-primary" },
        hover: { bg: "surface-primary" },
        active: { bg: "surface-secondary" },
        activeLabel: "Current",
      },
      {
        name: "Accordion",
        source: "ui/accordion",
        kind: "row",
        label: "Advanced",
        backdrop: "page",
        rest: { fg: "foreground-secondary" },
        hover: { bg: "surface-primary", fg: "foreground-primary" },
        active: { fg: "foreground-primary" },
        activeLabel: "Open",
      },
      {
        name: "Prompt choice",
        source: "ui/prompt",
        kind: "row",
        label: "Keep both",
        backdrop: "elevated",
        rest: { fg: "foreground-secondary" },
        hover: { bg: "surface-primary" },
        active: { bg: "surface-secondary" },
        activeLabel: "Pressed",
      },
      {
        name: "Review row",
        source: "desktop/agent/review",
        kind: "row",
        label: "Tag 12 saves",
        icon: true,
        backdrop: "page",
        rest: { fg: "foreground-secondary" },
        hover: { bg: "surface-primary" },
        active: { bg: "surface-secondary" },
        activeLabel: "Pressed",
      },
      {
        name: "Tags manager row",
        source: "desktop/tags/manager",
        kind: "row",
        label: "inspiration",
        backdrop: "elevated",
        rest: { fg: "foreground-secondary" },
        hover: { bg: "surface-primary" },
        active: { bg: "accent-tint" },
        activeLabel: "Selected",
      },
      {
        name: "Conversion file",
        source: "desktop/conversion-dialog",
        kind: "row",
        label: "poster.png",
        icon: true,
        backdrop: "elevated",
        rest: { fg: "foreground-secondary" },
        hover: { bg: "surface-primary" },
      },
      {
        name: "PDF thumbnail",
        source: "desktop/viewers/pdf",
        kind: "thumbnail",
        label: "3",
        page: true,
        backdrop: "window",
        rest: { fg: "foreground-tertiary" },
        hover: { bg: "surface-primary" },
        active: { bg: "accent-tint", fg: "foreground-primary", sh: ACCENT_EDGE },
        activeLabel: "Current",
      },
    ],
  },
];

const THEMES = [
  { id: "light", title: "Light" },
  { id: "dark", title: "Dark" },
];

function css(value) {
  if (!value) return "transparent";
  if (/[\s(]/.test(value) || value === "none") return value;
  return `var(--ds-${value})`;
}

function resolve(item, state) {
  const rest = { bg: undefined, fg: undefined, sh: "none", ...item.rest };
  return state === "rest" ? rest : { ...rest, ...item[state] };
}

function vars(prefix, state) {
  return [
    `--${prefix}bg: ${css(state.bg)}`,
    `--${prefix}fg: ${css(state.fg)}`,
    `--${prefix}sh: ${state.sh === "none" ? "none" : css(state.sh)}`,
  ].join("; ");
}

function short(value) {
  if (!value) return "transparent";
  if (value === SELECTED_ROW) return "accent-tint 70%";
  return value;
}

function caption(item, state) {
  if (state === "rest") {
    return item.rest.bg ? short(item.rest.bg) : "transparent";
  }
  const rest = resolve(item, "rest");
  const next = resolve(item, state);
  if (next.bg !== rest.bg) return short(next.bg);
  if (next.sh !== rest.sh) return "edge only";
  if (next.fg !== rest.fg) return "text only";
  return "no change";
}

function body(item) {
  const icon = item.icon ? ICON : "";
  if (item.kind === "icon") return ICON;
  if (item.kind === "thumbnail") return `<span class="page"></span><span>${item.label}</span>`;
  if (item.kind === "table-row") {
    return `<span>${item.label}</span><span class="muted">${item.trailing}</span>`;
  }
  return `${icon}<span>${item.label ?? item.name}</span>`;
}

function control(item, style, live) {
  return `<div class="control" data-kind="${item.kind}" style="${style}"${live ? " data-live" : ""}>${body(item)}</div>`;
}

function cell(item, state) {
  if (state !== "rest" && !item[state]) {
    return `<div class="cell" data-backdrop="${item.backdrop}"><div class="stage empty">—</div><div class="caption">no ${state} state</div></div>`;
  }
  const s = resolve(item, state);
  const label = state === "active" ? `${item.activeLabel}: ${caption(item, state)}` : caption(item, state);
  return `<div class="cell" data-backdrop="${item.backdrop}"><div class="stage">${control(item, vars("", s))}</div><div class="caption">${label}</div></div>`;
}

function liveCell(item) {
  const rest = resolve(item, "rest");
  const hover = resolve(item, "hover");
  const active = item.active ? resolve(item, "active") : hover;
  const style = [vars("rest-", rest), vars("hover-", hover), vars("active-", active)].join("; ");
  return `<div class="cell" data-backdrop="${item.backdrop}" data-live><div class="stage">${control(item, style, true)}</div><div class="caption">try it</div></div>`;
}

function section(sectionData) {
  const head = ["", "Rest", "Hover", "Active", "Live"]
    .map((label) => `<div class="head">${label}</div>`)
    .join("");
  const rows = sectionData.items
    .map((item) => {
      const name = `<div class="name"><strong>${item.name}</strong><code>${item.source}</code></div>`;
      return `${name}${cell(item, "rest")}${cell(item, "hover")}${cell(item, "active")}${liveCell(item)}`;
    })
    .join("");
  return `<section class="section"><h3 class="section-title">${sectionData.title}</h3><div class="grid">${head}${rows}</div></section>`;
}

function render() {
  const root = document.getElementById("lab");
  root.innerHTML = THEMES.map(
    (theme) =>
      `<div class="theme" data-theme="${theme.id}"><h2 class="theme-title">${theme.title}</h2>${SECTIONS.map(section).join("")}</div>`,
  ).join("");

  root.addEventListener("click", (event) => {
    const target = event.target.closest(".control[data-live]");
    if (target) target.toggleAttribute("data-on");
  });
}

render();
