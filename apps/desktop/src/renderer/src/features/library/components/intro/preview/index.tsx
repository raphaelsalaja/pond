import { IconGrid, IconMagnifier } from "@pond/icons";
import type { Source } from "@pond/schema/db";
import { BrandTile } from "@/features/sources";
import { Intro } from "@/shared/components/intro";
import styles from "./styles.module.css";

const COLUMNS: ReadonlyArray<
  ReadonlyArray<{ height: number; source?: Source }>
> = [
  [{ height: 44, source: "pinterest" }, { height: 30 }, { height: 52 }],
  [{ height: 30 }, { height: 56, source: "twitter" }, { height: 28 }],
  [{ height: 52, source: "arena" }, { height: 34 }, { height: 40 }],
  [{ height: 36 }, { height: 48, source: "youtube" }, { height: 30 }],
];

/** A still of a filled grid, searched in plain words, with one Save lifted. */
export function LibraryPreview() {
  return (
    <Intro.Preview>
      <Intro.Window>
        <span className={styles.header}>
          <Intro.Heading icon={<IconGrid size={12} />}>Library</Intro.Heading>
          <Intro.Pill>
            <IconMagnifier size={12} />
            chairs by a window
          </Intro.Pill>
        </span>
        <span className={styles.grid}>
          {COLUMNS.map((column) => (
            <span
              key={column.map((tile) => tile.height).join()}
              className={styles.column}
            >
              {column.map((tile) => (
                <Intro.Block key={tile.height} height={tile.height}>
                  {tile.source ? (
                    <Intro.Badge>
                      <BrandTile source={tile.source} size={10} />
                    </Intro.Badge>
                  ) : null}
                </Intro.Block>
              ))}
            </span>
          ))}
        </span>
      </Intro.Window>
      <Intro.Card elevation="raised" className={styles.save}>
        <Intro.Block height={60}>
          <Intro.Badge>
            <BrandTile source="instagram" size={12} />
          </Intro.Badge>
        </Intro.Block>
        <Intro.Bar width="72%" tone="strong" />
        <Intro.Bar width="44%" />
      </Intro.Card>
      <Intro.Cursor className={styles.cursor} />
    </Intro.Preview>
  );
}
