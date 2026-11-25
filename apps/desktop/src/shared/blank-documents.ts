export const BLANK_DOCUMENT_KINDS = [
  "photoshop",
  "illustrator",
  "xd",
  "word",
  "powerpoint",
  "excel",
  "keynote",
  "pages",
  "numbers",
] as const;

export type BlankDocumentKind = (typeof BLANK_DOCUMENT_KINDS)[number];

export type BlankDocumentIcons = Partial<Record<BlankDocumentKind, string>>;

export interface BlankDocumentDef {
  kind: BlankDocumentKind;
  label: string;
  extension: string;
  filename: string;
  matchApp: (name: string) => boolean;
}

export const BLANK_DOCUMENTS: ReadonlyArray<BlankDocumentDef> = [
  {
    kind: "photoshop",
    label: "Photoshop Document",
    extension: "psd",
    filename: "Untitled.psd",
    matchApp: (name) =>
      name.startsWith("Adobe Photoshop") && name.endsWith(".app"),
  },
  {
    kind: "illustrator",
    label: "Illustrator Document",
    extension: "ai",
    filename: "Untitled.ai",
    matchApp: (name) =>
      name.startsWith("Adobe Illustrator") && name.endsWith(".app"),
  },
  {
    kind: "xd",
    label: "XD Document",
    extension: "xd",
    filename: "Untitled.xd",
    matchApp: (name) => name === "Adobe XD.app",
  },
  {
    kind: "word",
    label: "Word Document",
    extension: "docx",
    filename: "Untitled.docx",
    matchApp: (name) => name === "Microsoft Word.app",
  },
  {
    kind: "powerpoint",
    label: "PowerPoint Document",
    extension: "pptx",
    filename: "Untitled.pptx",
    matchApp: (name) => name === "Microsoft PowerPoint.app",
  },
  {
    kind: "excel",
    label: "Excel Document",
    extension: "xlsx",
    filename: "Untitled.xlsx",
    matchApp: (name) => name === "Microsoft Excel.app",
  },
  {
    kind: "keynote",
    label: "Keynote Document",
    extension: "key",
    filename: "Untitled.key",
    matchApp: (name) => name === "Keynote.app",
  },
  {
    kind: "pages",
    label: "Pages Document",
    extension: "pages",
    filename: "Untitled.pages",
    matchApp: (name) => name === "Pages.app",
  },
  {
    kind: "numbers",
    label: "Numbers Document",
    extension: "numbers",
    filename: "Untitled.numbers",
    matchApp: (name) => name === "Numbers.app",
  },
];

export function isBlankDocumentKind(value: string): value is BlankDocumentKind {
  return BLANK_DOCUMENT_KINDS.some((kind) => kind === value);
}

export function blankDocumentDef(
  kind: BlankDocumentKind,
): BlankDocumentDef | undefined {
  return BLANK_DOCUMENTS.find((item) => item.kind === kind);
}
