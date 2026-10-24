import React from 'react';
import { AccessibilityInfo, AppState, type AppStateStatus } from 'react-native';
import { act, fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { Onboarding } from '../src/screens/Onboarding';
import { AppProvider } from '../src/application/AppProvider';
import Native, { seed } from '../tests/nativeMock';
import { strings } from '../src/ui/i18n';

const copy = strings.en.onboarding;
const navigation = { reset: jest.fn(), goBack: jest.fn() };
const props = { navigation, route: { params: { replay: false } } } as any;
let appStateListeners: Array<(state: AppStateStatus) => void> = [];
const emitAppState = (state: AppStateStatus) => appStateListeners.forEach(listener => listener(state));

beforeEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
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
  const catVisual = screen.getByTestId('onboarding-visual-cat-active');
  expect(catVisual).toBeOnTheScreen();
  await fireEvent(catVisual, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 500 } } });
  expect(screen.getAllByTestId('onboarding-art-cat')).toHaveLength(2);
  await userEvent.press(screen.getByRole('button', { name: copy.next }));
  expect(screen.getByRole('header', { name: copy.privacyTitle })).toBeOnTheScreen();
  const phoneVisual = screen.getByTestId('onboarding-visual-privacy-active');
  expect(phoneVisual).toBeOnTheScreen();
  await fireEvent(phoneVisual, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 500 } } });
  expect(screen.getByTestId('onboarding-art-phone')).toBeOnTheScreen();
  await userEvent.press(screen.getByRole('button', { name: copy.start }));
  expect(Native.completeOnboarding).toHaveBeenCalledTimes(1);
  expect(navigation.reset).toHaveBeenCalledWith({ index: 0, routes: [{ name: 'Home' }] });
});

test('a horizontal swipe changes the slide without a vertical-scrolling container', async () => {
  await render(<AppProvider><Onboarding {...props} /></AppProvider>);
  await screen.findByRole('header', { name: copy.detailsTitle });
  const pager = screen.getByTestId('onboarding-pager');
  await fireEvent(pager, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 480 } } });
  await fireEvent(pager, 'momentumScrollEnd', {
    nativeEvent: { contentOffset: { x: 360, y: 0 }, layoutMeasurement: { width: 360, height: 480 } },
  });
  expect(screen.getByRole('header', { name: copy.recreateTitle })).toBeOnTheScreen();
  expect(screen.queryByRole('header', { name: copy.detailsTitle })).not.toBeOnTheScreen();
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

test('skip failure stays recoverable; successful retry persists before navigation', async () => {
  Native.completeOnboarding.mockRejectedValueOnce(new Error('disk'));
  await render(<AppProvider><Onboarding {...props} /></AppProvider>);
  await screen.findByRole('header', { name: copy.detailsTitle });
  await act(async () => { emitAppState('active'); });
  await userEvent.press(screen.getByRole('button', { name: copy.skip }));
  expect(await screen.findByTestId('onboarding-error')).toHaveTextContent('Could not complete this action');
  expect(navigation.reset).not.toHaveBeenCalled();
  await userEvent.press(screen.getByRole('button', { name: copy.skip }));
  expect(navigation.reset).toHaveBeenCalledTimes(1);
});

test('replay preserves completed preferences and returns to Settings', async () => {
  seed({}, { onboardingVersion: 1 });
  await render(<AppProvider><Onboarding {...props} route={{ params: { replay: true } }} /></AppProvider>);
  await screen.findByRole('header', { name: copy.detailsTitle });
  await act(async () => { emitAppState('active'); });
  await userEvent.press(screen.getByRole('button', { name: copy.skip }));
  expect(Native.completeOnboarding).not.toHaveBeenCalled();
  expect(navigation.goBack).toHaveBeenCalledTimes(1);
  expect(navigation.reset).not.toHaveBeenCalled();
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
