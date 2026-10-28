import {
  IconCalendar,
  IconChevronDown,
  IconDots,
  IconFolder,
  IconXmark,
} from "@pond/icons";
import { Button, Pane, Tabs } from "@pond/ui";
import { ComposerView } from "@pond/ui/composer";
import { Message } from "@pond/ui/message";
import { Prompt } from "@pond/ui/prompt";
import { Thread } from "@pond/ui/thread";
import Image from "next/image";
import { findSave, saveImage } from "@/lib/library";
import { FishMark } from "../fish-mark";
import styles from "./styles.module.css";

const YOU = "user";
const FISH = "assistant";
const CHANGES = ["sculpted-watch", "star-watch", "watch-unboxing"].map(
  findSave,
);

export function FishChat() {
  return (
    <section className={styles.chat} aria-label="Koi">
      <Thread.Conversation
        className={styles.body}
        viewportProps={{ className: styles.viewport }}
        composer={
          <ComposerView
            inputProps={{ readOnly: true, tabIndex: -1 }}
            placeholder="Ask about your Saves"
          />
        }
      >
        <time className={styles.time}>Yesterday 18:12</time>
        <Message.View role={YOU}>
          What's been going into Interiors lately?
        </Message.View>
        <Message.View role={FISH}>
          <Message.Bubble>
            Warm wood and red rooms, mostly. The last three were a Togo sofa, a
            red floor studio, and a toy bedroom, all from Pinterest and
            Instagram.
          </Message.Bubble>
        </Message.View>
        <time className={styles.time}>Today 9:41</time>
        <Message.View role={YOU}>
          Find the watches I saved this week and file them in Watches.
        </Message.View>
        <Message.View
          role={FISH}
          footer={
            <Prompt.Root aria-label="Apply 3 changes to your library?">
              <Prompt.Body>
                <Prompt.Title>Apply 3 changes to your library?</Prompt.Title>
                <Prompt.Description>Refiles 3 Saves</Prompt.Description>
                <ul className={styles.rows}>
                  {CHANGES.map((save) => (
                    <li key={save.id} className={styles.row}>
                      <Image
                        className={styles.thumb}
                        src={saveImage(save)}
                        alt=""
                        width={save.width}
                        height={save.height}
                        sizes="48px"
                      />
                      <span className={styles.text}>
                        <span className={styles.title}>{save.title}</span>
                        <span className={styles.detail}>
                          <IconFolder size={12} />
                          Add to Watches
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </Prompt.Body>
              <Prompt.Footer>
                <Button size="sm" variant="ghost">
                  Dismiss All
                </Button>
                <Button size="sm">Apply All</Button>
              </Prompt.Footer>
            </Prompt.Root>
          }
        >
          <Message.Bubble>
            I found three from this week: two on Pinterest and a review on
            YouTube. Nothing moves until you apply it.
          </Message.Bubble>
        </Message.View>
      </Thread.Conversation>
    </section>
  );
}

export function FishProfile() {
  return (
    <Tabs.Root
      value="details"
      render={<section className={styles.profile} aria-label="Koi" />}
    >
      <Pane.Header className={styles.header} title={null}>
        <Button icon size="sm" variant="ghost" aria-label="Close Details">
          <IconXmark />
        </Button>
      </Pane.Header>
      <div className={styles.hero}>
        <div className={styles.tile}>
          <FishMark color="orange" species="koi" size={56} />
          <Button
            icon
            size="sm"
            variant="secondary"
            rounding="full"
            className={styles.edit}
            aria-label="Species and Color"
          >
            <IconDots size={12} />
          </Button>
        </div>
        <p className={styles.name}>Koi</p>
      </div>
      <Tabs.List className={styles.tabs} aria-label="Fish Views">
        <Tabs.Tab value="details">Details</Tabs.Tab>
        <Tabs.Tab value="library">Library</Tabs.Tab>
        <Tabs.Tab value="activity">Activity</Tabs.Tab>
      </Tabs.List>
      <Pane.Body className={styles.scroll}>
        <section className={styles.section}>
          <h3 className={styles["section-title"]}>Instructions</h3>
          <p className={styles.instructions}>
            Keep my library tidy. File new saves into the closest folder, tag
            them by subject, and ask before you move anything I made myself.
          </p>
        </section>
        <section className={styles.section}>
          <h3 className={styles["section-title"]}>Model</h3>
          <span className={styles.field}>
            <span>Apple Intelligence</span>
            <IconChevronDown size={12} aria-hidden />
          </span>
        </section>
        <section className={styles.section}>
          <h3 className={styles["section-title"]}>Routines</h3>
          <ul className={styles.routines}>
            <li>
              <IconCalendar size={14} aria-hidden />
              <span className={styles["routine-name"]}>Weekly Tidy</span>
              <span className={styles["routine-time"]}>Mon 9:00</span>
            </li>
            <li>
              <IconCalendar size={14} aria-hidden />
              <span className={styles["routine-name"]}>Tag New Saves</span>
              <span className={styles["routine-time"]}>Daily</span>
            </li>
          </ul>
        </section>
      </Pane.Body>
    </Tabs.Root>
  );
}
