/**
 * Width and height on a Save are the file's pixel size.
 * `rotate` is a view transform, so a quarter turn swaps the box the grid lays out.
 */
export function rotationSwapsAxes(rotate: number | null | undefined): boolean {
  const turns = ((Math.trunc(rotate ?? 0) % 360) + 360) % 360;
  return turns === 90 || turns === 270;
}

export function orientedDimensions(
  width: number,
  height: number,
  rotate: number | null | undefined,
) {
  if (!rotationSwapsAxes(rotate)) return { width, height };
  return { width: height, height: width };
}

export function orientAspectRatio(
  ratio: number,
  rotate: number | null | undefined,
): number {
  if (!rotationSwapsAxes(rotate) || !(ratio > 0)) return ratio;
  return 1 / ratio;
}
