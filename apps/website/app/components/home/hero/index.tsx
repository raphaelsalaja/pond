import { Button } from "@pond/ui";
import { GITHUB_URL } from "@/lib/links";
import { Frame } from "../../frame";
import { Replica } from "../../replica";
import { DownloadButton } from "./download-button";
import styles from "./styles.module.css";

export function Hero() {
  return (
    <Frame.Section spacing="none" className={styles.root}>
      <div className={styles.header}>
        <h1 className={styles.title}>
          Your own personal <br />
          web archiver.
        </h1>
        <div className={styles.aside}>
          <p className={styles.lede}>
            Save your bookmarks, links, whatever in a single secure place,
            locally and for free. You'll never need anything else.
          </p>
          <div className={styles.actions}>
            <Button
              variant="secondary"
              nativeButton={false}
              render={<a href={GITHUB_URL} target="_blank" rel="noreferrer" />}
            >
              View Source Code
            </Button>
            <DownloadButton />
          </div>
        </div>
      </div>
      <div className={styles.window}>
        <Replica
          className={styles.replica}
          selected={{
            id: "chrome-chair",
            tags: ["Furniture", "Chrome", "Seating"],
            folder: "Interiors",
          }}
        />
      </div>
    </Frame.Section>
  );
}
