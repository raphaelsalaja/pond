import type { SVGProps } from "react";

/**
 * Inline 1em monochrome glyphs for filter chips. We keep them here
 * (rather than in `@pond/icons`) because they're one-off line icons
 * tuned for the chip metrics — the package versions are pixel-fit
 * 18×18 and look heavy when scaled down to the chip's 14×14 slot.
 */

function makeIcon(title: string, body: React.ReactNode) {
  return function Icon(props: SVGProps<SVGSVGElement>) {
    return (
      <svg
        viewBox="0 0 18 18"
        xmlns="http://www.w3.org/2000/svg"
        width="1em"
        height="1em"
        {...props}
      >
        <title>{title}</title>
        {body}
      </svg>
    );
  };
}

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  strokeWidth: 1.2,
};

export const ColorIcon = makeIcon(
  "Color",
  <g {...stroke}>
    <path d="M9 3.25c-3.18 0-5.75 2.18-5.75 4.87 0 1.42 1.07 2.59 2.39 2.59h1.06c.66 0 1.2.54 1.2 1.2 0 .29-.11.55-.27.76-.16.21-.27.46-.27.74 0 .65.53 1.18 1.18 1.18 3.18 0 5.75-2.58 5.75-5.75S12.18 3.25 9 3.25Z" />
    <circle cx="6" cy="8" r=".7" fill="currentColor" stroke="none" />
    <circle cx="9" cy="6" r=".7" fill="currentColor" stroke="none" />
    <circle cx="12" cy="8" r=".7" fill="currentColor" stroke="none" />
  </g>,
);

export const TagIcon = makeIcon(
  "Tag",
  <g {...stroke}>
    <path d="M2.75 9 9 2.75h6.25V9L9 15.25 2.75 9Z" />
    <circle cx="11.5" cy="6.5" r="1" />
  </g>,
);

export const FolderIcon = makeIcon(
  "Folder",
  <g {...stroke}>
    <path d="M2.75 5.5a1.25 1.25 0 0 1 1.25-1.25h2.5l1.5 1.5h6a1.25 1.25 0 0 1 1.25 1.25v5.75A1.25 1.25 0 0 1 14 14H4a1.25 1.25 0 0 1-1.25-1.25V5.5Z" />
  </g>,
);

export const ShapeIcon = makeIcon(
  "Shape",
  <g {...stroke}>
    <rect x="3.5" y="3.5" width="6" height="6" rx="0.6" />
    <circle cx="12" cy="12" r="2.75" />
  </g>,
);

export const StarIcon = makeIcon(
  "Rating",
  <path
    fill="none"
    stroke="currentColor"
    strokeLinejoin="round"
    strokeWidth={1.2}
    d="M9 2.75 10.85 6.6l4.25.6-3.07 3 .73 4.22L9 12.4l-3.76 2.02.73-4.22-3.07-3 4.25-.6L9 2.75Z"
  />,
);

export const TypeIcon = makeIcon(
  "Type",
  <g {...stroke}>
    <rect x="2.75" y="3.5" width="12.5" height="11" rx="1.25" />
    <path d="M2.75 6.25h12.5" />
    <circle cx="5" cy="4.85" r=".55" fill="currentColor" stroke="none" />
    <circle cx="6.85" cy="4.85" r=".55" fill="currentColor" stroke="none" />
  </g>,
);

export const DimensionsIcon = makeIcon(
  "Dimensions",
  <g {...stroke}>
    <rect x="3.25" y="3.25" width="11.5" height="11.5" rx="0.6" />
    <path d="M6 5.5v2.25M5 6.5h2M11 5.5v2.25M10 6.5h2M6 10v2.25M5 11h2" />
  </g>,
);

export const DurationIcon = makeIcon(
  "Duration",
  <g {...stroke}>
    <circle cx="9" cy="9" r="6" />
    <path d="M9 5.5V9l2.25 1.25" />
  </g>,
);

export const SizeIcon = makeIcon(
  "Size",
  <g {...stroke}>
    <rect x="3.25" y="3.25" width="11.5" height="11.5" rx="0.8" />
    <path d="M6 9h6M9 6v6" />
  </g>,
);

export const NoteIcon = makeIcon(
  "Note",
  <g {...stroke}>
    <path d="M4.5 3.5h6.5l3 3v8a1 1 0 0 1-1 1h-8.5a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1Z" />
    <path d="M11 3.5V6.5h3" />
    <path d="M6.25 9.5h5.5M6.25 11.75h5.5M6.25 7.25H8" />
  </g>,
);

export const UrlIcon = makeIcon(
  "URL",
  <g {...stroke}>
    <path d="M9.5 8.5 13 5a2.475 2.475 0 1 1 3.5 3.5l-2.25 2.25" />
    <path d="M8.5 9.5 5 13a2.475 2.475 0 1 0 3.5 3.5l2.25-2.25" />
    <path d="M7.25 10.75l3.5-3.5" />
  </g>,
);

