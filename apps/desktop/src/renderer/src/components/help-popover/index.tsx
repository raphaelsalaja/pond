import CircleUser from "@pond/icons/fill/circle-user";
import ClockRotateClockwise from "@pond/icons/fill-duo/clock-rotate-clockwise";
import ConnectedDots from "@pond/icons/fill-duo/connected-dots";
import Download from "@pond/icons/fill-duo/download";
import Slider from "@pond/icons/fill-duo/slider";
import Sparkle from "@pond/icons/fill-duo/sparkle";
import ArrowUpRight from "@pond/icons/outline/arrow-up-right";
import Magnifier from "@pond/icons/outline/magnifier";
import Markdown from "@pond/icons/outline/markdown";
import { type SVGProps, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Popover,
  PopoverContent,
  PopoverGroupLabel,
  PopoverItem,
  PopoverSeparator,
  PopoverTrigger,
} from "../../ui";
import styles from "./styles.module.css";

const REPO_URL = "https://github.com/raphaelsalaja/pond";
const DOCS_URL = `${REPO_URL}#readme`;
const ISSUES_URL = `${REPO_URL}/issues`;
const CHANGELOG_URL = `${REPO_URL}/blob/main/CHANGELOG.md`;
const DISCUSSIONS_URL = `${REPO_URL}/discussions`;

/**
 * The floating "?" launcher in the bottom-left of the sidebar. Opens
 * a popover modeled on Linear's help menu — quick links to docs,
 * shortcuts, settings, status, and a "What's new" footer.
 *
 * Most rows are best-effort placeholders today (the Docs / Issues /
 * Changelog links are real; Search / Status / Community route to the
 * GitHub repo for now). The menu is fully wired so the moment those
 * features land we just swap the handler.
 *
 * Open state is controlled so each row can close the menu after acting
 * (navigate, open external, etc) without forcing every row to spell
 * out a `<PopoverClose>` wrapper.
 */
export function HelpPopover() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  function close() {
    setOpen(false);
  }

  function openUrl(url: string) {
    void window.pond.openExternal(url);
    close();
  }

  function go(path: string) {
    navigate(path);
    close();
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className={styles.trigger}
            aria-label="Help and resources"
            title="Help & resources"
          >
            <QuestionMark />
          </button>
        }
      />

      <PopoverContent
        side="top"
        align="start"
        sideOffset={10}
        className={styles.menu}
      >
        <PopoverItem icon={<Magnifier />} onClick={close}>
          Search for help…
        </PopoverItem>

        <PopoverItem
          icon={<Markdown />}
          kbd={<ArrowUpRight width={12} height={12} />}
          onClick={() => openUrl(DOCS_URL)}
        >
          Docs
        </PopoverItem>

        <PopoverItem
          icon={<CircleUser />}
          kbd={<ArrowUpRight width={12} height={12} />}
          onClick={() => openUrl(ISSUES_URL)}
        >
          Contact us
        </PopoverItem>

        <PopoverItem icon={<KeyboardIcon />} kbd="⌘ /" onClick={close}>
          Keyboard shortcuts
        </PopoverItem>

        <PopoverItem icon={<Sparkle />} onClick={close}>
          Pond status
        </PopoverItem>

        <PopoverItem
          icon={<Download />}
          kbd={<ArrowUpRight width={12} height={12} />}
          onClick={() => openUrl(REPO_URL)}
        >
          Download apps
        </PopoverItem>

        <PopoverItem
          icon={<Slider />}
          kbd="G then S"
          onClick={() => go("/settings")}
        >
          Settings
        </PopoverItem>

        <PopoverItem
          icon={<ConnectedDots />}
          kbd={<ArrowUpRight width={12} height={12} />}
          onClick={() => openUrl(DISCUSSIONS_URL)}
        >
          Community
        </PopoverItem>

        <PopoverSeparator />
        <PopoverGroupLabel>What's new</PopoverGroupLabel>

        <WhatsNewItem
          label="Help menu shipped"
          onClick={() => openUrl(CHANGELOG_URL)}
        />
        <WhatsNewItem
          label="Preferences redesign"
          onClick={() => go("/settings")}
        />
        <WhatsNewItem
          label="Full changelog"
          icon={<ClockRotateClockwise width={12} height={12} />}
          onClick={() => openUrl(CHANGELOG_URL)}
        />
      </PopoverContent>
    </Popover>
  );
}

function WhatsNewItem({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon?: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className={styles.whatsNewRow}>
      <span className={styles.whatsNewDot} aria-hidden />
      <span className={styles.whatsNewLabel}>{label}</span>
      {icon ? (
        <span className={styles.whatsNewMeta} aria-hidden>
          {icon}
        </span>
      ) : null}
    </button>
  );
}

/* -------------------------------------------------------------------- */
/* Inline glyphs for icons we don't have packaged yet.                  */
/* Kept tiny + monochrome (currentColor) to slot into the popover row.  */
/* -------------------------------------------------------------------- */

function QuestionMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 16 16"
      xmlns="http://www.w3.org/2000/svg"
      width={13}
      height={13}
      {...props}
    >
      <title>Help</title>
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M5.5 5.5a2.5 2.5 0 1 1 3.7 2.2c-.7.4-1.2 1-1.2 1.8v.5"
      />
      <circle cx="8" cy="12.4" r="0.95" fill="currentColor" />
    </svg>
  );
}

function KeyboardIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 18 18"
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      {...props}
    >
      <title>Keyboard</title>
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1}
      >
        <rect x="2.25" y="4.75" width="13.5" height="8.5" rx="1.6" />
        <circle cx="5" cy="7.75" r="0.4" fill="currentColor" stroke="none" />
        <circle cx="7.5" cy="7.75" r="0.4" fill="currentColor" stroke="none" />
        <circle cx="10" cy="7.75" r="0.4" fill="currentColor" stroke="none" />
        <circle cx="12.5" cy="7.75" r="0.4" fill="currentColor" stroke="none" />
        <circle cx="5" cy="10" r="0.4" fill="currentColor" stroke="none" />
        <circle cx="7.5" cy="10" r="0.4" fill="currentColor" stroke="none" />
        <circle cx="10" cy="10" r="0.4" fill="currentColor" stroke="none" />
        <circle cx="12.5" cy="10" r="0.4" fill="currentColor" stroke="none" />
        <line x1="5.75" y1="11.5" x2="12.25" y2="11.5" />
      </g>
    </svg>
  );
}
