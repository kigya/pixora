import React from 'react';
import { AccessibilityInfo, AppState, BackHandler } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Onboarding } from '../src/screens/Onboarding';
import { AppProvider } from '../src/application/AppProvider';
import Native, { seed } from '../tests/nativeMock';
let mockFocused = true;
jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => mockFocused,
}));
jest.setTimeout(20000);
afterEach(() => {
  jest.useRealTimers();
});
const navigation = { reset: jest.fn(), goBack: jest.fn() };
const props = { navigation, route: { params: { replay: false } } } as any;
beforeEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  jest
    .spyOn(AppState, 'addEventListener')
    .mockReturnValue({ remove: jest.fn() });
  jest
    .spyOn(BackHandler, 'addEventListener')
    .mockReturnValue({ remove: jest.fn() });
  jest
    .spyOn(AccessibilityInfo, 'addEventListener')
    .mockReturnValue({ remove: jest.fn() });
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockResolvedValue(true);
  mockFocused = true;
  seed({}, { onboardingVersion: 0 });
});
test('three user-controlled pages complete durably and reset to Home', async () => {
  await render(
    <AppProvider>
      <Onboarding {...props} />
    </AppProvider>,
  );
  await screen.findByText('More detail');
  await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByText('Made for your image')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('radio', { name: 'Illustrations' }));
  await fireEvent.press(screen.getByRole('radio', { name: 'After' }));
  await fireEvent.press(screen.getByRole('radio', { name: 'Before' }));
  await fireEvent.press(screen.getByRole('radio', { name: 'Compare' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByText('Photos stay on your phone')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Get started' }));
  expect(Native.completeOnboarding).toHaveBeenCalledTimes(1);
  expect(navigation.reset).toHaveBeenCalledWith({
    index: 0,
    routes: [{ name: 'Home' }],
  });
});
test('skip failure stays recoverable; successful retry persists before navigation', async () => {
  Native.completeOnboarding.mockRejectedValueOnce(new Error('disk'));
  await render(
    <AppProvider>
      <Onboarding {...props} />
    </AppProvider>,
  );
  await screen.findByText('More detail');
  await fireEvent.press(screen.getByRole('button', { name: 'Skip' }));
  expect(
    await screen.findByText('Could not complete this action'),
  ).toBeOnTheScreen();
  expect(navigation.reset).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Skip' }));
  expect(navigation.reset).toHaveBeenCalledTimes(1);
});
test('replay preserves completed preferences and supports previous pages', async () => {
  seed({}, { onboardingVersion: 1 });
  await render(
    <AppProvider>
      <Onboarding {...props} route={{ params: { replay: true } }} />
    </AppProvider>,
  );
  await screen.findByText('More detail');
  await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  expect(screen.getByText('More detail')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Skip' }));
  expect(Native.completeOnboarding).not.toHaveBeenCalled();
});
test('motion responds to accessibility and foreground changes and cleans subscriptions', async () => {
  const states: Array<(s: any) => void> = [],
    motions: Array<(v: boolean) => void> = [],
    backs: Array<() => boolean> = [];
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockResolvedValue(false);
  const remove = jest.fn();
  const state = jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_event, fn) => {
      states.push(fn);
      return { remove };
    });
  const motion = jest
    .spyOn(AccessibilityInfo, 'addEventListener')
    .mockImplementation((_event, fn: any) => {
      motions.push(fn);
      return { remove };
    });
  const back = jest
    .spyOn(BackHandler, 'addEventListener')
    .mockImplementation((_event, fn: any) => {
      backs.push(fn);
      return { remove };
    });
  await render(
    <AppProvider>
      <Onboarding {...props} />
    </AppProvider>,
  );
  await screen.findByText('More detail');
  await act(() => {
    states.forEach(fn => fn('active'));
    motions.forEach(fn => fn(false));
  });
  expect(backs[backs.length - 1]()).toBe(false);
  await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
  await act(() => {
    backs[backs.length - 1]();
  });
  expect(screen.getByText('More detail')).toBeOnTheScreen();
  await act(() => {
    states.forEach(fn => fn('background'));
    motions.forEach(fn => fn(true));
  });
  await screen.unmount();
  expect(remove).toHaveBeenCalled();
  state.mockRestore();
  motion.mockRestore();
  back.mockRestore();
});

test('the mode demo runs once without advancing the page and stops in background', async () => {
  jest.useFakeTimers();
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockResolvedValue(false);
  const changes: Array<(state: any) => void> = [];
  const state = jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_name, fn) => {
      changes.push(fn);
      return { remove: jest.fn() };
    });
  await render(
    <AppProvider>
      <Onboarding {...props} />
    </AppProvider>,
  );
  await screen.findByText('More detail');
  await act(() => changes.forEach(fn => fn('active')));
  await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
  await act(() => jest.advanceTimersByTime(2600));
  expect(screen.getByRole('radio', { name: 'Illustrations' })).toBeSelected();
  await act(() => jest.advanceTimersByTime(2600));
  expect(screen.getByRole('radio', { name: 'Pixel Art' })).toBeSelected();
  expect(screen.getByText('Made for your image')).toBeOnTheScreen();
  await act(() => changes.forEach(fn => fn('background')));
  await screen.unmount();
  state.mockRestore();
  jest.useRealTimers();
});

