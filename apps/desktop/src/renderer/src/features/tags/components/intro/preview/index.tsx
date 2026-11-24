import { IconCheck, IconSparkle, IconTag } from "@pond/icons";
import type { Source } from "@pond/schema/db";
import { BrandTile } from "@/features/sources";
import { Intro } from "@/shared/components/intro";
import styles from "./styles.module.css";

const TILES: ReadonlyArray<{
  id: number;
  height: number;
  source?: Source;
}> = [
  { id: 1, height: 64, source: "pinterest" },
  { id: 2, height: 64 },
  { id: 3, height: 64, source: "instagram" },
  { id: 4, height: 40 },
  { id: 5, height: 40, source: "savee" },
  { id: 6, height: 40 },
];

/** A still of tagging saves, with the tag picker open over the grid. */
export function TagsPreview() {
  return (
    <Intro.Preview>
      <Intro.Window>
        <Intro.Heading icon={<IconTag size={12} />}>Tags</Intro.Heading>
        <span className={styles.grid}>
          {TILES.map((tile) => (
            <Intro.Block key={tile.id} height={tile.height}>
              {tile.source ? (
                <Intro.Badge>
                  <BrandTile source={tile.source} size={10} />
                </Intro.Badge>
              ) : null}
            </Intro.Block>
          ))}
        </span>
      </Intro.Window>
      <Intro.Card elevation="raised" className={styles.picker}>
        <span className={styles.field}>
          <IconTag size={12} />
          <Intro.Label tone="faint">Add tags</Intro.Label>
        </span>
        <span className={styles.item}>
          <span className={styles.check} data-checked="">
            <IconCheck size={8} />
          </span>
          <Intro.Label>Lighting</Intro.Label>
        </span>
        <span className={styles.item}>
          <span className={styles.check} />
          <Intro.Label>Interiors</Intro.Label>
        </span>
        <span className={styles.item}>
          <span className={styles.suggested}>
            <IconSparkle size={12} />
          </span>
          <Intro.Label tone="faint">Concrete</Intro.Label>
        </span>
      </Intro.Card>
    </Intro.Preview>
  );
}
