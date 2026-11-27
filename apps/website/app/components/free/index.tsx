import { IconCheck, IconHeart } from "@pond/icons";
import type { Release } from "@/lib/release";
import { FREE, LINKS } from "../../content/home";
import { AppIcon } from "../app-icon";
import { Cta } from "../cta";
import { DownloadButton } from "../downloads";
import styles from "./styles.module.css";

function Checks({ items }: { items: Array<string> }) {
  return (
    <ul className={styles.checks}>
      {items.map((item) => (
        <li key={item} className={styles.check}>
          <IconCheck size={16} className={styles.tick} aria-hidden />
          {item}
        </li>
      ))}
    </ul>
  );
}

/** Where a pricing table would be: the one free plan, and the optional way to support it. */
export function Free({ release }: { release: Release | null }) {
  const { plan, support } = FREE;
  return (
    <div className={styles.grid}>
      <article className={styles.card}>
        <header className={styles.head}>
          <span className={styles.name}>
            <AppIcon size={18} />
            {plan.name}
          </span>
          <span className={styles.price}>{plan.price}</span>
          <p className={styles.body}>{plan.body}</p>
        </header>
        <Checks items={plan.includes} />
        <span className={styles.actions}>
          <DownloadButton release={release} size="sm">
            Download Pond
          </DownloadButton>
        </span>
      </article>
      <article className={styles.card} data-tint>
        <header className={styles.head}>
          <span className={styles.name}>
            <IconHeart size={18} className={styles.heart} aria-hidden />
            {support.name}
          </span>
          <span className={styles.price}>Optional</span>
          <p className={styles.body}>{support.body}</p>
        </header>
        <Checks items={support.includes} />
        <span className={styles.actions}>
          <Cta href={LINKS.coffee} variant="outline" size="sm">
            Buy Me a Coffee
          </Cta>
          <Cta href={LINKS.sponsors} variant="outline" size="sm">
            GitHub Sponsors
          </Cta>
        </span>
      </article>
    </div>
  );
}
