import { IconPaperPlane } from "@pond/icons";
import { Button, Tooltip } from "@pond/ui";
import { clsx as cn } from "clsx";
import { AnimatePresence, motion, useReducedMotionConfig } from "motion/react";
import {
  type ComponentProps,
  type ComponentPropsWithoutRef,
  forwardRef,
  type ReactNode,
} from "react";
import styles from "./styles.module.css";

const GLYPH_EASE = { duration: 0.3, ease: [0.22, 1, 0.36, 1] } as const;

interface RootProps extends ComponentPropsWithoutRef<"form"> {
  onSend?: () => void;
}

function Root({ className, onSend, onSubmit, ...props }: RootProps) {
  return (
    <form
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
      variant="secondary"
      size="md"
      rounding="full"
      {...props}
    >
      {children}
    </Button>
  );
}

function Stop({ children, ...props }: ActionProps) {
  return (
    <Button
      type="button"
      icon
      variant="secondary"
      size="md"
      rounding="full"
      {...props}
    >
      {children}
    </Button>
  );
}

export function ComposerView({
  leading,
  toolbar,
  placeholder = "Ask about your Saves",
  children,
  inputProps,
  editor,
  running,
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
  onStop?: () => void;
}) {
  const reduced = useReducedMotionConfig();
  return (
    <Tooltip.Provider>
      <Root {...props} onSend={running ? undefined : onSend}>
        <div className={styles.extra}>{children}</div>
        <div className={styles.field}>
          {editor ?? (
            <Input
              aria-label="Message"
              placeholder={placeholder}
              {...inputProps}
            />
          )}
        </div>
        {leading ? <div className={styles.leading}>{leading}</div> : null}
        <div className={styles.trailing}>
          {toolbar}
          <Tooltip label={running ? "Stop response" : "Send message"}>
            <Send
              type={running ? "button" : "submit"}
              aria-label={running ? "Stop" : "Send"}
              className={styles.send}
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
                      x: -4,
                      y: 4,
                      scale: 0.8,
                      filter: "blur(2px)",
                    }}
                    animate={{
                      opacity: 1,
                      x: 0,
                      y: 0,
                      scale: 1,
                      filter: "blur(0px)",
                    }}
                    exit={{
                      opacity: 0,
                      x: 8,
                      y: -8,
                      scale: 0.8,
                      filter: "blur(2px)",
                    }}
                    transition={reduced ? { duration: 0 } : GLYPH_EASE}
                  >
                    <IconPaperPlane size={16} />
                  </motion.span>
                )}
              </AnimatePresence>
            </Send>
          </Tooltip>
        </div>
      </Root>
    </Tooltip.Provider>
  );
}
