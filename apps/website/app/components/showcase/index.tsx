import type {
  Showcase as ShowcaseCard,
  ShowcaseImage,
} from "../../content/home";
import { SCENE_IMAGES } from "../../content/scenes";
import { Capture } from "../capture";
import styles from "./styles.module.css";

/** The point in each capture's window that its card centers on. */
const FOCUS: Record<ShowcaseImage, { x: number; y: number }> = {
  color: { x: 700, y: 260 },
  text: { x: 300, y: 180 },
  routines: { x: 720, y: 400 },
  review: { x: 330, y: 360 },
  duplicates: { x: 330, y: 340 },
  snooze: { x: 560, y: 430 },
};

/** Cards with the words on the left and the real app cropped to the part they describe on the right. */
export function Showcase({ cards }: { cards: Array<ShowcaseCard> }) {
  return (
    <div className={styles.list}>
      {cards.map((card) => (
        <article key={card.image} className={styles.card}>
          <div className={styles.words}>
            <h3 className={styles.title}>{card.title}</h3>
            <p className={styles.body}>{card.body}</p>
          </div>
          <div className={styles.picture} aria-hidden>
            <Capture
              image={SCENE_IMAGES[card.image]}
              focus={FOCUS[card.image]}
              scale={0.8}
            />
          </div>
        </article>
      ))}
    </div>
  );
}
