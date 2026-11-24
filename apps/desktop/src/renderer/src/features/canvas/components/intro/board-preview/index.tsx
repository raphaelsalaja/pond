import { IconCanvas } from "@pond/icons";
import { BrandTile } from "@/features/sources";
import { Intro } from "@/shared/components/intro";
import styles from "./styles.module.css";

/** A still of a board: a section of Saves, a note tied to them, and one Save being placed. */
export function BoardPreview() {
  return (
    <Intro.Preview>
      <Intro.Window>
        <span className={styles.board} />
        <Intro.Heading icon={<IconCanvas size={12} />}>Moodboard</Intro.Heading>
        <span className={styles.section}>
          <Intro.Label tone="faint">References</Intro.Label>
          <span className={styles.cards}>
            <Intro.Card className={styles.card}>
              <Intro.Block height={36}>
                <Intro.Badge>
                  <BrandTile source="pinterest" size={10} />
                </Intro.Badge>
              </Intro.Block>
              <Intro.Bar width="70%" />
            </Intro.Card>
            <Intro.Card className={styles.card}>
              <Intro.Block height={36}>
                <Intro.Badge>
                  <BrandTile source="arena" size={10} />
                </Intro.Badge>
              </Intro.Block>
              <Intro.Bar width="50%" />
            </Intro.Card>
          </span>
        </span>
        <svg
          className={styles.connector}
          viewBox="0 0 24 32"
          fill="none"
          aria-hidden="true"
        >
          <path d="M0 30 C 14 30, 10 2, 24 2" />
        </svg>
        <Intro.Card className={styles.note}>
          <Intro.Label tone="faint">Warmer light</Intro.Label>
          <Intro.Label tone="faint">for the hero</Intro.Label>
        </Intro.Card>
      </Intro.Window>
      <Intro.Card elevation="raised" className={styles.dragged}>
        <Intro.Block height={44}>
          <Intro.Badge>
            <BrandTile source="instagram" size={12} />
          </Intro.Badge>
        </Intro.Block>
        <Intro.Bar width="64%" tone="strong" />
      </Intro.Card>
      <Intro.Cursor className={styles.cursor} />
    </Intro.Preview>
  );
}
