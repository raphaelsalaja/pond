import { IconDots, IconPlus, IconXmark } from "@pond/icons";
import { BrandTile, Button, Chip, Pane, Tabs } from "@pond/ui";
import Image from "next/image";
import { type LibrarySave, saveImage } from "@/lib/library";
import { getSource } from "@/lib/sources";
import styles from "./styles.module.css";

interface DetailsProps {
  save: LibrarySave;
  tags: string[];
  folder: string;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className={styles.section}>
      <header className={styles["section-header"]}>
        <h3 className={styles["section-title"]}>{title}</h3>
        <Button icon size="xs" variant="ghost" aria-label={`Add to ${title}`}>
          <IconPlus />
        </Button>
      </header>
      {children}
    </section>
  );
}

export function Details({ save, tags, folder }: DetailsProps) {
  const source = getSource(save.source);
  return (
    <Tabs.Root
      value="details"
      render={<section className={styles.root} aria-label="Details" />}
    >
      <Pane.Header
        className={styles.header}
        title={
          <Tabs.List aria-label="Details Views">
            <Tabs.Tab value="details">Details</Tabs.Tab>
            <Tabs.Tab value="related">Related</Tabs.Tab>
          </Tabs.List>
        }
      >
        <Button icon size="sm" variant="ghost" aria-label="More">
          <IconDots />
        </Button>
        <Button icon size="sm" variant="ghost" aria-label="Close Details">
          <IconXmark />
        </Button>
      </Pane.Header>
      <Pane.Body className={styles.scroll}>
        <figure className={styles.preview}>
          <Image
            src={saveImage(save)}
            alt=""
            width={save.width}
            height={save.height}
            sizes="320px"
          />
        </figure>
        <div className={styles.colors}>
          {save.colors.map((color) => (
            <span
              key={color}
              className={styles.swatch}
              style={{ background: color }}
            />
          ))}
        </div>
        <div className={styles.identity}>
          <p className={styles.title}>{save.title}</p>
          <p className={styles.description}>Add a description</p>
        </div>
        <div className={styles.source}>
          <BrandTile size={28}>
            <source.Icon width={28} height={28} />
          </BrandTile>
          <span className={styles["source-text"]}>
            <span className={styles["source-label"]}>{source.label}</span>
            <span className={styles["source-host"]}>{source.host}</span>
          </span>
        </div>
        <p className={styles.note}>Add a note</p>
        <Section title="Tags">
          <div className={styles.chips}>
            {tags.map((tag) => (
              <Chip.Item key={tag} tone="tag">
                {tag}
              </Chip.Item>
            ))}
          </div>
        </Section>
        <Section title="Folders">
          <div className={styles.chips}>
            <Chip.Item tone="tag">{folder}</Chip.Item>
          </div>
        </Section>
        <dl className={styles.facts}>
          <div>
            <dt>Type</dt>
            <dd>{save.kind === "video" ? "MP4" : "JPG"}</dd>
          </div>
          <div>
            <dt>Dimensions</dt>
            <dd>
              {save.width} × {save.height}
            </dd>
          </div>
          <div>
            <dt>Saved</dt>
            <dd>{save.savedAt.split(" ")[0]}</dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>{source.label}</dd>
          </div>
        </dl>
      </Pane.Body>
    </Tabs.Root>
  );
}
