import { clsx as cn } from "clsx";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import styles from "./styles.module.css";

type PageProps = ComponentPropsWithoutRef<"div">;

/** Whole-page first run for a place with nothing in it yet. */
function Page({ className, children, ...props }: PageProps) {
  return (
    <div className={cn(styles.page, className)} {...props}>
      <div className={styles.center}>
        <div className={styles.layout}>{children}</div>
      </div>
    </div>
  );
}

type HeroProps = ComponentPropsWithoutRef<"div">;

function Hero({ className, ...props }: HeroProps) {
  return <div className={cn(styles.hero, className)} {...props} />;
}

type CopyProps = ComponentPropsWithoutRef<"div">;

function Copy({ className, ...props }: CopyProps) {
  return <div className={cn(styles.copy, className)} {...props} />;
}

type TitleProps = ComponentPropsWithoutRef<"h1">;

function Title({ className, ...props }: TitleProps) {
  return <h1 className={cn(styles.title, className)} {...props} />;
}

type DescriptionProps = ComponentPropsWithoutRef<"p">;

function Description({ className, ...props }: DescriptionProps) {
  return <p className={cn(styles.description, className)} {...props} />;
}

type ActionsProps = ComponentPropsWithoutRef<"div">;

function Actions({ className, ...props }: ActionsProps) {
  return <div className={cn(styles.actions, className)} {...props} />;
}

type PreviewProps = ComponentPropsWithoutRef<"div">;

/** A grayscale miniature of the place once it has content; never interactive. */
function Preview({ className, children, ...props }: PreviewProps) {
  return (
    <div
      className={cn(styles.preview, className)}
      aria-hidden="true"
      inert
      {...props}
    >
      <div className={styles.scene}>{children}</div>
    </div>
  );
}

type WindowProps = ComponentPropsWithoutRef<"div">;

/** An app window that runs off the preview's right and bottom edges. */
function Window({ className, children, ...props }: WindowProps) {
  return (
    <div className={cn(styles.window, className)} {...props}>
      <span className={styles.dots}>
        <span />
        <span />
        <span />
      </span>
      <div className={styles.panel}>{children}</div>
    </div>
  );
}

interface HeadingProps extends ComponentPropsWithoutRef<"span"> {
  icon: ReactNode;
}

function Heading({ icon, className, children, ...props }: HeadingProps) {
  return (
    <span className={cn(styles.heading, className)} {...props}>
      {icon}
      <span className={styles.label}>{children}</span>
    </span>
  );
}

interface CardProps extends ComponentPropsWithoutRef<"div"> {
  elevation?: "flat" | "raised";
}

function Card({ elevation = "flat", className, ...props }: CardProps) {
  return (
    <div
      className={cn(styles.card, className)}
      data-elevation={elevation}
      {...props}
    />
  );
}

interface BarProps extends ComponentPropsWithoutRef<"span"> {
  width: number | string;
  tone?: "default" | "strong";
}

/** A line of text, drawn as a skeleton. */
function Bar({
  width,
  tone = "default",
  className,
  style,
  ...props
}: BarProps) {
  return (
    <span
      className={cn(styles.bar, className)}
      data-tone={tone}
      style={{ width, ...style }}
      {...props}
    />
  );
}

interface BlockProps extends ComponentPropsWithoutRef<"span"> {
  width?: number | string;
  height?: number | string;
  variant?: "rounded" | "round";
}

/** An image or avatar, drawn as a skeleton. */
function Block({
  width,
  height,
  variant = "rounded",
  className,
  style,
  ...props
}: BlockProps) {
  return (
    <span
      className={cn(styles.block, className)}
      data-variant={variant}
      style={{ width, height, ...style }}
      {...props}
    />
  );
}

type BadgeProps = ComponentPropsWithoutRef<"span">;

/** A source logo pinned to a Block's corner, like the badge on a Save card. */
function Badge({ className, ...props }: BadgeProps) {
  return <span className={cn(styles.badge, className)} {...props} />;
}

interface LabelProps extends ComponentPropsWithoutRef<"span"> {
  tone?: "default" | "faint";
}

function Label({ tone = "default", className, ...props }: LabelProps) {
  return (
    <span className={cn(styles.label, className)} data-tone={tone} {...props} />
  );
}

interface PillProps extends ComponentPropsWithoutRef<"span"> {
  variant?: "outline" | "solid";
}

function Pill({ variant = "outline", className, ...props }: PillProps) {
  return (
    <span
      className={cn(styles.pill, className)}
      data-variant={variant}
      {...props}
    />
  );
}

type CursorProps = ComponentPropsWithoutRef<"span">;

function Cursor({ className, ...props }: CursorProps) {
  return (
    <span className={cn(styles.cursor, className)} {...props}>
      <svg
        width="11"
        height="15"
        viewBox="0 0 11 15"
        fill="none"
        aria-hidden="true"
      >
        <path d="M1 1v11.5l3-3 2.25 4.75 2-1-2.25-4.5H10.5z" />
      </svg>
      <span className={styles.you}>You</span>
    </span>
  );
}

type FeaturesProps = ComponentPropsWithoutRef<"ul">;

function Features({ className, ...props }: FeaturesProps) {
  return <ul className={cn(styles.features, className)} {...props} />;
}

interface FeatureProps extends Omit<ComponentPropsWithoutRef<"li">, "title"> {
  icon: ReactNode;
  title: string;
}

function Feature({ icon, title, className, children, ...props }: FeatureProps) {
  return (
    <li className={cn(styles.feature, className)} {...props}>
      <span className={styles.icon}>{icon}</span>
      <h2 className={styles["feature-title"]}>{title}</h2>
      <p className={styles["feature-description"]}>{children}</p>
    </li>
  );
}

export const Intro = {
  Page,
  Hero,
  Copy,
  Title,
  Description,
  Actions,
  Preview,
  Window,
  Heading,
  Card,
  Bar,
  Block,
  Badge,
  Label,
  Pill,
  Cursor,
  Features,
  Feature,
};
