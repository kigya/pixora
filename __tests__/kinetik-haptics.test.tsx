import React from 'react';
import { fireEvent, render, screen, act } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { Pressable, Text } from 'react-native';
import { useHaptic } from '../src/lib/kinetik/hooks/use-haptic';
import { KinetikProvider } from '../src/lib/kinetik/tokens/theme';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

beforeEach(() => jest.clearAllMocks());

function HapticActions() {
  const haptic = useHaptic();
  return <Pressable accessibilityRole="button" accessibilityLabel="Play feedback" onPress={() => {
    haptic('tick');
    haptic('tap');
    haptic('thud');
    haptic('success');
    haptic('warning');
    haptic('error');
  }}><Text>Play</Text></Pressable>;
}

test('supported haptics map each interaction kind to the matching platform effect', async () => {
  await render(<KinetikProvider scheme="light"><HapticActions /></KinetikProvider>);
  await fireEvent.press(screen.getByRole('button', { name: 'Play feedback' }));
  expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
  expect(Haptics.impactAsync).toHaveBeenNthCalledWith(1, Haptics.ImpactFeedbackStyle.Light);
  expect(Haptics.impactAsync).toHaveBeenNthCalledWith(2, Haptics.ImpactFeedbackStyle.Medium);
  expect(Haptics.notificationAsync).toHaveBeenNthCalledWith(1, Haptics.NotificationFeedbackType.Success);
  expect(Haptics.notificationAsync).toHaveBeenNthCalledWith(2, Haptics.NotificationFeedbackType.Warning);
  expect(Haptics.notificationAsync).toHaveBeenNthCalledWith(3, Haptics.NotificationFeedbackType.Error);
});

test('provider and per-hook opt-outs are no-ops, and an unavailable actuator never escapes', async () => {
  function Probe({ enabled }: { enabled: boolean }) {
    const haptic = useHaptic(enabled);
    return <Pressable accessibilityRole="button" accessibilityLabel="Tap" onPress={() => haptic('tap')}><Text>Tap</Text></Pressable>;
  }
  const view = await render(<KinetikProvider scheme="light" haptics={false}><Probe enabled /></KinetikProvider>);
  await fireEvent.press(screen.getByRole('button', { name: 'Tap' }));
  expect(Haptics.impactAsync).not.toHaveBeenCalled();

  await view.rerender(<KinetikProvider scheme="light"><Probe enabled={false} /></KinetikProvider>);
  await fireEvent.press(screen.getByRole('button', { name: 'Tap' }));
  expect(Haptics.impactAsync).not.toHaveBeenCalled();

  (Haptics.impactAsync as jest.Mock).mockRejectedValueOnce(new Error('no actuator'));
  await view.rerender(<KinetikProvider scheme="light"><Probe enabled /></KinetikProvider>);
  await act(async () => { await fireEvent.press(screen.getByRole('button', { name: 'Tap' })); await Promise.resolve(); });
  expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
});
