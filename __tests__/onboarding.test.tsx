import React from 'react';
import { AccessibilityInfo, AppState, type AppStateStatus } from 'react-native';
import { act, fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { Onboarding } from '../src/screens/Onboarding';
import { AppProvider } from '../src/application/AppProvider';
import Native, { seed } from '../tests/nativeMock';
import { strings } from '../src/ui/i18n';

const mockRouterReplace = jest.fn();
const mockRouterBack = jest.fn();
const mockRouterCanGoBack = jest.fn(() => true);
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  useRouter: () => ({ replace: mockRouterReplace, back: mockRouterBack, canGoBack: mockRouterCanGoBack }),
}));

const copy = strings.en.onboarding;
const navigation = { reset: jest.fn(), goBack: jest.fn() };
const props = { navigation, route: { params: { replay: false } } } as any;
let appStateListeners: Array<(state: AppStateStatus) => void> = [];
const emitAppState = (state: AppStateStatus) => appStateListeners.forEach(listener => listener(state));

beforeEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  mockRouterReplace.mockReset();
  mockRouterBack.mockReset();
  mockRouterCanGoBack.mockReset();
  mockRouterCanGoBack.mockReturnValue(true);
  appStateListeners = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    appStateListeners.push(listener);
    return { remove: jest.fn() } as any;
  });
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove: jest.fn() } as any);
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  seed({}, { onboardingVersion: 0 });
});

test('three passive pages use horizontal paging, a separate indicator and fixed actions', async () => {
  await render(<AppProvider><Onboarding {...props} /></AppProvider>);
  await screen.findByRole('header', { name: copy.detailsTitle });
  await act(async () => { emitAppState('active'); });
  const pager = screen.getByTestId('onboarding-pager');
  expect(pager).toHaveProp('horizontal', true);
  expect(pager).toHaveProp('pagingEnabled', true);
  expect(pager).toHaveProp('showsVerticalScrollIndicator', false);
  expect(screen.getByTestId('onboarding-progress')).toBeOnTheScreen();
  const bridgeVisual = screen.getByTestId('onboarding-visual-bridge-active');
  expect(bridgeVisual).toHaveProp('pointerEvents', 'none');
  await fireEvent(bridgeVisual, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 500 } } });
  expect(screen.getAllByTestId('onboarding-art-bridge')).toHaveLength(2);
  expect(screen.queryByText(copy.detailBody)).not.toBeOnTheScreen();

  await userEvent.press(screen.getByRole('button', { name: copy.next }));
  expect(screen.getByRole('header', { name: copy.recreateTitle })).toBeOnTheScreen();
  const mountainVisual = screen.getByTestId('onboarding-visual-mountains-active');
  expect(mountainVisual).toBeOnTheScreen();
  await fireEvent(mountainVisual, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 500 } } });
  expect(screen.getAllByTestId('onboarding-art-mountains')).toHaveLength(2);
  await userEvent.press(screen.getByRole('button', { name: copy.next }));
  expect(screen.getByRole('header', { name: copy.privacyTitle })).toBeOnTheScreen();
  const phoneVisual = screen.getByTestId('onboarding-visual-privacy-active');
  expect(phoneVisual).toBeOnTheScreen();
  await fireEvent(phoneVisual, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 500 } } });
  expect(screen.getByTestId('onboarding-art-phone')).toBeOnTheScreen();
  await userEvent.press(screen.getByRole('button', { name: copy.start }));
  expect(Native.completeOnboarding).toHaveBeenCalledTimes(1);
  expect(mockRouterReplace).toHaveBeenCalledWith('/Home');
});

test('a horizontal swipe changes the slide without a vertical-scrolling container', async () => {
  await render(<AppProvider><Onboarding {...props} /></AppProvider>);
  await screen.findByRole('header', { name: copy.detailsTitle });
  const pager = screen.getByTestId('onboarding-pager');
  await fireEvent(pager, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 480 } } });
  expect(pager.props.onScroll).toEqual(expect.any(Function));
  await act(async () => pager.props.onScroll({ nativeEvent: { contentOffset: { x: 360, y: 0 } } }));
  await fireEvent(pager, 'momentumScrollEnd', {
    nativeEvent: { contentOffset: { x: 360, y: 0 }, layoutMeasurement: { width: 360, height: 480 } },
  });
  expect(screen.getByRole('header', { name: copy.recreateTitle })).toBeOnTheScreen();
  expect(screen.queryByRole('header', { name: copy.detailsTitle })).not.toBeOnTheScreen();
  expect(screen.getByTestId('onboarding-progress')).toHaveAccessibleName(
    copy.step.replace('{current}', '2').replace('{total}', '3'),
  );
});

test('background pauses scrolling and makes every illustration inactive until foreground', async () => {
  await render(<AppProvider><Onboarding {...props} /></AppProvider>);
  await screen.findByRole('header', { name: copy.detailsTitle });
  await act(async () => { emitAppState('active'); });
  expect(appStateListeners.length).toBeGreaterThan(0);
  await act(async () => { emitAppState('background'); });
  await waitFor(() => expect(screen.getByTestId('onboarding-pager')).toHaveProp('scrollEnabled', false));
  await act(async () => { emitAppState('active'); });
  expect(screen.getByTestId('onboarding-pager')).toHaveProp('scrollEnabled', true);
  expect(screen.getByTestId('onboarding-visual-bridge-active')).toBeOnTheScreen();
});

