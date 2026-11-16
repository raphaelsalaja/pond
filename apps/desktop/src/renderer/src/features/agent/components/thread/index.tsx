import { IconArrowDownToLine } from "@pond/icons";
import { Button, Tooltip } from "@pond/ui";
import { clsx as cn } from "clsx";
import { useReducedMotionConfig } from "motion/react";
import {
  type ComponentProps,
  type ComponentPropsWithoutRef,
  createContext,
  forwardRef,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { type ScrollToBottom, useStickToBottom } from "use-stick-to-bottom";
import { ComposerView } from "../composer-view";
import styles from "./styles.module.css";

function Root({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div className={cn(styles.root, className)} {...props} />;
}

const Viewport = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<"div">>(
  function Viewport({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn(styles.viewport, className)}
        data-scroll-fade="vertical"
        {...props}
      />
    );
  },
);

function ViewportFooter({
  className,
  ...props
}: ComponentPropsWithoutRef<"div">) {
  return <div className={cn(styles.footer, className)} {...props} />;
}

function Messages({
  children,
  empty,
}: {
  children: ReactNode;
  empty?: ReactNode;
}) {
  if (!children || (Array.isArray(children) && children.length === 0))
    return empty ? <div className={styles.empty}>{empty}</div> : null;
  return <>{children}</>;
}

interface ThreadScroll {
  isAtBottom: boolean;
  scrollToBottom: ScrollToBottom;
  stopScroll: () => void;
}

const ThreadScrollContext = createContext<ThreadScroll | null>(null);

/** Follow, release and return to the latest message from anywhere inside a `Thread.Conversation`. */
export function useThreadScroll(): ThreadScroll {
  const value = useContext(ThreadScrollContext);
  if (!value) throw new Error("useThreadScroll requires Thread.Conversation");
  return value;
}

function ScrollToLatest() {
  const reduceMotion = useReducedMotionConfig();
  const { isAtBottom, scrollToBottom } = useThreadScroll();
  if (isAtBottom) return null;
  return (
    <div className={styles["scroll-action"]}>
      <Button
        aria-label="Read Latest Response"
        icon
        rounding="full"
        size="xs"
        variant="secondary"
        onClick={() => scrollToBottom(reduceMotion ? "instant" : "smooth")}
      >
        <IconArrowDownToLine aria-hidden="true" />
      </Button>
    </div>
  );
}

export interface ThreadMark {
  id: string;
  title: string;
  description?: string;
}

/** Messages a rail can jump to carry this attribute with their mark id. */
const THREAD_MARK_ATTRIBUTE = "data-thread-mark";

function markNode(viewport: HTMLElement, id: string): HTMLElement | null {
  return viewport.querySelector<HTMLElement>(
    `[${THREAD_MARK_ATTRIBUTE}="${CSS.escape(id)}"]`,
  );
}

/** Marks above this line of the viewport count as read, so the current turn lights up before it reaches the top. */
const READ_LINE = 1 / 3;

function useCurrentMark(
  viewport: HTMLElement | null,
  ids: readonly string[],
): string | null {
  const [current, setCurrent] = useState<string | null>(null);
  const key = ids.join("\n");
  useEffect(() => {
    if (!viewport) return;
    const list = key ? key.split("\n") : [];
    const update = () => {
      const box = viewport.getBoundingClientRect();
      const line = box.top + box.height * READ_LINE;
      let next = list[0] ?? null;
      for (const id of list) {
        const node = markNode(viewport, id);
        if (node && node.getBoundingClientRect().top <= line) next = id;
      }
      if (
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <
        4
      )
        next = list.at(-1) ?? next;
      setCurrent(next);
    };
    update();
    viewport.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    return () => {
      viewport.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [viewport, key]);
  return current;
}

interface RailProps extends ComponentPropsWithoutRef<"nav"> {
  marks: readonly ThreadMark[];
  viewport: HTMLElement | null;
}

/** One tick per turn along the edge of a conversation; hover previews it, click jumps to it. */
function Rail({ marks, viewport, className, ...props }: RailProps) {
  const reduceMotion = useReducedMotionConfig();
  const scroll = useContext(ThreadScrollContext);
  const current = useCurrentMark(
    viewport,
    marks.map((mark) => mark.id),
  );
  if (marks.length < 2) return null;

  function jump(id: string) {
    const node = viewport && markNode(viewport, id);
    if (!viewport || !node) return;
    scroll?.stopScroll();
    const offset =
      node.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
    viewport.scrollTo({
      top: viewport.scrollTop + offset - 16,
      behavior: reduceMotion ? "instant" : "smooth",
    });
  }

  return (
    <nav
      aria-label="Conversation Timeline"
      className={cn(styles.rail, className)}
      data-scroll-fade="vertical"
      {...props}
    >
      <Tooltip.Group>
        {marks.map((mark) => (
          <Tooltip
            key={mark.id}
            side="right"
            sideOffset={4}
            delay={0}
            label={
              <span className={styles.preview}>
                <span className={styles.title}>{mark.title}</span>
                {mark.description ? (
                  <span className={styles.description}>{mark.description}</span>
                ) : null}
              </span>
            }
          >
            <button
              type="button"
              className={styles.tick}
              aria-label={mark.title}
              aria-current={mark.id === current ? "location" : undefined}
              data-current={mark.id === current || undefined}
              onClick={() => jump(mark.id)}
            />
          </Tooltip>
        ))}
      </Tooltip.Group>
    </nav>
  );
}

function Conversation({
  empty,
  composer = <ComposerView />,
  children,
  viewportProps,
  marks,
  ...props
}: ComponentProps<typeof Root> & {
  empty?: ReactNode;
  composer?: ReactNode;
  marks?: readonly ThreadMark[];
  viewportProps?: Omit<ComponentProps<typeof Viewport>, "ref">;
}) {
  const reduceMotion = useReducedMotionConfig();
  const { scrollRef, contentRef, isAtBottom, scrollToBottom, stopScroll } =
    useStickToBottom({
      initial: "instant",
      resize: reduceMotion ? "instant" : "smooth",
    });
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  const setViewportRef = useCallback(
    (node: HTMLDivElement | null) => {
      scrollRef(node);
      setViewport(node);
    },
    [scrollRef],
  );
  return (
    <ThreadScrollContext.Provider
      value={{ isAtBottom, scrollToBottom, stopScroll }}
    >
      <Root {...props}>
        <Viewport {...viewportProps} ref={setViewportRef}>
          <div ref={contentRef} className={styles.content}>
            <Messages empty={empty}>{children}</Messages>
          </div>
          <ViewportFooter>
            <ScrollToLatest />
            {composer}
          </ViewportFooter>
        </Viewport>
        {marks ? <Rail marks={marks} viewport={viewport} /> : null}
      </Root>
    </ThreadScrollContext.Provider>
  );
}

export const Thread = {
  Root,
  Viewport,
  ViewportFooter,
  Messages,
  ScrollToLatest,
  Rail,
  Conversation,
};
