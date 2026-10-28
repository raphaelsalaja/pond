"use client";

import { Toggle, ToggleGroup } from "@pond/ui";
import { BrandTile } from "@pond/ui/brand-tile";
import { useState } from "react";
import { SOURCE_GROUPS, SOURCES, type SourceGroup } from "@/lib/sources";
import styles from "./styles.module.css";

type Filter = "all" | "new" | SourceGroup;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "new", label: "New in 2.0" },
  ...SOURCE_GROUPS,
];

function matches(filter: Filter, source: (typeof SOURCES)[number]): boolean {
  if (filter === "all") return true;
  if (filter === "new") return source.added === "2.0";
  return source.group === filter;
}

export function SourceDirectory() {
  const [filter, setFilter] = useState<Filter>("all");
  const visible = SOURCES.filter((source) => matches(filter, source));

  return (
    <div className={styles.root}>
      <ToggleGroup
        aria-label="Filter Sources"
        className={styles.filters}
        value={[filter]}
        onValueChange={(value) => {
          const next = FILTERS.find((entry) => entry.id === value[0]);
          if (next) setFilter(next.id);
        }}
      >
        {FILTERS.map((entry) => (
          <Toggle key={entry.id} value={entry.id} size="sm">
            {entry.label}
          </Toggle>
        ))}
      </ToggleGroup>
      <ul className={styles.grid}>
        {visible.map((source) => (
          <li key={source.id} className={styles.card} id={source.id}>
            <div className={styles.head}>
              <BrandTile size={32}>
                <source.Icon width={32} height={32} />
              </BrandTile>
              <span className={styles.name}>
                <span className={styles.label}>{source.label}</span>
                <span className={styles.host}>{source.host}</span>
              </span>
              {source.added === "2.0" ? (
                <span className={styles.new}>New</span>
              ) : null}
            </div>
            <p className={styles.syncs}>{source.syncs}</p>
            <ul className={styles.facts}>
              <li>
                {source.connect === "handle"
                  ? "Enter your handle"
                  : "Sign in with the extension"}
              </li>
              {source.watch ? <li>Watch accounts and collections</li> : null}
              {source.importable ? <li>Import your archive</li> : null}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
