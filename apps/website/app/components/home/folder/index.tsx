import { IconFolder } from "@pond/icons";
import Image from "next/image";
import { findSave, saveImage } from "@/lib/library";
import { Frame } from "../../frame";
import { Heading } from "../../heading";
import styles from "./styles.module.css";

const TREE = [
  { depth: 0, name: "My Pond.pond", folder: true },
  { depth: 1, name: "items", folder: true },
  { depth: 2, name: "01M1Z5DRYKCV5BRT.info", folder: true, open: true },
  { depth: 3, name: "info.json" },
  { depth: 3, name: "media-1.jpg" },
  { depth: 2, name: "01M1Z6A3QF8XK2PN.info", folder: true },
  { depth: 2, name: "01M1Z7HV0C4TNE9W.info", folder: true },
  { depth: 1, name: "trash", folder: true },
  { depth: 1, name: "fish.json" },
  { depth: 1, name: "tags.json" },
  { depth: 1, name: "metadata.json" },
];

const SAVE = findSave("chrome-chair");

const INFO: [string, string][] = [
  ["id", '"01M1Z5DRYKCV5BRT"'],
  ["source", `"${SAVE.source}"`],
  ["title", `"${SAVE.title}"`],
  ["tags", '["Furniture", "Chrome"]'],
  ["mediaType", '"image/jpeg"'],
  ["width", String(SAVE.width)],
  ["height", String(SAVE.height)],
  ["savedAt", '"2026-10-26T21:42:00Z"'],
];

export function Folder() {
  return (
    <Frame.Section spacing="xl" className={styles.root}>
      <Heading.Root layout="center">
        <Heading.Title>Your library is a folder.</Heading.Title>
        <Heading.Lede>
          Every save is its original file next to plain JSON. There's no Pond
          account and no Pond server.
        </Heading.Lede>
      </Heading.Root>
      <div className={styles.grid}>
        <figure className={styles.card} aria-label="Library folder">
          <ol className={styles.tree}>
            {TREE.map((row) => (
              <li
                key={row.name}
                data-open={row.open || undefined}
                style={{ paddingLeft: 8 + row.depth * 16 }}
              >
                {row.folder ? (
                  <IconFolder size={14} aria-hidden />
                ) : (
                  <span className={styles.file} aria-hidden />
                )}
                {row.name}
              </li>
            ))}
          </ol>
        </figure>
        <figure className={styles.card} aria-label="A save's info.json">
          <div className={styles.code}>
            <p className={styles.filename}>info.json</p>
            <pre>
              <code>
                {"{\n"}
                {INFO.map(([key, value], index) => (
                  <span key={key}>
                    {"  "}
                    <span className={styles.key}>{`"${key}"`}</span>
                    {`: ${value}`}
                    {index < INFO.length - 1 ? ",\n" : "\n"}
                  </span>
                ))}
                {"}"}
              </code>
            </pre>
          </div>
        </figure>
        <figure className={styles.card} aria-label="The original file">
          <div className={styles.original}>
            <Image
              src={saveImage(SAVE)}
              alt={SAVE.title}
              width={SAVE.width}
              height={SAVE.height}
              sizes="280px"
            />
            <figcaption className={styles.filename}>media-1.jpg</figcaption>
          </div>
        </figure>
      </div>
    </Frame.Section>
  );
}
