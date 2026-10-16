import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
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
