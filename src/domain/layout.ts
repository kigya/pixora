export type Fold = {
  x: number;
  y: number;
  width: number;
  height: number;
  separating: boolean;
};
export function paneBounds(width: number, height: number, fold: Fold) {
  if (!fold.separating) return { width, height, marginLeft: 0, marginTop: 0 };
  if (fold.height > fold.width) {
    const left = Math.max(0, fold.x),
      right = Math.max(0, width - fold.x - fold.width);
    return {
      width: Math.max(1, Math.max(left, right)),
      height,
      marginLeft: right > left ? fold.x + fold.width : 0,
      marginTop: 0,
    };
  }
  const top = Math.max(0, fold.y),
    bottom = Math.max(0, height - fold.y - fold.height);
  return {
    width,
    height: Math.max(1, Math.max(top, bottom)),
    marginLeft: 0,
    marginTop: bottom > top ? fold.y + fold.height : 0,
  };
}
export function twoColumns(width: number, fontScale: number) {
  return width >= 720 && fontScale < 1.5;
}
