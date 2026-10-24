import React, { createRef } from 'react';
import { act, fireEvent, render, userEvent } from '@testing-library/react-native';
import { AccessibilityInfo, Text } from 'react-native';
import { ApertureCard } from '../src/components/kinetik/aperture-card';
import { AuroraVeil } from '../src/components/kinetik/aurora-veil';
import { ConfettiBurst, type ConfettiHandle } from '../src/components/kinetik/confetti-burst';
import { useShaderClock } from '../src/lib/kinetik/hooks/use-shader-clock';
import { useReduceMotion } from '../src/lib/kinetik/hooks/use-reduce-motion';
import { useCountUp, type CountUpOptions } from '../src/lib/kinetik/hooks/use-count-up';
import { KinetikProvider } from '../src/lib/kinetik/tokens/theme';

const mockRSXformCallbacks: Array<(value: never, index: number) => void> = [];
jest.mock('@shopify/react-native-skia', () => {
  const canvasKit = (globalThis as typeof globalThis & { CanvasKit: unknown }).CanvasKit;
  const actual = require('@shopify/react-native-skia/lib/module/mock').Mock(canvasKit);
  return {
    ...actual,
    useTexture: () => ({value: null, get: () => null}),
    useRSXformBuffer: jest.fn((count: number, callback: (value: never, index: number) => void) => {
      mockRSXformCallbacks.push(callback);
      return actual.useRSXformBuffer(count, callback);
    }),
  };
});

type FrameHandle = { active: boolean; frame: (timestamp: number) => void };
type FrameRegistry = typeof globalThis & { __pixoraFrameCallbacks?: Set<FrameHandle> };

const frames = () => [...(((globalThis as FrameRegistry).__pixoraFrameCallbacks) ?? [])];
function newFrameSince(prior: FrameHandle[]): FrameHandle {
  const found = frames().find((frame) => !prior.includes(frame));
  if (!found) throw new Error('Expected a newly registered UI frame callback');
  return found;
}
beforeEach(() => {
  (globalThis as FrameRegistry).__pixoraFrameCallbacks?.clear();
  mockRSXformCallbacks.length = 0;
});
const renderKinetik = (children: React.ReactNode, reduceMotion: 'always' | 'never' = 'never', scheme: 'light' | 'dark' = 'light') =>
  render(<KinetikProvider scheme={scheme} reduceMotion={reduceMotion} haptics={false}>{children}</KinetikProvider>);

function ClockReadout({ running, speed = 1, frameRate = 60, start = 0 }: {
  running: boolean;
  speed?: number;
  frameRate?: 60 | 30;
  start?: number;
}) {
  const time = useShaderClock({ running, speed, frameRate, start });
  return <Text testID="clock-time">{time.get().toFixed(3)}</Text>;
}

function MotionReadout() {
  const reduced = useReduceMotion();
  return <Text>{reduced ? 'Reduced motion' : 'Motion allowed'}</Text>;
}

function CountReadout({ target, options }: { target: number; options?: CountUpOptions }) {
  return <Text testID="count-time">{useCountUp(target, options).toFixed(3)}</Text>;
}

async function advanceFrame(handle: FrameHandle, timestamp: number) {
  await act(async () => handle.frame(timestamp));
}

test('AuroraVeil starts frame work while visible and pauses/resumes with active state', async () => {
  const priorFrames = frames();
  const view = await renderKinetik(<AuroraVeil active intensity={1} speed={3} frameRate={30}><Text>Logo</Text></AuroraVeil>);
  expect(view.getByText('Logo')).toBeOnTheScreen();
  const handle = newFrameSince(priorFrames);
  expect(handle.active).toBe(true);

  await view.rerender(<KinetikProvider scheme="light" reduceMotion="never" haptics={false}><AuroraVeil active={false} intensity={1} speed={3} frameRate={30}><Text>Logo</Text></AuroraVeil></KinetikProvider>);
  expect(handle.active).toBe(false);
  await view.rerender(<KinetikProvider scheme="light" reduceMotion="never" haptics={false}><AuroraVeil active intensity={1} speed={3} frameRate={30}><Text>Logo</Text></AuroraVeil></KinetikProvider>);
  expect(handle.active).toBe(true);
  await view.unmount();
});

test('useShaderClock publishes every other frame at 30 fps, applies speed, and caps long frame gaps', async () => {
  const priorFrames = frames();
  const view = await renderKinetik(<ClockReadout running start={2} speed={2} frameRate={30} />);
  const handle = newFrameSince(priorFrames);
  await advanceFrame(handle, 0);
  await advanceFrame(handle, 16);
  await view.rerender(<KinetikProvider scheme="light" reduceMotion="never" haptics={false}><ClockReadout running start={2} speed={2} frameRate={30} /></KinetikProvider>);
  expect(view.getByTestId('clock-time')).toHaveTextContent('2.064');
  await advanceFrame(handle, 32);
  await view.rerender(<KinetikProvider scheme="light" reduceMotion="never" haptics={false}><ClockReadout running start={2} speed={2} frameRate={30} /></KinetikProvider>);
  expect(view.getByTestId('clock-time')).toHaveTextContent('2.064');
  await advanceFrame(handle, 1032);
  await view.rerender(<KinetikProvider scheme="light" reduceMotion="never" haptics={false}><ClockReadout running start={2} speed={2} frameRate={30} /></KinetikProvider>);
  expect(view.getByTestId('clock-time')).toHaveTextContent('2.296');
  await view.unmount();
});

