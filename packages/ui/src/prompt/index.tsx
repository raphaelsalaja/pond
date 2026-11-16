import { clsx as cn } from "clsx";
import {
  createContext,
  use,
  useId,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { Reveal } from "../reveal";
import styles from "./styles.module.css";

interface PromptContextValue {
  titleId: string | undefined;
  setTitleId: (id: string | undefined) => void;
}

const PromptContext = createContext<PromptContextValue | null>(null);

interface RootProps extends React.ComponentPropsWithoutRef<"section"> {
  tone?: "default" | "destructive";
  visible?: boolean;
}

function Root({ tone = "default", visible, className, ...props }: RootProps) {
  const [titleId, setTitleId] = useState<string | undefined>();
  const context = useMemo(() => ({ titleId, setTitleId }), [titleId]);
  return (
    <PromptContext value={context}>
      <Reveal className={styles.reveal} visible={visible}>
        <section
          className={cn(styles.root, className)}
          data-tone={tone === "default" ? undefined : tone}
          {...props}
        />
      </Reveal>
    </PromptContext>
  );
}

interface BodyProps extends React.ComponentPropsWithoutRef<"div"> {}

function Body({ className, ...props }: BodyProps) {
  return <div className={cn(styles.body, className)} {...props} />;
}

interface TitleProps extends React.ComponentPropsWithoutRef<"h3"> {}

function Title({ id, className, ...props }: TitleProps) {
  const generated = useId();
  const titleId = id ?? generated;
  const setTitleId = use(PromptContext)?.setTitleId;
  useLayoutEffect(() => {
    setTitleId?.(titleId);
    return () => setTitleId?.(undefined);
  }, [setTitleId, titleId]);
  return <h3 id={titleId} className={cn(styles.title, className)} {...props} />;
}

interface DescriptionProps extends React.ComponentPropsWithoutRef<"p"> {}

function Description({ className, ...props }: DescriptionProps) {
  return <p className={cn(styles.description, className)} {...props} />;
}

interface ChoicesProps extends React.ComponentPropsWithoutRef<"fieldset"> {}

function Choices({ className, ...props }: ChoicesProps) {
  const titleId = use(PromptContext)?.titleId;
  const named = props["aria-label"] != null || props["aria-labelledby"] != null;
  return (
    <fieldset
      aria-labelledby={named ? undefined : titleId}
      className={cn(styles.choices, className)}
      {...props}
    />
  );
}

interface ChoiceProps extends React.ComponentPropsWithoutRef<"button"> {
  letter: string;
  selected?: boolean;
}

function Choice({
  letter,
  selected = false,
  className,
  children,
  ...props
}: ChoiceProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(styles.choice, className)}
      data-selected={selected || undefined}
      {...props}
    >
      <span className={styles.badge} aria-hidden>
        {letter}
      </span>
      <span className={styles.text}>{children}</span>
    </button>
  );
}

interface FreeformProps
  extends Omit<React.ComponentPropsWithoutRef<"input">, "type"> {
  letter: string;
  selected?: boolean;
}

function Freeform({
  letter,
  selected = false,
  className,
  "aria-label": ariaLabel = "Your Answer",
  ...props
}: FreeformProps) {
  return (
    <label
      className={cn(styles.choice, className)}
      data-selected={selected || undefined}
      data-disabled={props.disabled || undefined}
    >
      <span className={styles.badge} aria-hidden>
        {letter}
      </span>
      <input
        type="text"
        aria-label={ariaLabel}
        className={styles.input}
        {...props}
      />
    </label>
  );
}

interface FooterProps extends React.ComponentPropsWithoutRef<"div"> {}

function Footer({ className, ...props }: FooterProps) {
  return <div className={cn(styles.footer, className)} {...props} />;
}

interface AnswersProps extends React.ComponentPropsWithoutRef<"div"> {}

function Answers({ className, ...props }: AnswersProps) {
  return <div className={cn(styles.answers, className)} {...props} />;
}

interface AnswerProps extends React.ComponentPropsWithoutRef<"div"> {
  tone?: "default" | "muted";
}

function Answer({ tone = "default", className, ...props }: AnswerProps) {
  return (
    <div
      className={cn(styles.answer, className)}
      data-tone={tone === "default" ? undefined : tone}
      {...props}
    />
  );
}

interface AnswerQuestionProps extends React.ComponentPropsWithoutRef<"p"> {}

function AnswerQuestion({ className, ...props }: AnswerQuestionProps) {
  return <p className={cn(styles.question, className)} {...props} />;
}

interface AnswerTextProps extends React.ComponentPropsWithoutRef<"p"> {}

function AnswerText({ className, ...props }: AnswerTextProps) {
  return <p className={cn(styles.response, className)} {...props} />;
}

export const Prompt = {
  Root,
  Body,
  Title,
  Description,
  Choices,
  Choice,
  Freeform,
  Footer,
  Answers,
  Answer,
  AnswerQuestion,
  AnswerText,
};
