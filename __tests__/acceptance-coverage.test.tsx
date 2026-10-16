import React from 'react';
import { Platform, Pressable, Text, StyleSheet } from 'react-native';
import {
  act,
  fireEvent,
  render,
  screen,
  userEvent,
} from '@testing-library/react-native';
import { AppProvider } from '../src/application/AppProvider';
import { FeedbackScreen } from '../src/screens/Feedback';
import { LanguageOnboarding } from '../src/screens/LanguageOnboarding';
import { SettingsScreen } from '../src/screens/Settings';
import { TelemetryControls, TelemetryNotice } from '../src/ui/telemetryControls';
import { BackgroundNotice } from '../src/ui/information';
import { useNotificationIntro } from '../src/ui/notificationIntro';
import Native, { seed } from '../tests/nativeMock';
import { strings } from '../src/ui/i18n';

const t = strings.en;
const navigation = { navigate: jest.fn(), goBack: jest.fn() };
const feedbackProps = { navigation, route: { params: undefined } } as any;

function NotificationIntroHarness() {
  const intro = useNotificationIntro();
  return <><Pressable accessibilityRole="button" onPress={() => { void intro.ask(); }}><Text>Ask for notifications</Text></Pressable>{intro.element}</>;
}

beforeEach(() => {
  jest.clearAllMocks();
  seed();
  Native.getFeedbackStatus.mockResolvedValue(true);
  Native.getNotificationStatus.mockResolvedValue(false);
});

test('first-run language selection persists the chosen language and preserves other settings', async () => {
  seed({}, { language: 'en', languageChosen: false, format: 'webp', theme: 'dark' });
  await render(<AppProvider><LanguageOnboarding /></AppProvider>);
  await userEvent.press(screen.getByTestId('language-picker'));
  await userEvent.press(screen.getByTestId('language-es'));
  expect(Native.updateSettings).toHaveBeenCalledWith('es', 'webp', 'dark');
});

test('first-run language selection shows a native save failure and leaves picker usable', async () => {
  Native.updateSettings.mockRejectedValueOnce({ code: 'NO_SPACE' });
  await render(<AppProvider><LanguageOnboarding /></AppProvider>);
  await userEvent.press(screen.getByTestId('language-picker'));
  await userEvent.press(screen.getByTestId('language-es'));
  expect(await screen.findByText(t.errors.INFERENCE_FAILED)).toBeOnTheScreen();
  expect(screen.getByTestId('language-picker')).toBeOnTheScreen();
});

test('first-run language selection exposes the pending native save state', async () => {
  let complete!: (value: any) => void;
  Native.updateSettings.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }) as any);
  await render(<AppProvider><LanguageOnboarding /></AppProvider>);
  await userEvent.press(screen.getByTestId('language-picker'));
  await userEvent.press(screen.getByTestId('language-es'));
  expect(screen.getByTestId('language-es')).toBeDisabled();
  await act(async () => complete({ language: 'es', format: 'png', theme: 'light' }));
});

test('feedback validates optional reply address, uses a centered header, and sends through the app service', async () => {
  await render(<AppProvider><FeedbackScreen {...feedbackProps} /></AppProvider>);
  await screen.findByRole('button', { name: t.send, disabled: false });
  const heading = StyleSheet.flatten(screen.getByText(t.issues).props.style);
  expect(heading.textAlign).toBe('center');
  expect(screen.queryByRole('button', { name: t.issues })).toBeNull();
  await userEvent.type(screen.getByLabelText(t.email), 'invalid');
  await userEvent.type(screen.getByLabelText(t.message), 'Please help with this issue');
  await userEvent.press(screen.getByRole('button', { name: t.send }));
  expect(screen.getByText(t.invalidEmail)).toBeOnTheScreen();
  expect(Native.sendFeedback).not.toHaveBeenCalled();
  await userEvent.clear(screen.getByLabelText(t.email));
  await userEvent.press(screen.getByRole('button', { name: t.send }));
  expect(Native.sendFeedback).toHaveBeenCalledWith(
    '',
    'Please help with this issue',
    0,
    expect.any(String),
  );
  expect(screen.queryByRole('button', { name: t.issues })).toBeNull();
});

