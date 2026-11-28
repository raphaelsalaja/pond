/**
 * Post cards span the capture window's fixed-width column, so a far narrower capture
 * means the rect finder latched onto page chrome like the source wordmark, not the post.
 */
const POST_CARD_MIN_WIDTH_CSS = 200;

/** Even a one-line text post carries its author row and action bar, measuring well over 100 css px. */
const POST_CARD_MIN_HEIGHT_CSS = 48;

/**
 * Capture output scales with the display scale factor, not the emulation override, and padding adds a fixed 144 px.
 * @remarks Deriving the file floors at the minimum scale of 1 keeps them conservative, since sharper displays only produce larger files.
 */
const POST_CARD_FILE_MIN_WIDTH = POST_CARD_MIN_WIDTH_CSS + 144;
const POST_CARD_FILE_MIN_HEIGHT = POST_CARD_MIN_HEIGHT_CSS + 144;

export function postCardRectPlausible(size: {
  width: number;
  height: number;
}): boolean {
  return (
    size.width >= POST_CARD_MIN_WIDTH_CSS &&
    size.height >= POST_CARD_MIN_HEIGHT_CSS
  );
}

/** Missing dimensions predate size recording, so only a measured dimension can convict. */
export function postCardFilePlausible(size: {
  width?: number | null;
  height?: number | null;
}): boolean {
  return (
    (size.width ?? Number.POSITIVE_INFINITY) >= POST_CARD_FILE_MIN_WIDTH &&
    (size.height ?? Number.POSITIVE_INFINITY) >= POST_CARD_FILE_MIN_HEIGHT
  );
}
