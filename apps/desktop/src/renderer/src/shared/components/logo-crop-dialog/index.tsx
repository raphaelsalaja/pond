import { IconImage } from "@pond/icons";
import { cssVars, Dialog, Slider } from "@pond/ui";
import {
  centeredFrame,
  cropPlacement,
  cropRect,
  type LogoCrop,
  type LogoSource,
  MAX_LOGO_ZOOM,
  panFrame,
  zoomFrame,
} from "@shared/logo-crop";
import {
  type KeyboardEvent,
  type PointerEvent,
  useId,
  useRef,
  useState,
} from "react";
import { errorCopy } from "@/shared/lib/error-copy";
import styles from "./styles.module.css";

const VIEWPORT = 224;
const PREVIEWS = [88, 28] as const;
const KEY_STEP = 8;
const KEY_ZOOM = 1.1;

const PAN_KEYS = new Map([
  ["ArrowLeft", { x: -1, y: 0 }],
  ["ArrowRight", { x: 1, y: 0 }],
  ["ArrowUp", { x: 0, y: -1 }],
  ["ArrowDown", { x: 0, y: 1 }],
]);

interface LogoCropDialogProps {
  source: LogoSource;
  onClose: () => void;
  onCrop: (icon: string) => void;
}

export function LogoCropDialog({
  source,
  onClose,
  onCrop,
}: LogoCropDialogProps) {
  const instructionsId = useId();
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const [frame, setFrame] = useState(() => centeredFrame(source));
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const crop = cropRect(source, frame);

  function pan(delta: { x: number; y: number }) {
    setFrame((current) => panFrame(source, current, delta, VIEWPORT));
  }

  function zoomTo(zoom: number) {
    setFrame((current) => zoomFrame(source, current, zoom));
  }

  function zoomBy(factor: number) {
    setFrame((current) => zoomFrame(source, current, current.zoom * factor));
  }

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || busy) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointer.current = { x: event.clientX, y: event.clientY };
    setDragging(true);
  }

  function drag(event: PointerEvent<HTMLDivElement>) {
    const last = pointer.current;
    if (!last) return;
    pointer.current = { x: event.clientX, y: event.clientY };
    pan({ x: event.clientX - last.x, y: event.clientY - last.y });
  }

  function endDrag() {
    pointer.current = null;
    setDragging(false);
  }

  function nudge(event: KeyboardEvent<HTMLDivElement>) {
    if (busy || event.nativeEvent.isComposing) return;
    const direction = PAN_KEYS.get(event.key);
    if (direction) {
      event.preventDefault();
      const step = event.shiftKey ? KEY_STEP * 5 : KEY_STEP;
      pan({ x: direction.x * step, y: direction.y * step });
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoomBy(KEY_ZOOM);
    } else if (event.key === "-") {
      event.preventDefault();
      zoomBy(1 / KEY_ZOOM);
    }
  }

  async function confirm(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const result = await window.pond.query("library.identity.cropIcon", {
        src: source.src,
        crop,
      });
      if (result.ok) onCrop(result.icon);
      else setError("Couldn't crop the image. Try again.");
    } catch (cause) {
      setError(errorCopy(cause, "Couldn't crop the image. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root
      open
      onOpenChange={(open, details) => {
        if (busy) details.cancel();
        else if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className={styles.popup}>
          <Dialog.Header>
            <Dialog.Title>Crop Logo</Dialog.Title>
          </Dialog.Header>
          <Dialog.Content className={styles.content}>
            <Dialog.Description id={instructionsId}>
              Drag the image to frame your logo. Arrow keys move it, plus and
              minus zoom.
            </Dialog.Description>
            <div className={styles.stage}>
              <div
                className={styles.viewport}
                role="application"
                aria-label="Logo Crop"
                aria-describedby={instructionsId}
                // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users pan and zoom the crop from this frame.
                tabIndex={0}
                data-dragging={dragging || undefined}
                style={cssVars({ "--crop-size": `${VIEWPORT}px` })}
                onPointerDown={startDrag}
                onPointerMove={drag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onKeyDown={nudge}
                onWheel={(event) => {
                  if (!busy) zoomBy(Math.exp(-event.deltaY / 200));
                }}
              >
                <CropImage source={source} crop={crop} size={VIEWPORT} />
              </div>
              <div className={styles.previews} aria-hidden>
                {PREVIEWS.map((size) => (
                  <div
                    key={size}
                    className={styles.preview}
                    data-size={size === PREVIEWS[0] ? "large" : "small"}
                    style={cssVars({ "--crop-size": `${size}px` })}
                  >
                    <CropImage source={source} crop={crop} size={size} />
                  </div>
                ))}
              </div>
            </div>
            <Slider.Root
              className={styles.zoom}
              min={1}
              max={MAX_LOGO_ZOOM}
              step={0.01}
              value={frame.zoom}
              disabled={busy}
              onValueChange={(zoom) =>
                zoomTo(Array.isArray(zoom) ? (zoom[0] ?? 1) : zoom)
              }
            >
              <IconImage size={12} />
              <Slider.Control>
                <Slider.Track>
                  <Slider.Indicator />
                  <Slider.Thumb aria-label="Zoom" />
                </Slider.Track>
              </Slider.Control>
              <IconImage size={18} />
            </Slider.Root>
            {error ? (
              <p className={styles.error} role="alert">
                {error}
              </p>
            ) : null}
          </Dialog.Content>
          <Dialog.Footer>
            <Dialog.Cancel disabled={busy} />
            <Dialog.Confirm
              type="button"
              loading={busy}
              onClick={() => void confirm()}
            >
              Crop
            </Dialog.Confirm>
          </Dialog.Footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

interface CropImageProps {
  source: LogoSource;
  crop: LogoCrop;
  size: number;
}

function CropImage({ source, crop, size }: CropImageProps) {
  const placement = cropPlacement(source, crop, size);
  return (
    <img
      className={styles.image}
      src={source.src}
      alt=""
      draggable={false}
      style={{
        width: placement.width,
        height: placement.height,
        transform: `translate(${placement.x}px, ${placement.y}px)`,
      }}
    />
  );
}
