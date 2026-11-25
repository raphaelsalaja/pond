/** Real content from `.gather/download-dialog`, the Download Lab and `.audit/download-dialog`. */

export const ref = (id: string) => `/refs/${id}.jpg`;
export const state = (id: string) => `/states/${id}.png`;

export const PROMPT = "Gather references for the download dialog";

/** One `search_library` call per part of the brief, with the saves Pond returned for it. */
export const SEARCHES = [
  { query: "trim filmstrip", saves: 6 },
  { query: "time readouts", saves: 7 },
  { query: "media card", saves: 6 },
  { query: "segmented control", saves: 7 },
  { query: "export sheet", saves: 13 },
];

export const BOARD = {
  title: "Download Dialog",
  brief:
    "Desktop Mac app dialog: the editor surface of a download sheet. Looking for the trim filmstrip, time readouts, media card, segmented format control and footer.",
  total: 77,
  sources: [
    { label: "Pond › X", count: 16 },
    { label: "Pond › Cosmos", count: 15 },
    { label: "marked.dev", count: 17 },
    { label: "Saaspo", count: 7 },
    { label: "Pond › Are.na", count: 4 },
    { label: "Land-book", count: 4 },
    { label: "Pond › Local", count: 3 },
  ],
  groups: [
    {
      title: "Trim Filmstrip",
      description: "Frame strips with a selection window and drag handles.",
    },
    {
      title: "Time Readouts",
      description: "Start, length and end as tiles, fields or chips.",
    },
    {
      title: "Media Card",
      description: "A preview with the file name, quality and size.",
    },
    {
      title: "Segmented Control",
      description: "Two to four modes in one pill or tab bar.",
    },
    {
      title: "Export Sheet",
      description: "Whole export, share or save dialogs.",
    },
  ],
};

export interface Ref {
  id: string;
  group: number;
  aspect: number;
}

export const REFS: Array<Ref> = [
  { id: "00", group: 0, aspect: 1.778 },
  { id: "01", group: 0, aspect: 1.905 },
  { id: "02", group: 0, aspect: 1.6 },
  { id: "03", group: 0, aspect: 1.773 },
  { id: "04", group: 0, aspect: 1.104 },
  { id: "05", group: 0, aspect: 1.607 },
  { id: "06", group: 0, aspect: 1.446 },
  { id: "07", group: 1, aspect: 0.954 },
  { id: "08", group: 1, aspect: 2.063 },
  { id: "09", group: 1, aspect: 1 },
  { id: "10", group: 1, aspect: 1.667 },
  { id: "11", group: 1, aspect: 0.893 },
  { id: "12", group: 1, aspect: 1.773 },
  { id: "13", group: 1, aspect: 1.364 },
  { id: "14", group: 2, aspect: 1.778 },
  { id: "15", group: 2, aspect: 1.29 },
  { id: "16", group: 2, aspect: 2.544 },
  { id: "17", group: 2, aspect: 0.907 },
  { id: "18", group: 2, aspect: 1.098 },
  { id: "19", group: 2, aspect: 1.22 },
  { id: "20", group: 2, aspect: 1.017 },
  { id: "21", group: 3, aspect: 1 },
  { id: "22", group: 3, aspect: 1.086 },
  { id: "23", group: 3, aspect: 1.449 },
  { id: "24", group: 3, aspect: 1.91 },
  { id: "25", group: 3, aspect: 1.353 },
  { id: "26", group: 3, aspect: 1.622 },
  { id: "27", group: 3, aspect: 1.522 },
  { id: "28", group: 4, aspect: 1 },
  { id: "29", group: 4, aspect: 1 },
  { id: "30", group: 4, aspect: 1.644 },
  { id: "31", group: 4, aspect: 1 },
  { id: "32", group: 4, aspect: 1.25 },
  { id: "33", group: 4, aspect: 1.714 },
  { id: "34", group: 4, aspect: 0.98 },
];

/** Lab rooms captured from the running app, in page order. */
export const STATES = [
  { id: "00", component: "Link Entry" },
  { id: "01", component: "Link Entry" },
  { id: "02", component: "Link Entry" },
  { id: "03", component: "Link Entry" },
  { id: "04", component: "Editor" },
  { id: "05", component: "Editor" },
  { id: "06", component: "Editor" },
  { id: "07", component: "Link List" },
  { id: "08", component: "Link List" },
  { id: "09", component: "Export" },
  { id: "10", component: "Export" },
  { id: "11", component: "Export" },
];

export const REPORT = {
  verdict: "Block, 1 High",
  scope:
    "Download dialog, every state: link entry, editor, link list and Export, opened in the running app and in the Download Lab",
  total: 14,
  sections: [
    {
      title: "High Severity",
      description: "Breaks behaviour or loses work.",
      findings: [
        {
          title: "Link Field Rejects Text Pond Can Read",
          path: "download-dialog › link-page › index.tsx:38",
        },
      ],
    },
    {
      title: "Medium Severity",
      description: "Visible and inconsistent.",
      findings: [
        {
          title: "Header Sits On The Content And Centers Its Title",
          path: "download-dialog › styles.module.css:9, 14",
        },
        {
          title: "Export Fields Overlap In Narrow Windows",
          path: "download-dialog › export-dialog › styles.module.css:9",
        },
        {
          title: "Editor Edge States Show Leftovers",
          path: "download-dialog › single-page › index.tsx:64",
        },
        {
          title: "One Action Goes By Three Verbs",
          path: "download-dialog › export-options › index.tsx:69, 404",
        },
        {
          title: "Two Option Sets For The Same Choices",
          path: "download-dialog › options › index.tsx:7",
        },
        {
          title: "Hint And Ruler Text Under 4.5:1",
          path: "download-dialog › timeline › styles.module.css:88",
        },
      ],
    },
  ],
};

export const MEDIA = [
  ...REFS.map((item) => ref(item.id)),
  ...STATES.map((item) => state(item.id)),
];
