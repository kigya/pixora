import { paneBounds, twoColumns } from '../src/domain/layout';
const noFold = { x: 0, y: 0, width: 0, height: 0, separating: false };
test('large text keeps controls in one column even on a tablet', () => {
  expect(twoColumns(840, 1)).toBe(true);
  expect(twoColumns(1024, 2)).toBe(false);
  expect(twoColumns(360, 1)).toBe(false);
});
test('vertical hinge reserves the larger unobstructed pane', () => {
  expect(
    paneBounds(1000, 700, {
      x: 400,
      y: 0,
      width: 20,
      height: 700,
      separating: true,
    }),
  ).toEqual({ width: 580, height: 700, marginLeft: 420, marginTop: 0 });
});
test('horizontal hinge moves short landscape content to usable pane', () => {
  expect(
    paneBounds(800, 600, {
      x: 0,
      y: 200,
      width: 800,
      height: 20,
      separating: true,
    }),
  ).toEqual({ width: 800, height: 380, marginLeft: 0, marginTop: 220 });
  expect(paneBounds(360, 720, noFold).width).toBe(360);
});
