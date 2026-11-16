import {
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconDocument,
  IconDots,
  IconDownload,
  IconFolder,
  IconGrid,
  IconGridLayoutRows,
  IconHouse,
  IconMagnifier,
  IconTag,
} from "@pond/icons";
import { Logo } from "@pond/ui";
import styles from "./styles.module.css";

const PLACES = [
  { id: "recents", Icon: IconClock },
  { id: "home", Icon: IconHouse },
  { id: "documents", Icon: IconDocument },
  { id: "downloads", Icon: IconDownload },
];

export function Finder({ file }: { file: string }) {
  return (
    <div className={styles.root} aria-hidden="true">
      <div className={styles.window}>
        <div className={styles.sidebar}>
          <span className={styles.lights}>
            <span />
            <span />
            <span />
          </span>
          <span className={styles.heading} />
          {PLACES.map(({ id, Icon }) => (
            <span className={styles.row} key={id}>
              <Icon size={12} />
              <span className={styles.bar} />
            </span>
          ))}
          <span className={styles.heading} />
          <span className={styles.row}>
            <IconFolder size={12} />
            <span className={styles.bar} data-wide="" />
          </span>
        </div>
        <div className={styles.main}>
          <div className={styles.toolbar}>
            <IconChevronLeft size={12} />
            <IconChevronRight size={12} />
            <span className={styles.bar} />
            <span className={styles.spacer} />
            <span className={styles.view} data-active="">
              <IconGrid size={12} />
            </span>
            <span className={styles.view}>
              <IconGridLayoutRows size={12} />
            </span>
            <IconTag size={12} />
            <IconDots size={12} />
            <IconMagnifier size={12} />
          </div>
          <div className={styles.content}>
            <div className={styles.bundle}>
              <span className={styles.tile}>
                <Logo size={22} className={styles.logo} />
                <span className={styles.badge}>!</span>
              </span>
              <span className={styles.name}>{file}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
