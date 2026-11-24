import { IconArrowRight, IconLayers } from "@pond/icons";
import { BrandTile } from "@/features/sources";
import { Intro } from "@/shared/components/intro";
import styles from "./styles.module.css";

const PIECES = [1, 2, 3, 4] as const;

/** A still of one gallery post and the four Saves it splits into. */
export function SplitPostsPreview() {
  return (
    <Intro.Preview>
      <Intro.Window>
        <Intro.Heading icon={<IconLayers size={12} />}>
          Split Posts
        </Intro.Heading>
        <span className={styles.flow}>
          <Intro.Card elevation="raised" className={styles.post}>
            <Intro.Block height={48}>
              <Intro.Badge>
                <BrandTile source="instagram" size={10} />
              </Intro.Badge>
            </Intro.Block>
            <span className={styles.dots}>
              {PIECES.map((piece) => (
                <span key={piece} data-active={piece === 1 || undefined} />
              ))}
            </span>
            <Intro.Label>Studio visit</Intro.Label>
          </Intro.Card>
          <span className={styles.arrow}>
            <IconArrowRight size={12} />
          </span>
          <span className={styles.pieces}>
            {PIECES.map((piece) => (
              <Intro.Block key={piece} height={40}>
                <Intro.Badge>
                  <BrandTile source="instagram" size={10} />
                </Intro.Badge>
              </Intro.Block>
            ))}
          </span>
        </span>
      </Intro.Window>
    </Intro.Preview>
  );
}
