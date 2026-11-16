"use client";

import * as icons from "@pond/icons";
import type { IconComponent } from "@pond/icons/types";
import { Input, Toggle, ToggleGroup } from "@pond/ui";
import { useDeferredValue, useState } from "react";
import { Code } from "../code";
import { Doc } from "../doc";
import styles from "./styles.module.css";

const SIZES = ["18", "24", "36"];

/** SAFETY: every `Icon*` export of `@pond/icons` is an `IconComponent`, and the filter drops the rest. */
const GLYPHS = Object.entries(icons as Record<string, IconComponent>)
  .filter(([name]) => name.startsWith("Icon"))
  .map(([name, Icon]) => ({
    name: name.slice(4),
    Icon,
    search: name.slice(4).toLowerCase(),
  }));

export function Icons() {
  return (
    <Doc.Root>
      <Doc.Header>
        <Doc.Title>Icons</Doc.Title>
        <Doc.Summary>
          Every glyph in <Code.Inline>@pond/icons</Code.Inline>. Each is drawn
          once on an 18×18 grid and scales to any size.
        </Doc.Summary>
      </Doc.Header>
      <Board />
    </Doc.Root>
  );
}

function Board() {
  const [query, setQuery] = useState("");
  const [size, setSize] = useState("24");
  const [grid, setGrid] = useState(false);
  const deferred = useDeferredValue(query.trim().toLowerCase());
  const shown = deferred
    ? GLYPHS.filter((glyph) => glyph.search.includes(deferred))
    : GLYPHS;

  return (
    <div className={styles.root}>
      <div className={styles.controls}>
        <Input.Root className={styles.search}>
          <Input.Field
            aria-label="Search Icons"
            placeholder="Search…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </Input.Root>
        <ToggleGroup
          aria-label="Icon Size"
          value={[size]}
          onValueChange={(value) => value[0] && setSize(value[0])}
        >
          {SIZES.map((value) => (
            <Toggle key={value} value={value} size="sm">
              {value}
            </Toggle>
          ))}
        </ToggleGroup>
        <Toggle
          variant="outline"
          size="sm"
          pressed={grid}
          onPressedChange={setGrid}
        >
          Grid
        </Toggle>
        <span className={styles.count}>
          {shown.length} of {GLYPHS.length} glyphs
        </span>
      </div>
      <ul className={styles.board} data-grid={grid || undefined}>
        {shown.map(({ name, Icon }) => (
          <li key={name} className={styles.tile}>
            <span
              className={styles.glyph}
              title={`Icon${name}`}
              style={
                /** SAFETY: React forwards custom properties, but `CSSProperties` has no `--*` keys. */
                { "--glyph-size": `${size}px` } as React.CSSProperties
              }
            >
              <Icon size={Number(size)} />
            </span>
            <span className={styles.name}>{name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
