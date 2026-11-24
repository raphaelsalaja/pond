import { sendMessage } from "@/utils/messaging";

const BOOKMARKS_SELECTOR = 'a[href="/i/bookmarks"], a[href="/i/bookmarks/all"]';
const RELABELED_ATTR = "data-pond-relabeled";
const NEW_LABEL = "Open Pond";

function openPond() {
  void sendMessage("openPond", undefined).catch(() => {});
}

function relabel(anchor: HTMLAnchorElement) {
  /** Grab the deepest leaf span reading "Bookmarks" so we don't clobber icons. */
  const spans = Array.from(anchor.querySelectorAll("span"));
  const labelSpan = spans.find(
    (span) =>
      span.childElementCount === 0 &&
      span.textContent?.trim().toLowerCase() === "bookmarks",
  );
  if (labelSpan && labelSpan.textContent !== NEW_LABEL) {
    labelSpan.textContent = NEW_LABEL;
  }

  if (anchor.getAttribute(RELABELED_ATTR) === "true") {
    return;
  }
  anchor.setAttribute(RELABELED_ATTR, "true");
  anchor.setAttribute("aria-label", NEW_LABEL);

  anchor.addEventListener(
    "click",
    (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      openPond();
    },
    { capture: true },
  );
}

function scan() {
  const anchors =
    document.querySelectorAll<HTMLAnchorElement>(BOOKMARKS_SELECTOR);
  anchors.forEach(relabel);
}

function start() {
  scan();
  const observer = new MutationObserver(() => scan());
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

/** X re-applies its own sidebar text on navigation, so we re-assert our label on DOM mutations. */
export function mountPondSidebarLink() {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
}