test('telemetry controls accept independent off choices as well as opt-ins', async () => {
  seed();
  Native.getTelemetrySettings.mockResolvedValueOnce({
    analytics: true,
    crashes: true,
    noticeSeen: true,
    consentVersion: 2,
  });
  await render(<AppProvider><TelemetryControls /></AppProvider>);
  await fireEvent(screen.getByRole('switch', { name: t.analyticsTitle }), 'valueChange', false);
  expect(Native.updateTelemetrySettings).toHaveBeenLastCalledWith(false, true, true);
  await fireEvent(screen.getByRole('switch', { name: t.crashesTitle }), 'valueChange', false);
  expect(Native.updateTelemetrySettings).toHaveBeenLastCalledWith(false, false, true);
});

test('fresh-install telemetry notice is informational and preserves default-on choices', async () => {
  await render(<AppProvider><TelemetryNotice /></AppProvider>);
  expect(screen.getByText(t.telemetryIntro)).toBeOnTheScreen();
  expect(screen.queryByRole('switch')).toBeNull();
  expect(screen.queryByRole('button', { name: t.notNow })).toBeNull();
  expect(Native.updateTelemetrySettings).not.toHaveBeenCalled();
  await userEvent.press(screen.getByRole('button', { name: t.continue }));
  expect(Native.updateTelemetrySettings).toHaveBeenCalledWith(true, true, true);
});

test('background notice selects iOS interruption guidance and Android service guidance', async () => {
  const original = Object.getOwnPropertyDescriptor(Platform, 'OS');
  try {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    await render(<AppProvider><BackgroundNotice enabled /><BackgroundNotice enabled={false} /></AppProvider>);
    expect(screen.getByText(t.notificationIosBody)).toBeOnTheScreen();
    expect(screen.getByText(t.returnBody)).toBeOnTheScreen();
    expect(screen.queryByText(t.backgroundBody)).toBeNull();
    await screen.unmount();
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    await render(<AppProvider><BackgroundNotice enabled /></AppProvider>);
    expect(screen.getByText(t.backgroundBody)).toBeOnTheScreen();
  } finally {
    if (original) Object.defineProperty(Platform, 'OS', original);
  }
});

test('notification introduction uses truthful platform-specific copy on both systems', async () => {
  const original = Object.getOwnPropertyDescriptor(Platform, 'OS');
  try {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    await render(<AppProvider><NotificationIntroHarness /></AppProvider>);
    await userEvent.press(screen.getByRole('button', { name: 'Ask for notifications' }));
    expect(screen.getByText(t.notificationIntroTitleIos)).toBeOnTheScreen();
    expect(screen.getByText(t.notificationIosBody)).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: t.notificationWithoutContinue }));
    await screen.unmount();

    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    await render(<AppProvider><NotificationIntroHarness /></AppProvider>);
    await userEvent.press(screen.getByRole('button', { name: 'Ask for notifications' }));
    expect(screen.getByText(t.notificationIntroTitle)).toBeOnTheScreen();
    expect(screen.getByText(t.notificationIntroBody)).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: t.notificationWithoutContinue }));
  } finally {
    if (original) Object.defineProperty(Platform, 'OS', original);
  }
});

test('Android settings retain the foreground-service notification explanation', async () => {
  const original = Object.getOwnPropertyDescriptor(Platform, 'OS');
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  try {
    await render(<AppProvider><SettingsScreen {...feedbackProps} /></AppProvider>);
    expect(await screen.findByText(t.notificationBody)).toBeOnTheScreen();
  } finally {
    if (original) Object.defineProperty(Platform, 'OS', original);
  }
});
