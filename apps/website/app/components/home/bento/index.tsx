import type { ReactNode } from "react";
import { Frame } from "../../frame";
import { Heading } from "../../heading";
import {
  ColorDots,
  FishMoment,
  ProgressTicks,
  SavedMark,
  SearchWord,
  StatusDot,
  Waveform,
} from "./loops";
import styles from "./styles.module.css";

interface Card {
  id: string;
  title: string;
  body: string;
  visual: ReactNode;
}

const CARDS: Card[] = [
  {
    id: "sources",
    title: "Connect once. Pond keeps up.",
    body: "Link X, Instagram, Pinterest, and 15 more sources. Pond syncs through your own browser session.",
    visual: <StatusDot />,
  },
  {
    id: "colors",
    title: "Search by color.",
    body: "Pond pulls a palette from every image, so you can ask for the blue one.",
    visual: <ColorDots />,
  },
  {
    id: "text",
    title: "Find the words in a screenshot.",
    body: "Pond reads the text in your images, so searching a word finds the screenshot it's in.",
    visual: <SearchWord />,
  },
  {
    id: "transcription",
    title: "Search what a video says.",
    body: "Pond transcribes video on your computer, so spoken words show up in search.",
    visual: <Waveform />,
  },
  {
    id: "fish",
    title: "Ask your fish about your library.",
    body: "Fish answer from your saves with Apple Intelligence, your own key, or a local host you run.",
    visual: <FishMoment />,
  },
  {
    id: "imports",
    title: "Bring your history with you.",
    body: "Pond adds every like and save from a platform archive you downloaded, or from an Eagle library.",
    visual: <ProgressTicks />,
  },
  {
    id: "anywhere",
    title: "Save from anywhere.",
    body: "Use the browser extension, the Share menu, Shortcuts, Raycast, or the local API.",
    visual: <SavedMark />,
  },
];

export function Bento() {
  return (
    <Frame.Section spacing="xl" className={styles.root}>
      <Heading.Root layout="center">
        <Heading.Title>Everything you save, in one library.</Heading.Title>
        <Heading.Lede>
          Pond collects your likes and bookmarks, then reads every one on your
          computer so you can find it again.
        </Heading.Lede>
      </Heading.Root>
      <div className={styles.grid}>
        {CARDS.map((card) => (
          <article key={card.id} className={styles.card} data-card={card.id}>
            <div className={styles.visual}>{card.visual}</div>
            <h3 className={styles.title}>{card.title}</h3>
            <p className={styles.body}>{card.body}</p>
          </article>
        ))}
      </div>
    </Frame.Section>
  );
}
