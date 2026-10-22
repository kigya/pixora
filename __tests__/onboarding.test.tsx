import React from 'react';
import { AccessibilityInfo, AppState } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Onboarding } from '../src/screens/Onboarding';
import { AppProvider } from '../src/application/AppProvider';
import Native, { seed } from '../tests/nativeMock';
import { strings } from '../src/ui/i18n';

const copy = strings.en.onboarding;
const navigation = { reset: jest.fn(), goBack: jest.fn() };
const props = { navigation, route: { params: { replay: false } } } as any;

beforeEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() });
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove: jest.fn() });
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  seed({}, { onboardingVersion: 0 });
});

test('three horizontal, user-controlled pages complete durably and reset to Home', async () => {
  await render(<AppProvider><Onboarding {...props} /></AppProvider>);
  await screen.findByText(copy.detailsTitle);
  const pager = screen.getByTestId('onboarding-pager');
  expect(pager).toHaveProp('horizontal', true);
  expect(pager).toHaveProp('pagingEnabled', true);
  expect(screen.queryByText(copy.detailBody)).not.toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: copy.next }));
  expect(screen.getByText(copy.recreateTitle)).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: copy.next }));
  expect(screen.getByText(copy.privacyTitle)).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: copy.start }));
  expect(Native.completeOnboarding).toHaveBeenCalledTimes(1);
  expect(navigation.reset).toHaveBeenCalledWith({ index: 0, routes: [{ name: 'Home' }] });
});

test('skip failure stays recoverable; successful retry persists before navigation', async () => {
  Native.completeOnboarding.mockRejectedValueOnce(new Error('disk'));
  await render(<AppProvider><Onboarding {...props} /></AppProvider>);
  await screen.findByText(copy.detailsTitle);
  await fireEvent.press(screen.getByRole('button', { name: copy.skip }));
  expect(await screen.findByText('Could not complete this action')).toBeOnTheScreen();
  expect(navigation.reset).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: copy.skip }));
  expect(navigation.reset).toHaveBeenCalledTimes(1);
});

test('replay preserves completed preferences and returns to Settings', async () => {
  seed({}, { onboardingVersion: 1 });
  await render(<AppProvider><Onboarding {...props} route={{ params: { replay: true } }} /></AppProvider>);
  await screen.findByText(copy.detailsTitle);
  await fireEvent.press(screen.getByRole('button', { name: copy.skip }));
  expect(Native.completeOnboarding).not.toHaveBeenCalled();
  expect(navigation.goBack).toHaveBeenCalledTimes(1);
  expect(navigation.reset).not.toHaveBeenCalled();
});

test('reduce motion keeps the slide demo static and does not auto-advance', async () => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  await render(<AppProvider><Onboarding {...props} /></AppProvider>);
  await screen.findByText(copy.detailsTitle);
  await new Promise(resolve => setTimeout(resolve, 1400));
  expect(screen.getByText(copy.detailsTitle)).toBeOnTheScreen();
  expect(screen.queryByText(copy.recreateTitle)).not.toBeOnTheScreen();
});
