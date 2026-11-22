import {
  IconCircleInfo,
  IconContrast,
  IconKeyboard,
  IconTextA,
  IconTypeScale,
  IconTypography,
} from "@pond/icons";
import { Button, Input, Slider } from "@pond/ui";
import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { ViewerHud } from "@/features/saves/components/viewers/hud";
import { ChromePortal } from "@/features/saves/components/viewers/media-viewer/chrome";
import { ViewerFallback } from "@/features/saves/components/viewers/viewer-fallback";
import { ViewerSaveNav } from "@/features/saves/components/viewers/viewer-save-nav";
import { ViewerToolbarGroups } from "@/features/saves/components/viewers/viewer-toolbar-groups";
import { InlineNameEditor } from "@/shared/components/inline-name-editor";
import { formatBytes } from "@/shared/lib/format";
import { FileActions } from "../file-bar";
import type { ViewerProps } from "../types";
import styles from "./styles.module.css";

const DEFAULT_SPECIMEN = "Sphinx of black quartz, judge my vow.";
const GLYPHS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ\nabcdefghijklmnopqrstuvwxyz\n0123456789  !?&@#%()[]{}";
const SYMBOLS =
  "© ® ™ § ¶ † ‡ • … ‰ ′ ″ ‹ › « »\n$ ¢ £ € ¥ ₩ ₹ ₽ ₿\n+ − × ÷ = ≠ ≈ < > ≤ ≥ ± ∞ √ ∑ ∏ ∫ ∂ ∆\n← ↑ → ↓ ↔ ↕ ⇐ ⇑ ⇒ ⇓ ⇔";

const FONT_MODES = [
  { value: "specimen", label: "Specimen", Icon: IconTypography },
  { value: "waterfall", label: "Waterfall", Icon: IconTypeScale },
  { value: "characters", label: "Characters", Icon: IconTextA },
  { value: "symbols", label: "Symbols", Icon: IconKeyboard },
  { value: "information", label: "Information", Icon: IconCircleInfo },
] as const;

type FontMode = (typeof FONT_MODES)[number]["value"];

export function FontViewer(props: ViewerProps & { url: string }) {
  const [specimen, setSpecimen] = useState(DEFAULT_SPECIMEN);
  const [size, setSize] = useState(68);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [mode, setMode] = useState<FontMode>("specimen");
  const [background, setBackground] = useState<"light" | "dark">("light");
  const [renaming, setRenaming] = useState(false);
  const family = useMemo(
    () => `pond-preview-${props.save.id.replace(/[^a-zA-Z0-9_-]/g, "")}`,
    [props.save.id],
  );

  useEffect(() => {
    let active = true;
    setFailed(false);
    const face = new FontFace(family, `url(${JSON.stringify(props.url)})`);
    void face
      .load()
      .then((font) => {
        if (!active) return;
        document.fonts.add(font);
        setLoaded(true);
      })
      .catch(() => {
        if (!active) return;
        setLoaded(false);
        setFailed(true);
      });
    return () => {
      active = false;
      document.fonts.delete(face);
    };
  }, [family, props.url]);

  if (failed) {
    return <ViewerFallback {...props} reason="decode" active={props.active} />;
  }

  const style: CSSProperties & {
    "--preview-font": string;
    "--preview-size": string;
  } = {
    "--preview-font": loaded ? JSON.stringify(family) : "inherit",
    "--preview-size": `${size}px`,
  };

  return (
    <div className={styles.root} style={style} data-background={background}>
      <ChromePortal slot="top">
        <ViewerHud.Bar
          label="Font"
          start={<ViewerSaveNav saveId={props.save.id} />}
          center={
            <ViewerToolbarGroups
              controls={
                <>
                  <Input.Root
                    size="sm"
                    variant="secondary"
                    className={styles.field}
                  >
                    <Input.Field
                      value={specimen}
                      aria-label="Font specimen text"
                      onChange={(event) => setSpecimen(event.target.value)}
                    />
                  </Input.Root>
                  <div className={styles.size}>
                    <ViewerHud.Scale>{size}px</ViewerHud.Scale>
                    <Slider.Root
                      min={24}
                      max={144}
                      step={1}
                      value={size}
                      onValueChange={(next) => {
                        const value = Array.isArray(next)
                          ? (next[0] ?? 68)
                          : next;
                        setSize(value);
                      }}
                    >
                      <Slider.Control>
                        <Slider.Track>
                          <Slider.Indicator />
                          <Slider.Thumb aria-label="Font preview size" />
                        </Slider.Track>
                      </Slider.Control>
                    </Slider.Root>
                  </div>
                </>
              }
              actions={<FileActions {...props} />}
              view={
                <>
                  {FONT_MODES.map(({ value, label, Icon }) => (
                    <ViewerHud.Tool
                      key={value}
                      label={label}
                      pressed={mode === value}
                      onClick={() => setMode(value)}
                    >
                      <Icon />
                    </ViewerHud.Tool>
                  ))}
                  <ViewerHud.Tool
                    label={
                      background === "light"
                        ? "Use Dark Background"
                        : "Use Light Background"
                    }
                    onClick={() =>
                      setBackground((value) =>
                        value === "light" ? "dark" : "light",
                      )
                    }
                  >
                    <IconContrast />
                  </ViewerHud.Tool>
                </>
              }
            />
          }
        />
      </ChromePortal>
      <div className={styles.scroll} data-scroll-fade="vertical">
        {mode === "specimen" ? (
          <div className={styles.specimen}>{specimen || DEFAULT_SPECIMEN}</div>
        ) : null}
        {mode === "waterfall" ? (
          <div className={styles.waterfall}>
            {[18, 24, 32, 48, 64, 96, 128].map((previewSize) => (
              <div key={previewSize} style={{ fontSize: previewSize }}>
                <span>{previewSize}</span>
                {specimen || DEFAULT_SPECIMEN}
              </div>
            ))}
          </div>
        ) : null}
        {mode === "characters" ? (
          <pre className={styles.glyphs}>{GLYPHS}</pre>
        ) : null}
        {mode === "symbols" ? (
          <pre className={styles.glyphs}>{SYMBOLS}</pre>
        ) : null}
        {mode === "information" ? (
          <>
            <dl className={styles.metadata}>
              <div>
                <dt>File</dt>
                <dd>{props.file.path}</dd>
              </div>
              <div>
                <dt>Family</dt>
                <dd>{props.file.family ?? props.save.title ?? "Unknown"}</dd>
              </div>
              {props.file.subfamily ? (
                <div>
                  <dt>Style</dt>
                  <dd>{props.file.subfamily}</dd>
                </div>
              ) : null}
              {props.file.fontWeight ? (
                <div>
                  <dt>Weight</dt>
                  <dd>{props.file.fontWeight}</dd>
                </div>
              ) : null}
              <div>
                <dt>Size</dt>
                <dd>{formatBytes(props.file.size)}</dd>
              </div>
            </dl>
            <div className={styles.actions}>
              {renaming ? (
                <InlineNameEditor
                  name={props.save.title ?? props.file.family ?? "Untitled"}
                  className={styles["name-editor"]}
                  ariaLabel="Font name"
                  errorTitle="Could not rename this font."
                  onSave={async (name) => {
                    const result = await window.pond.query(
                      "saves.batchRename",
                      { ids: [props.save.id], pattern: name },
                    );
                    if (!result.ok)
                      throw new Error("Could not rename this font.");
                  }}
                  onFinish={() => setRenaming(false)}
                />
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setRenaming(true)}
                >
                  Rename Font
                </Button>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
