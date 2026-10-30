import {
  IconCalendar,
  IconMagnifier,
  IconShieldCheck,
  IconSparkle,
} from "@pond/icons";
import { Dialog } from "@pond/ui";
import { DEFAULT_FISH_ID, DEFAULT_FISH_NAME } from "@shared/fish-contracts";
import { useEffect } from "react";
import { fish, useFish, useHydrateFish } from "@/features/fish";
import {
  fishIntroDialog,
  useFishIntroDialogOpen,
} from "@/shared/state/fish-intro";
import { promptToast } from "@/shared/state/prompts";
import { setupFlow } from "@/shared/state/setup";
import { supportDialog } from "@/shared/state/support";
import { readWhatsNewSeen, whatsNewDialog } from "@/shared/state/whats-new";
import {
  isFishIntroDue,
  readFishIntroState,
  writeFishIntroState,
} from "./eligibility";
import { School } from "./school";
import styles from "./styles.module.css";

const CHECK_INTERVAL_MS = 3000;

const FACTS = [
  {
    icon: IconMagnifier,
    title: "Ask about your saves",
    text: "A fish searches your library and shows the saves it read.",
  },
  {
    icon: IconCalendar,
    title: "Run routines",
    text: "A fish can run on a schedule or when new saves arrive.",
  },
  {
    icon: IconShieldCheck,
    title: "Review every change",
    text: "Anything a fish wants to change waits for your approval.",
  },
  {
    icon: IconSparkle,
    title: "Pick the model",
    text: "Use Apple Intelligence, your key, or a local host you run.",
  },
] as const;

function anotherDialogOpen(): boolean {
  return (
    setupFlow.isOpen() ||
    whatsNewDialog.isOpen() ||
    supportDialog.isOpen() ||
    promptToast.isOpen()
  );
}

/** Reads the last What's New version before that dialog overwrites it, then waits for a clear screen. */
function useIntroduceOnce(): void {
  useEffect(() => {
    if (readFishIntroState() === null && isFishIntroDue(readWhatsNewSeen()))
      writeFishIntroState("due");
    if (readFishIntroState() !== "due") return;
    const timer = setInterval(() => {
      if (anotherDialogOpen()) return;
      clearInterval(timer);
      writeFishIntroState("shown");
      fishIntroDialog.open();
    }, CHECK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);
}

function Intro() {
  useHydrateFish();
  const koi = useFish(DEFAULT_FISH_ID);
  const name = koi?.name ?? DEFAULT_FISH_NAME;

  function chat() {
    fish.open(DEFAULT_FISH_ID);
    fishIntroDialog.close();
  }

  return (
    <Dialog.Popup>
      <Dialog.Header data-empty />
      <Dialog.Content>
        <div className={styles.body}>
          <School
            lead={{
              color: koi?.color ?? "orange",
              species: koi?.species ?? "koi",
            }}
          />
          <div className={styles.copy}>
            <Dialog.Title className={styles.title}>Meet Your Fish</Dialog.Title>
            <Dialog.Description className={styles.description}>
              A fish is a chat character that knows your library. Give each one
              a name, instructions, and the folders or tags it can see.
            </Dialog.Description>
          </div>
          <ul className={styles.facts}>
            {FACTS.map(({ icon: Icon, title, text }) => (
              <li key={title} className={styles.fact}>
                <Icon size={18} className={styles.icon} />
                <div>
                  <p className={styles["fact-title"]}>{title}</p>
                  <p className={styles.text}>{text}</p>
                </div>
              </li>
            ))}
          </ul>
          <div className={styles.rename}>
            <p className={styles["fact-title"]}>Assistant is now Fish</p>
            <p className={styles.text}>
              Your Assistant chats now belong to {name}, your first fish. Add
              more fish from the sidebar, each with its own job.
            </p>
          </div>
        </div>
      </Dialog.Content>
      <Dialog.Footer layout="fill">
        <Dialog.Cancel>Close</Dialog.Cancel>
        <Dialog.Confirm onClick={chat}>Chat with {name}</Dialog.Confirm>
      </Dialog.Footer>
    </Dialog.Popup>
  );
}

export function FishIntroDialog() {
  const open = useFishIntroDialogOpen();
  useIntroduceOnce();

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) fishIntroDialog.close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Intro />
      </Dialog.Portal>
    </Dialog.Root>
  );
}
