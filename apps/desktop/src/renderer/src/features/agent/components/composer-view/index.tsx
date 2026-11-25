import { IconArrowUp } from "@pond/icons";
import { Button, Tooltip } from "@pond/ui";
import { clsx as cn } from "clsx";
import { AnimatePresence, motion, useReducedMotionConfig } from "motion/react";
import type { Transition } from "motion/react";
import { forwardRef, useEffect, useRef, useState } from "react";
import type {
  ComponentProps,
  ComponentPropsWithoutRef,
  ReactNode,
} from "react";
import styles from "./styles.module.css";

const GLYPH_EASE = { duration: 0.3, ease: [0.22, 1, 0.36, 1] } as const;
const LAYOUT_EASE: Transition = { type: "spring", duration: 0.3, bounce: 0 };

/** Taller than one 20px line plus the editor's 6px padding above and below, so only a second line expands the composer. */
const ONE_LINE_MAX_HEIGHT = 40;

interface RootProps extends ComponentPropsWithoutRef<typeof motion.form> {
  onSend?: () => void;
}

function Root({ className, onSend, onSubmit, ...props }: RootProps) {
  return (
    <motion.form
      className={cn(styles.root, className)}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit?.(event);
        onSend?.();
      }}
      {...props}
    />
  );
}

const Input = forwardRef<
  HTMLTextAreaElement,
  ComponentPropsWithoutRef<"textarea">
>(function Input({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      rows={1}
      className={cn(styles.input, className)}
      {...props}
    />
  );
});

type ActionProps = ComponentPropsWithoutRef<typeof Button> & {
  "aria-label": string;
};

function Send({ children, ...props }: ActionProps) {
  return (
    <Button
      type="submit"
      icon
      variant="primary"
      size="md"
      rounding="full"
      {...props}
    >
      {children}
    </Button>
  );
}

/** Measures the field so a second line, not a resize, is what expands the composer. */
function useGrown(empty: boolean) {
  const field = useRef<HTMLDivElement>(null);
  const [grown, setGrown] = useState(false);
  if (empty && grown) setGrown(false);
  useEffect(() => {
    const node = field.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      if (node.offsetHeight > ONE_LINE_MAX_HEIGHT) setGrown(true);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return { field, grown };
}

export function ComposerView({
  leading,
  toolbar,
  placeholder = "Ask about your Saves",
  children,
  inputProps,
  editor,
  running,
  empty = false,
  attached = false,
  onSend,
  onStop,
  ...props
}: ComponentProps<typeof Root> & {
  leading?: ReactNode;
  toolbar?: ReactNode;
  editor?: ReactNode;
  placeholder?: string;
  inputProps?: ComponentProps<typeof Input>;
  running?: boolean;
  /** Nothing typed or attached: Send is disabled and the composer returns to one line. */
  empty?: boolean;
  /** Files sit above the field, so the composer stays expanded while any are attached. */
  attached?: boolean;
  onStop?: () => void;
}) {
  const reduced = useReducedMotionConfig();
  const { field, grown } = useGrown(empty);
  const expanded = grown || attached;
  const layout = reduced ? false : "position";
  return (
    <Tooltip.Provider>
      <Root
        {...props}
        data-expanded={expanded || undefined}
        layout={!reduced}
        layoutDependency={expanded}
        transition={LAYOUT_EASE}
        onSend={running || empty ? undefined : onSend}
      >
        <motion.div
          className={styles.extra}
          layout={layout}
          layoutDependency={expanded}
        >
          {children}
        </motion.div>
        <motion.div
          ref={field}
          className={styles.field}
          layout={layout}
          layoutDependency={expanded}
        >
          {editor ?? (
            <Input
              aria-label="Message"
              placeholder={placeholder}
              {...inputProps}
            />
          )}
        </motion.div>
        {leading ? (
          <motion.div
            className={styles.leading}
            layout={layout}
            layoutDependency={expanded}
          >
            {leading}
          </motion.div>
        ) : null}
        <motion.div
          className={styles.trailing}
          layout={layout}
          layoutDependency={expanded}
        >
          {toolbar}
          <Tooltip label={running ? "Stop response" : "Send message"}>
            <Send
              type={running ? "button" : "submit"}
              aria-label={running ? "Stop" : "Send"}
              className={styles.send}
              disabled={!running && empty}
              onClick={running ? onStop : undefined}
            >
              <AnimatePresence initial={false}>
                {running ? (
                  <motion.span
                    key="stop"
                    className={styles.glyph}
                    initial={{ opacity: 0, scale: 0.7, filter: "blur(2px)" }}
                    animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                    exit={{ opacity: 0, scale: 0.7, filter: "blur(2px)" }}
                    transition={reduced ? { duration: 0 } : GLYPH_EASE}
                  >
                    <span className={styles["stop-icon"]} />
                  </motion.span>
                ) : (
                  <motion.span
                    key="send"
                    className={styles.glyph}
                    initial={{
                      opacity: 0,
                      y: 6,
                      scale: 0.8,
                      filter: "blur(2px)",
                    }}
                    animate={{
                      opacity: 1,
                      y: 0,
                      scale: 1,
                      filter: "blur(0px)",
                    }}
                    exit={{
                      opacity: 0,
                      y: -6,
                      scale: 0.8,
                      filter: "blur(2px)",
                    }}
                    transition={reduced ? { duration: 0 } : GLYPH_EASE}
                  >
                    <IconArrowUp size={16} />
                  </motion.span>
                )}
              </AnimatePresence>
            </Send>
          </Tooltip>
        </motion.div>
      </Root>
    </Tooltip.Provider>
  );
}