test('useShaderClock defaults to 60 fps and useReduceMotion follows system changes after a settings read fails', async () => {
  const priorFrames = frames();
  const handle = jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockRejectedValueOnce(new Error('system setting unavailable'));
  let reportChange: ((enabled: boolean) => void) | undefined;
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((event, listener) => {
    if (event === 'reduceMotionChanged') reportChange = listener as (enabled: boolean) => void;
    return { remove: jest.fn() } as never;
  });
  const view = await renderKinetik(<>
    <ClockReadout running start={1} />
    <MotionReadout />
  </>);
  const frame = newFrameSince(priorFrames);
  await advanceFrame(frame, 0);
  await advanceFrame(frame, 16);
  await view.rerender(
    <KinetikProvider scheme="light" reduceMotion="system" haptics={false}>
      <><ClockReadout running start={1} /><MotionReadout /></>
    </KinetikProvider>,
  );
  expect(view.getByTestId('clock-time')).toHaveTextContent('1.032');
  expect(handle).toHaveBeenCalledTimes(1);
  expect(view.getByText('Motion allowed')).toBeOnTheScreen();
  await act(async () => reportChange?.(true));
  expect(view.getByText('Reduced motion')).toBeOnTheScreen();
  await view.unmount();
});

test('useCountUp eases from its default start and ignores a queued frame after unmount', async () => {
  const originalRequest = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  const callbacks = new Map<number, FrameRequestCallback>();
  let nextId = 1;
  globalThis.requestAnimationFrame = callback => {
    const id = nextId++;
    callbacks.set(id, callback);
    return id;
  };
  globalThis.cancelAnimationFrame = id => { if (typeof id === 'number') callbacks.delete(id); };
  const clock = jest.spyOn(Date, 'now').mockReturnValue(1_000);
  try {
    const view = await renderKinetik(<CountReadout target={100} />);
    const first = callbacks.get(1);
    expect(first).toEqual(expect.any(Function));
    clock.mockReturnValue(1_450);
    await act(async () => first?.(450));
    expect(view.getByTestId('count-time')).toHaveTextContent('96.875');
    const queuedAfterUnmount = callbacks.values().next().value as FrameRequestCallback | undefined;
    expect(queuedAfterUnmount).toEqual(expect.any(Function));
    await view.unmount();
    await act(async () => queuedAfterUnmount?.(500));
  } finally {
    clock.mockRestore();
    globalThis.requestAnimationFrame = originalRequest;
    globalThis.cancelAnimationFrame = originalCancel;
  }
});

test('AuroraVeil stops frame work for reduced motion and explicit still effects', async () => {
  const priorFrames = frames();
  const reduced = await renderKinetik(<AuroraVeil><Text>Still with OS preference</Text></AuroraVeil>, 'always');
  const reducedFrame = newFrameSince(priorFrames);
  expect(reducedFrame.active).toBe(false);
  await reduced.unmount();
  const beforeStill = frames();
  const still = await renderKinetik(<AuroraVeil reduceEffects><Text>Still by request</Text></AuroraVeil>);
  expect(newFrameSince(beforeStill)?.active).toBe(false);
  await still.unmount();
});

test('ConfettiBurst imperative bursts start physics, complete, and respect a paused screen', async () => {
  const priorFrames = frames();
  const ref = createRef<ConfettiHandle>();
  const view = await renderKinetik(<ConfettiBurst ref={ref} count={6} haptics={false}><Text>Finished</Text></ConfettiBurst>);
  const frame = newFrameSince(priorFrames);
  expect(frame.active).toBe(false);
  await act(async () => ref.current?.burst({ x: 18, y: 22 }));
  expect(frame.active).toBe(true);
  for (let timestamp = 0; timestamp <= 3_200; timestamp += 50) await advanceFrame(frame, timestamp);
  expect(frame.active).toBe(false);

  await view.rerender(<KinetikProvider scheme="light" reduceMotion="never" haptics={false}><ConfettiBurst ref={ref} count={6} active={false} haptics={false}><Text>Finished</Text></ConfettiBurst></KinetikProvider>);
  await act(async () => ref.current?.burst());
  expect(frame.active).toBe(false);
  await view.unmount();
});

test('ConfettiBurst fires only on a later trigger change and reduced motion suppresses particles', async () => {
  const priorFrames = frames();
  const ref = createRef<ConfettiHandle>();
  const view = await renderKinetik(<ConfettiBurst ref={ref} trigger={0} count={3} haptics={false}><Text>Done</Text></ConfettiBurst>);
  const frame = newFrameSince(priorFrames);
  expect(frame.active).toBe(false);
  await view.rerender(<KinetikProvider scheme="light" reduceMotion="never" haptics={false}><ConfettiBurst ref={ref} trigger={1} count={3} haptics={false}><Text>Done</Text></ConfettiBurst></KinetikProvider>);
  expect(frame.active).toBe(true);
  await view.unmount();

  const beforeReduced = frames();
  const reducedRef = createRef<ConfettiHandle>();
  const reduced = await renderKinetik(<ConfettiBurst ref={reducedRef} count={3} haptics={false}><Text>Static</Text></ConfettiBurst>, 'always');
  const reducedFrame = newFrameSince(beforeReduced);
  await act(async () => reducedRef.current?.burst());
  expect(reducedFrame.active).toBe(false);
  await reduced.unmount();
});

