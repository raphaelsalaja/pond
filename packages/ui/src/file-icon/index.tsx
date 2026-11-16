import { clsx as cn } from "clsx";
import type * as React from "react";
import styles from "./styles.module.css";

export type FileKind =
  | "document"
  | "sheet"
  | "slides"
  | "pdf"
  | "calendar"
  | "archive"
  | "image"
  | "video"
  | "audio"
  | "code"
  | "text"
  | "blank";

const KINDS: Record<string, FileKind> = {
  doc: "document",
  docx: "document",
  odt: "document",
  pages: "document",
  rtf: "document",
  csv: "sheet",
  numbers: "sheet",
  ods: "sheet",
  xls: "sheet",
  xlsx: "sheet",
  key: "slides",
  odp: "slides",
  ppt: "slides",
  pptx: "slides",
  pdf: "pdf",
  ics: "calendar",
  "7z": "archive",
  gz: "archive",
  rar: "archive",
  tar: "archive",
  zip: "archive",
  avif: "image",
  gif: "image",
  heic: "image",
  jpeg: "image",
  jpg: "image",
  png: "image",
  svg: "image",
  webp: "image",
  avi: "video",
  mkv: "video",
  mov: "video",
  mp4: "video",
  webm: "video",
  flac: "audio",
  m4a: "audio",
  mp3: "audio",
  ogg: "audio",
  wav: "audio",
  css: "code",
  html: "code",
  js: "code",
  json: "code",
  py: "code",
  sh: "code",
  ts: "code",
  tsx: "code",
  md: "text",
  txt: "text",
};

const LABELS: Record<string, string> = {
  docx: "DOC",
  jpeg: "JPG",
  pages: "DOC",
  pptx: "PPT",
  xlsx: "XLS",
};

const PAGE =
  "M2 .5h7.5l4 4V16a1.5 1.5 0 0 1-1.5 1.5H2A1.5 1.5 0 0 1 .5 16V2A1.5 1.5 0 0 1 2 .5Z";
const FOLD = "M9.5.5v3a1 1 0 0 0 1 1h3Z";
const SHEET = "M2 .5h10A1.5 1.5 0 0 1 13.5 2v14a1.5 1.5 0 0 1-1.5 1.5H2A1.5 1.5 0 0 1 .5 16V2A1.5 1.5 0 0 1 2 .5Z";
const BAND = "M.5 2A1.5 1.5 0 0 1 2 .5h10A1.5 1.5 0 0 1 13.5 2v3H.5Z";
const ZIPPER = "M6 .5h1v1H6Zm1 1h1v1H7ZM6 2.5h1v1H6Zm1 1h1v1H7ZM6 4.5h1v1H6Zm1 1h1v1H7Z";

const ART: Partial<Record<FileKind, React.ReactNode>> = {
  document: <path d="M2.5 3H7M2.5 5h6M2.5 7h9M2.5 9h6" />,
  sheet: <path d="M2.5 2.5h6v6h-6ZM4.5 2.5v6M6.5 2.5v6M2.5 4.5h6M2.5 6.5h6" />,
  slides: (
    <>
      <circle cx="5.5" cy="5.5" r="3" />
      <path className={styles.wedge} d="M5.5 5.5v-3a3 3 0 0 1 3 3Z" />
    </>
  ),
  pdf: (
    <>
      <rect className={styles.wedge} x="2.5" y="2.5" width="3" height="3" rx=".5" />
      <path d="M7 3h1.5M7 5h4.5M2.5 7.5h9" />
    </>
  ),
};

function describe(name: string): { kind: FileKind; label: string } {
  const dot = name.lastIndexOf(".");
  const extension = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  const label = LABELS[extension] ?? extension.toUpperCase();
  return {
    kind: KINDS[extension] ?? (extension ? "text" : "blank"),
    label: label.length <= 3 ? label : "",
  };
}

interface FileIconProps extends React.ComponentPropsWithoutRef<"svg"> {
  name: string;
  size?: number;
}

function FileIcon({ name, size = 18, className, ...props }: FileIconProps) {
  const { kind, label } = describe(name);
  const flat = kind === "calendar" || kind === "archive";
  return (
    <svg
      aria-hidden
      viewBox="0 0 14 18"
      width={(size * 14) / 18}
      height={size}
      className={cn(styles.file, className)}
      data-kind={kind}
      {...props}
    >
      <path className={styles.page} d={flat ? SHEET : PAGE} />
      {flat ? null : <path className={styles.fold} d={FOLD} />}
      {ART[kind] ? <g className={styles.art}>{ART[kind]}</g> : null}
      {kind === "calendar" ? <path className={styles.band} d={BAND} /> : null}
      {kind === "archive" ? <path className={styles.zipper} d={ZIPPER} /> : null}
      {label ? (
        <text className={styles.label} x="7" y="14.75" textAnchor="middle">
          {label}
        </text>
      ) : null}
    </svg>
  );
}

export { FileIcon };
