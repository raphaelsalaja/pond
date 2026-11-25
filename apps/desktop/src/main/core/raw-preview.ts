const MIN_JPEG_BYTES = 4096;

export function extractRawPreviewJpeg(container: Buffer): Buffer | null {
  let last: Buffer | null = null;
  for (let index = 0; index < container.length - 3; index += 1) {
    if (
      container[index] !== 0xff ||
      container[index + 1] !== 0xd8 ||
      container[index + 2] !== 0xff
    ) {
      continue;
    }
    const end = findJpegEnd(container, index + 3);
    if (end < 0) continue;
    const jpeg = container.subarray(index, end + 2);
    if (jpeg.length >= MIN_JPEG_BYTES) last = jpeg;
    index = end + 1;
  }
  return last;
}

function findJpegEnd(container: Buffer, from: number): number {
  for (let index = from; index < container.length - 1; index += 1) {
    if (container[index] === 0xff && container[index + 1] === 0xd9) {
      return index;
    }
  }
  return -1;
}
