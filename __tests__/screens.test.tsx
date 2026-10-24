import React from 'react';
import { act, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { AppProvider } from '../src/application/AppProvider';
import { Home } from '../src/screens/Home';
import { SettingsScreen } from '../src/screens/Settings';
import Native, { seed } from '../tests/nativeMock';
const navigation = { navigate: jest.fn(), goBack: jest.fn() };
const props = { navigation, route: { key: 'test', name: 'Home' } } as any;
beforeEach(() => {
  jest.clearAllMocks();
  seed();
});
test('home introduces product once and picking can be cancelled', async () => {
  await render(
    <AppProvider>
      <Home {...props} />
    </AppProvider>,
  );
  const choose = await screen.findByRole('button', { name: 'Choose image' });
  await userEvent.press(choose);
  expect(Native.pickImage).toHaveBeenCalledTimes(1);
  expect(
    screen.getByRole('button', { name: 'Choose image' }),
  ).toBeOnTheScreen();
});
test('settings shows current preferences and privacy', async () => {
  await render(
    <AppProvider>
      <SettingsScreen {...props} />
    </AppProvider>,
  );
  await userEvent.press(await screen.findByRole('button', { name: 'Privacy' }));
  expect(screen.getByText(/Photos and AI processing/)).toBeOnTheScreen();
});

test('a storage-usage read failure does not hide Settings actions or preferences', async () => {
  Native.getStorageUsage.mockRejectedValueOnce(new Error('storage unavailable'));
  await render(
    <AppProvider>
      <SettingsScreen {...props} />
    </AppProvider>,
  );

  expect(await screen.findByText(/Settings/)).toBeOnTheScreen();
  expect(screen.getByText(/Theme/)).toBeOnTheScreen();
  expect(Native.getStorageUsage).toHaveBeenCalled();
});

test('Settings rate-limits duplicate Recreate-state storage refreshes but refreshes after the interval', async () => {
  const clock = jest.spyOn(Date, 'now');
  await render(
    <AppProvider>
      <SettingsScreen {...props} />
    </AppProvider>,
  );
  expect(await screen.findByText(/Settings/)).toBeOnTheScreen();
  await waitFor(() => expect(Native.getStorageUsage).toHaveBeenCalledTimes(1));
  const onModelChanged = Native.onRecreateModelChanged.mock.calls.at(-1)?.[0];
  expect(onModelChanged).toEqual(expect.any(Function));
  const readyModel = { state: 'ready', downloadedBytes: 0, totalBytes: 100, installedBytes: 100, error: '' } as const;

  clock.mockReturnValue(10_000);
  await act(async () => onModelChanged?.(readyModel));
  await waitFor(() => expect(Native.getStorageUsage).toHaveBeenCalledTimes(2));
  clock.mockReturnValue(10_500);
  await act(async () => onModelChanged?.(readyModel));
  expect(Native.getStorageUsage).toHaveBeenCalledTimes(2);
  clock.mockReturnValue(11_001);
  await act(async () => onModelChanged?.(readyModel));
  await waitFor(() => expect(Native.getStorageUsage).toHaveBeenCalledTimes(3));
  clock.mockRestore();
});
