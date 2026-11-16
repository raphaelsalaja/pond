"use client";

import { docsFor } from "@pond/ui/docs";
import Link from "next/link";
import styles from "./styles.module.css";

const FEATURED = [
  "field",
  "button",
  "switch",
  "slider",
  "toggle-group",
  "rating",
];

export function Overview() {
  const tiles = FEATURED.flatMap((slug) => {
    const docs = docsFor(slug);
    const example = docs?.examples[0];
    return docs && example ? [{ slug, name: docs.name, example }] : [];
  });

  return (
    <>
      <section className={styles.tile} data-variant="hero">
        <h1 className={styles.title}>Pond Design System</h1>
        <p className={styles.summary}>
          Components and tokens from Pond UI, in Light and Dark.
        </p>
      </section>
      {tiles.map((tile) => (
        <section
          key={tile.slug}
          className={styles.tile}
          aria-label={tile.name}
        >
          <Link
            href={`/design/${tile.slug}`}
            scroll={false}
            className={styles.name}
          >
            {tile.name}
          </Link>
          <div className={styles.stage}>{tile.example.render()}</div>
        </section>
      ))}
    </>
  );
}
