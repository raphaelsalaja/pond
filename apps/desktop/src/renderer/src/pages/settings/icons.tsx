import type { SVGProps } from "react";

/**
 * Inline glyphs for settings nav rows we don't have packaged icons for
 * yet. Kept tiny + monochrome (currentColor) to slot into the 14×14
 * nav slot. Once `@pond/icons` ships proper variants for these we can
 * delete this file and update the registry imports.
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

export const BellIcon = makeIcon(
  "Notifications",
  <g
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={1.2}
  >
    <path d="M4 13.5V8.5a5 5 0 0 1 10 0v5l1.25 1.25H2.75L4 13.5Z" />
    <path d="M7 15.25a2 2 0 0 0 4 0" />
  </g>,
);

export const LockIcon = makeIcon(
  "Security",
  <g
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={1.2}
  >
    <rect x="3.5" y="8.5" width="11" height="7" rx="1.6" />
    <path d="M5.75 8.5V6a3.25 3.25 0 1 1 6.5 0v2.5" />
  </g>,
);

export const LightningIcon = makeIcon(
  "Quick capture",
  <path
    fill="currentColor"
    stroke="currentColor"
    strokeLinejoin="round"
    strokeWidth={0.6}
    d="M9.85 1.5 4 10.25h3.9L7.4 16.5l5.85-9H9.35l.5-6Z"
  />,
);

export const RefreshIcon = makeIcon(
  "Reset",
  <g
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={1.2}
  >
    <path d="M3.25 9a5.75 5.75 0 0 1 9.85-4.05L15 6.75" />
    <polyline points="15 3 15 6.75 11.25 6.75" />
    <path d="M14.75 9a5.75 5.75 0 0 1-9.85 4.05L3 11.25" />
    <polyline points="3 15 3 11.25 6.75 11.25" />
  </g>,
);

export const InfoIcon = makeIcon(
  "About",
  <g
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={1.2}
  >
    <circle cx="9" cy="9" r="6.5" />
    <line x1="9" y1="8.25" x2="9" y2="12.5" />
    <circle cx="9" cy="5.75" r="0.6" fill="currentColor" stroke="none" />
  </g>,
);

export const TagIcon = makeIcon(
  "Tag",
  <g
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={1.2}
  >
    <path d="M2.75 9 9 2.75h6.25V9L9 15.25 2.75 9Z" />
    <circle cx="11.5" cy="6.5" r="1" />
  </g>,
);

export const TrashIcon = makeIcon(
  "Trash",
  <g
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={1.2}
  >
    <path d="M3.5 5h11" />
    <path d="M7 5V3.25h4V5" />
    <path d="M5 5v9.5a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V5" />
    <line x1="7.5" y1="7.75" x2="7.5" y2="13" />
    <line x1="10.5" y1="7.75" x2="10.5" y2="13" />
  </g>,
);

export const CloudIcon = makeIcon(
  "Backups",
  <g
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={1.2}
  >
    <path d="M5.5 13.5h7.5a3 3 0 0 0 .35-5.97 4.25 4.25 0 0 0-8.32-1A3 3 0 0 0 5.5 13.5Z" />
  </g>,
);

export const CompassIcon = makeIcon(
  "Workspace",
  <g
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={1.2}
  >
    <circle cx="9" cy="9" r="6.5" />
    <path d="m6.5 11.5 1.25-3.75 3.75-1.25-1.25 3.75-3.75 1.25Z" />
  </g>,
);

export const PlusIcon = makeIcon(
  "Add",
  <g
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={1.2}
  >
    <line x1="9" y1="3.75" x2="9" y2="14.25" />
    <line x1="3.75" y1="9" x2="14.25" y2="9" />
  </g>,
);
