import type { ImageInfo } from '../specs/NativeUpscale';
export type Resolution = 'prepared' | 'original';
export function originalSizeAllowed(
  width: number,
  height: number,
  scale: number,
) {
  return (
    Number.isInteger(width) &&
    Number.isInteger(height) &&
    width > 0 &&
    height > 0 &&
    (scale === 2 || scale === 4) &&
    width * scale <= 16384 &&
    height * scale <= 16384 &&
    width * height * scale * scale <= 64_000_000
  );
}
export function processingDimensions(image: ImageInfo, resolution: Resolution) {
  return resolution === 'original'
    ? { width: image.width, height: image.height }
    : { width: image.workWidth, height: image.workHeight };
}