test('motion-enabled scenes activate only for the current page and pause while backgrounded', async () => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  await render(<AppProvider><Onboarding {...props} /></AppProvider>);
  await screen.findByRole('header', { name: copy.detailsTitle });
  const pager = screen.getByTestId('onboarding-pager');
  await fireEvent(pager, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 480 } } });

  await fireEvent(pager, 'momentumScrollEnd', {
    nativeEvent: { contentOffset: { x: 360, y: 0 }, layoutMeasurement: { width: 360, height: 480 } },
  });
  expect(screen.getByTestId('onboarding-visual-bridge-inactive', { includeHiddenElements: true })).toBeOnTheScreen();
  expect(screen.getByTestId('onboarding-visual-mountains-active')).toBeOnTheScreen();

  await fireEvent(pager, 'momentumScrollEnd', {
    nativeEvent: { contentOffset: { x: 720, y: 0 }, layoutMeasurement: { width: 360, height: 480 } },
  });
  expect(screen.getByTestId('onboarding-visual-privacy-active')).toBeOnTheScreen();
  expect(screen.getByTestId('onboarding-art-phone')).toBeOnTheScreen();
  await act(async () => { emitAppState('background'); });
  expect(screen.getByTestId('onboarding-visual-privacy-inactive')).toBeOnTheScreen();
});

test('skip failure stays recoverable; successful retry persists before navigation', async () => {
  Native.completeOnboarding.mockRejectedValueOnce(new Error('disk'));
  await render(<AppProvider><Onboarding {...props} /></AppProvider>);
  await screen.findByRole('header', { name: copy.detailsTitle });
  await act(async () => { emitAppState('active'); });
  await userEvent.press(screen.getByRole('button', { name: copy.skip }));
  expect(await screen.findByTestId('onboarding-error')).toHaveTextContent('Could not complete this action');
  expect(mockRouterReplace).not.toHaveBeenCalled();
  await userEvent.press(screen.getByRole('button', { name: copy.skip }));
  expect(mockRouterReplace).toHaveBeenCalledTimes(1);
});

test('rapid duplicate finish taps persist onboarding only once while storage is pending', async () => {
  let release!: (value: Awaited<ReturnType<typeof Native.completeOnboarding>>) => void;
  const completion = new Promise<Awaited<ReturnType<typeof Native.completeOnboarding>>>(resolve => { release = resolve; });
  Native.completeOnboarding.mockReturnValueOnce(completion);
  await render(<AppProvider><Onboarding {...props} /></AppProvider>);
  await screen.findByRole('header', { name: copy.detailsTitle });

  const skip = screen.getByRole('button', { name: copy.skip });
  await act(async () => {
    fireEvent(skip, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    fireEvent(skip, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
  });
  expect(Native.completeOnboarding).toHaveBeenCalledTimes(1);
  expect(mockRouterReplace).not.toHaveBeenCalled();

  release(await Native.getSettings());
  await waitFor(() => expect(mockRouterReplace).toHaveBeenCalledWith('/Home'));
});

test('replay preserves completed preferences and returns to Settings', async () => {
  seed({}, { onboardingVersion: 1 });
  await render(<AppProvider><Onboarding {...props} route={{ params: { replay: true } }} /></AppProvider>);
  await screen.findByRole('header', { name: copy.detailsTitle });
  await act(async () => { emitAppState('active'); });
  await userEvent.press(screen.getByRole('button', { name: copy.skip }));
  expect(Native.completeOnboarding).not.toHaveBeenCalled();
  expect(mockRouterBack).toHaveBeenCalledTimes(1);
  expect(mockRouterReplace).not.toHaveBeenCalled();
});

test.each([true, 'true'])('Expo Router replay param %s returns to Settings without clearing preferences', async replay => {
  seed({}, { onboardingVersion: 1 });
  await render(<AppProvider><Onboarding {...props} route={{ params: { replay } }} /></AppProvider>);
  await screen.findByRole('header', { name: copy.detailsTitle });
  await act(async () => { emitAppState('active'); });
  await userEvent.press(screen.getByRole('button', { name: copy.skip }));
  expect(Native.completeOnboarding).not.toHaveBeenCalled();
  expect(mockRouterBack).toHaveBeenCalledTimes(1);
  expect(mockRouterReplace).not.toHaveBeenCalled();
});

test('replay falls back to Settings when there is no router history', async () => {
  seed({}, { onboardingVersion: 1 });
  mockRouterCanGoBack.mockReturnValue(false);
  await render(<AppProvider><Onboarding {...props} route={{ params: { replay: 'true' } }} /></AppProvider>);
  await screen.findByRole('header', { name: copy.detailsTitle });
  await act(async () => { emitAppState('active'); });
  await userEvent.press(screen.getByRole('button', { name: copy.skip }));
  expect(mockRouterBack).not.toHaveBeenCalled();
  expect(mockRouterReplace).toHaveBeenCalledWith('/Settings');
});

test('reduced motion keeps a static demonstration and never advances automatically', async () => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  jest.useFakeTimers();
  await render(<AppProvider><Onboarding {...props} /></AppProvider>);
  await act(async () => { emitAppState('active'); });
  expect(screen.getByRole('header', { name: copy.detailsTitle })).toBeOnTheScreen();
  await act(async () => { jest.advanceTimersByTime(5000); });
  expect(screen.getByRole('header', { name: copy.detailsTitle })).toBeOnTheScreen();
  expect(screen.queryByRole('header', { name: copy.recreateTitle })).not.toBeOnTheScreen();
  jest.useRealTimers();
});