test('replay back navigation and an unfocused back handler preserve the host screen', async () => {
  let back: () => boolean = () => false;
  const spy = jest
    .spyOn(BackHandler, 'addEventListener')
    .mockImplementation((_name, fn: any) => {
      back = fn;
      return { remove: jest.fn() };
    });
  await render(
    <AppProvider>
      <Onboarding {...props} route={{ params: { replay: true } }} />
    </AppProvider>,
  );
  await screen.findByText('More detail');
  expect(back()).toBe(true);
  expect(navigation.goBack).toHaveBeenCalledTimes(1);
  mockFocused = false;
  await screen.rerender(
    <AppProvider>
      <Onboarding {...props} route={{ params: { replay: true } }} />
    </AppProvider>,
  );
  expect(back()).toBe(false);
  await screen.unmount();
  spy.mockRestore();
});

test('a late or failed accessibility read is contained after unmount', async () => {
  let resolve!: (value: boolean) => void;
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockImplementationOnce(
    () =>
      new Promise<boolean>(done => {
        resolve = done;
      }),
  );
  await render(
    <AppProvider>
      <Onboarding {...props} />
    </AppProvider>,
  );
  await screen.findByText('More detail');
  await screen.unmount();
  await act(() => resolve(false));
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockRejectedValueOnce(new Error('unavailable'));
  await render(
    <AppProvider>
      <Onboarding {...props} />
    </AppProvider>,
  );
  expect(await screen.findByRole('button', { name: 'Skip' })).toBeEnabled();
});

test('native drag boundaries are clamped and duplicate completion dispatch is serialized', async () => {
  const animation = jest.requireMock('react-native-reanimated');
  const original = animation.useSharedValue;
  const spy = jest
    .spyOn(animation, 'useSharedValue')
    .mockImplementation((value: unknown) => original(value === 1 ? 0 : value));
  let resolve!: (value: any) => void;
  Native.completeOnboarding.mockImplementationOnce(
    () =>
      new Promise(done => {
        resolve = done;
      }),
  );
  await render(
    <AppProvider>
      <Onboarding {...props} />
    </AppProvider>,
  );
  await screen.findByText('More detail');
  const gesture = screen.getByTestId('gesture-boundary').props.gesture;
  await act(() => {
    gesture.handlers.onUpdate({ x: -100 });
    gesture.handlers.onUpdate({ x: 10000 });
  });
  const press = screen.getByRole('button', { name: 'Skip' }).props.onClick;
  const click = { nativeEvent: {}, currentTarget: 1, target: 1 };
  await act(() => {
    press(click);
    press(click);
  });
  expect(Native.completeOnboarding).toHaveBeenCalledTimes(1);
  await act(async () =>
    resolve({ ...(await Native.getSettings()), onboardingVersion: 1 }),
  );
  expect(navigation.reset).toHaveBeenCalledTimes(1);
  spy.mockRestore();
});
