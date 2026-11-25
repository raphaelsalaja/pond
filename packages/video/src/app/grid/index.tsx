import { ease, mix, progress } from "../../motion";
import { PANEL } from "../geometry";
import styles from "./styles.module.css";

export interface Tile {
  key: string;
  src: string;
  title: string;
  aspect: number;
  ext?: string;
  /** The date line under the title in the 2.0 card. */
  date?: string;
  at: number;
}

type Look = "1.0" | "2.0";

const COLUMNS = 5;

/** 1.0 sits inside the inset panel; 2.0 fills the white center under the search bar. */
const METRICS = {
  "1.0": {
    left: PANEL.left,
    top: PANEL.top,
    width: PANEL.width,
    padding: 16,
    offset: 16,
    gap: 12,
    meta: 30,
  },
  "2.0": {
    left: 248,
    top: 44,
    width: 1002,
    padding: 20,
    offset: 72,
    gap: 16,
    meta: 42,
  },
} as const;

/** Each card's thumbnail rect within the grid, filling the shortest column first. */
function layout(tiles: ReadonlyArray<Pick<Tile, "aspect">>, look: Look) {
  const { width, padding, offset, gap, meta } = METRICS[look];
  const column = (width - padding * 2 - gap * (COLUMNS - 1)) / COLUMNS;
  const heights = Array.from({ length: COLUMNS }, (): number => offset);
  return tiles.map((tile) => {
    const index = heights.indexOf(Math.min(...heights));
    const top = heights[index] ?? 0;
    const height = column / tile.aspect;
    heights[index] = top + height + meta + gap;
    return {
      left: padding + index * (column + gap),
      top,
      width: column,
      height,
    };
  });
}

/** A tile's thumbnail in app coordinates, for pointing at it or flying it out. */
export function tileRect(
  tiles: ReadonlyArray<Pick<Tile, "aspect">>,
  index: number,
  look: Look = "1.0",
) {
  const rect = layout(tiles, look)[index] ?? {
    left: 0,
    top: 0,
    width: 0,
    height: 0,
  };
  const { left, top } = METRICS[look];
  return { ...rect, left: left + rect.left, top: top + rect.top };
}

interface GridProps {
  t: number;
  tiles: Array<Tile>;
  look?: Look;
  /** Rings this tile as selected. */
  selected?: string;
}

/** The waterfall grid: each card drops into the shortest column and pops in at its `at`. */
export function Grid({ t, tiles, look = "1.0", selected }: GridProps) {
  const rects = layout(tiles, look);
  const { left, top, width } = METRICS[look];
  return (
    <div
      className={styles.grid}
      data-look={look}
      style={look === "2.0" ? { left, top, width } : undefined}
    >
      {tiles.map((tile, i) => {
        const rect = rects[i];
        const k = ease.outQuint(progress(t, tile.at, 560));
        if (!rect || k <= 0) return null;
        return (
          <figure
            key={tile.key}
            className={styles.card}
            data-selected={tile.key === selected || undefined}
            style={{
              left: rect.left,
              top: rect.top,
              width: rect.width,
              opacity: ease.out(progress(t, tile.at, 260)),
              transform: `translateY(${(1 - k) * 14}px) scale(${mix(0.94, 1, k)})`,
            }}
          >
            <span className={styles.thumb}>
              <img
                alt=""
                src={tile.src}
                className={styles.image}
                style={{ height: rect.height }}
              />
              {tile.ext ? (
                <span className={styles.type}>{tile.ext}</span>
              ) : null}
            </span>
            <figcaption className={styles.meta}>
              <span className={styles.title}>{tile.title}</span>
              {look === "2.0" && tile.date ? (
                <span className={styles.date}>{tile.date}</span>
              ) : null}
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}
