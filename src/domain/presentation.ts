/** Fit the actual image bounds inside the available preview. Never crop or letterbox. */
export function previewSize(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
) {
  const factor = Math.min(
    maxWidth / Math.max(1, width),
    maxHeight / Math.max(1, height),
  );
  return {
    width: Math.max(1, width * factor),
    height: Math.max(1, height * factor),
  };
}
export function needsAspectWarning(width: number, height: number) {
  return Math.max(width, height) / Math.max(1, Math.min(width, height)) >= 12;
}
export const cacheLimits = [0, 10, 50, 200, -1] as const;
export function validEmail(value: string) {
  return (
    value.length <= 254 &&
    /^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(value.trim())
  );
}
export function validMessage(value: string) {
  return value.trim().length >= 5 && value.length <= 4000;
}