test('ConfettiBurst sends missing, ribbon, dot, and expired particles to the right atlas transforms', async () => {
  const ref = createRef<ConfettiHandle>();
  const view = await renderKinetik(
    <ConfettiBurst ref={ref} count={3} power={0.8} origin={{ x: 0.25, y: 0.75 }} haptics={false}>
      <Text>Particles</Text>
    </ConfettiBurst>,
  );
  const transform = mockRSXformCallbacks.at(-1);
  expect(transform).toEqual(expect.any(Function));

  const missing = { set: jest.fn() };
  transform!(missing as never, 0);
  expect(missing.set).toHaveBeenCalledWith(0, 0, -100, -100);

  await act(async () => ref.current?.burst({ x: 18, y: 22 }));
  const dot = { set: jest.fn() };
  const ribbon = { set: jest.fn() };
  transform!(dot as never, 0);
  transform!(ribbon as never, 1);
  expect(dot.set).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number));
  expect(ribbon.set).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number));
  expect(dot.set.mock.calls[0]).not.toEqual(ribbon.set.mock.calls[0]);

  const frame = newFrameSince([]);
  for (let timestamp = 0; timestamp <= 3_200; timestamp += 50) await advanceFrame(frame, timestamp);
  const expired = { set: jest.fn() };
  transform!(expired as never, 0);
  expect(expired.set).toHaveBeenCalledWith(0, 0, -100, -100);
  await view.unmount();
});

test('ApertureCard supports controlled state, user taps, and its accessible activate action', async () => {
  const onOpenChange = jest.fn();
  const view = await renderKinetik(
    <ApertureCard testID="generated-result" open={false} onOpenChange={onOpenChange} accessibilityLabel="Generated result" haptics={false}>
      <Text>New image</Text>
    </ApertureCard>,
  );
  const card = view.getByTestId('generated-result');
  expect(card.props.accessibilityRole).toBe('button');
  expect(card.props.accessibilityLabel).toBe('Generated result');
  expect(card.props.accessibilityState.expanded).toBe(false);
  await userEvent.press(card);
  expect(onOpenChange).toHaveBeenLastCalledWith(true);
  expect(view.getByTestId('generated-result').props.accessibilityState.expanded).toBe(false);
  await view.rerender(
    <KinetikProvider scheme="light" reduceMotion="never" haptics={false}>
      <ApertureCard testID="generated-result" open onOpenChange={onOpenChange} accessibilityLabel="Generated result" haptics={false}>
        <Text>New image</Text>
      </ApertureCard>
    </KinetikProvider>,
  );
  expect(view.getByTestId('generated-result').props.accessibilityState.expanded).toBe(true);
  await fireEvent(view.getByTestId('generated-result'), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
  expect(onOpenChange).toHaveBeenLastCalledWith(false);
  await view.unmount();
});

test('ApertureCard uncontrolled default and toggleOnPress=false expose correct semantics', async () => {
  const onOpenChange = jest.fn();
  const user = userEvent.setup();
  const view = await renderKinetik(
    <ApertureCard testID="preview-card" defaultOpen accessibilityLabel="Preview card" haptics={false}>
      <Text>Preview contents</Text>
    </ApertureCard>,
  );
  expect(view.getByTestId('preview-card').props.accessibilityState.expanded).toBe(true);
  await user.press(view.getByTestId('preview-card'));
  expect(view.getByTestId('preview-card').props.accessibilityState.expanded).toBe(false);
  await view.unmount();

  const staticView = await renderKinetik(
    <ApertureCard testID="static-card" defaultOpen={false} toggleOnPress={false} onOpenChange={onOpenChange} accessibilityLabel="Static card" haptics={false}>
      <Text>Static child</Text>
    </ApertureCard>,
  );
  const staticCard = staticView.getByTestId('static-card');
  await fireEvent(staticCard, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
  expect(onOpenChange).not.toHaveBeenCalled();
});

test('ApertureCard renders the dark, reduced-motion iris with its maximum supported blade count', async () => {
  const view = await renderKinetik(
    <ApertureCard testID="dark-aperture" defaultOpen accessibilityLabel="Dark result" blades={12} cover={<Text>Preview</Text>} haptics={false}>
      <Text>Generated image</Text>
    </ApertureCard>,
    'always',
    'dark',
  );
  const card = view.getByTestId('dark-aperture');
  expect(card.props.accessibilityState.expanded).toBe(true);
  expect(view.getByText('Generated image')).toBeOnTheScreen();
  expect(view.getByText('Preview')).toBeOnTheScreen();
  await view.unmount();
});