export const CalendarImportIcon = makeIcon(
  "Date Imported",
  <g {...stroke}>
    <rect x="3.25" y="4.5" width="11.5" height="10" rx="1" />
    <path d="M3.25 7.25h11.5M6 3v3M12 3v3" />
    <path d="M9 9.5v3M7.5 11l1.5 1.5L10.5 11" />
  </g>,
);

export const CalendarModifiedIcon = makeIcon(
  "Date Modified",
  <g {...stroke}>
    <rect x="3.25" y="4.5" width="11.5" height="10" rx="1" />
    <path d="M3.25 7.25h11.5M6 3v3M12 3v3" />
    <path d="m7.75 11.5 1.25-1.25 2.5 2.5" />
  </g>,
);

export const PlusIcon = makeIcon(
  "Add filter",
  <g {...stroke}>
    <line x1="9" y1="4" x2="9" y2="14" />
    <line x1="4" y1="9" x2="14" y2="9" />
  </g>,
);

export const ChevronDownIcon = makeIcon(
  "Open",
  <polyline {...stroke} points="5.5 7.5 9 11 12.5 7.5" />,
);

export const XmarkIcon = makeIcon(
  "Remove",
  <g {...stroke}>
    <line x1="5" y1="5" x2="13" y2="13" />
    <line x1="13" y1="5" x2="5" y2="13" />
  </g>,
);

/* ------------------------------------------------------------------ */
/* Header toolbar glyphs.                                              */
/* ------------------------------------------------------------------ */

export const HeaderPlusIcon = PlusIcon;

export const ArrowsCycleIcon = makeIcon(
  "Refresh",
  <g {...stroke}>
    <path d="M3 8.5a5.5 5.5 0 0 1 9.4-3.9" />
    <polyline points="13 3 13 6 10 6" />
    <path d="M15 9.5a5.5 5.5 0 0 1-9.4 3.9" />
    <polyline points="5 15 5 12 8 12" />
  </g>,
);

export const SidebarToggleIcon = makeIcon(
  "Toggle sidebar",
  <g {...stroke}>
    <rect x="3" y="3.5" width="12" height="11" rx="1.25" />
    <line x1="7" y1="3.5" x2="7" y2="14.5" />
  </g>,
);

export const ZoomMinusIcon = makeIcon(
  "Smaller",
  <line {...stroke} x1="4" y1="9" x2="14" y2="9" />,
);

export const ZoomPlusIcon = PlusIcon;

export const ListViewIcon = makeIcon(
  "List view",
  <g {...stroke}>
    <line x1="3.25" y1="5" x2="14.75" y2="5" />
    <line x1="3.25" y1="9" x2="14.75" y2="9" />
    <line x1="3.25" y1="13" x2="14.75" y2="13" />
  </g>,
);

export const GridViewIcon = makeIcon(
  "Grid view",
  <g {...stroke}>
    <rect x="3" y="3" width="5" height="5" rx="0.6" />
    <rect x="10" y="3" width="5" height="5" rx="0.6" />
    <rect x="3" y="10" width="5" height="5" rx="0.6" />
    <rect x="10" y="10" width="5" height="5" rx="0.6" />
  </g>,
);

/* Waterfall: equal-width columns, variable cell heights — Pinterest-style. */
export const WaterfallViewIcon = makeIcon(
  "Waterfall view",
  <g {...stroke}>
    <rect x="3" y="3" width="5" height="6" rx="0.6" />
    <rect x="10" y="3" width="5" height="3.5" rx="0.6" />
    <rect x="3" y="11" width="5" height="4" rx="0.6" />
    <rect x="10" y="8.5" width="5" height="6.5" rx="0.6" />
  </g>,
);

/* Justified: equal row heights, variable widths — packed flush to edges. */
export const JustifiedViewIcon = makeIcon(
  "Justified view",
  <g {...stroke}>
    <rect x="3" y="3.5" width="5" height="4" rx="0.6" />
    <rect x="9" y="3.5" width="6" height="4" rx="0.6" />
    <rect x="3" y="9" width="6.5" height="4" rx="0.6" />
    <rect x="10.5" y="9" width="4.5" height="4" rx="0.6" />
  </g>,
);

export const FilterToggleIcon = makeIcon(
  "Toggle filters",
  <g {...stroke}>
    <path d="M3 4.5h12" />
    <path d="M5.5 9h7" />
    <path d="M8 13.5h2" />
  </g>,
);

export const SearchIcon = makeIcon(
  "Search",
  <g {...stroke}>
    <circle cx="8" cy="8" r="4.25" />
    <line x1="11.25" y1="11.25" x2="14.25" y2="14.25" />
  </g>,
);

export const PinIcon = makeIcon(
  "Pin",
  <g {...stroke}>
    <path d="M10.5 2.5 15.5 7.5l-2.5 1-3 3-1-1-3 3-1.5-1.5 3-3-1-1 3-3 1-2.5Z" />
    <line x1="6" y1="12" x2="3" y2="15" />
  </g>,
);
