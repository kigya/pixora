import React from 'react';
import { AppState } from 'react-native';
import { act, fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { AppProvider } from '../src/application/AppProvider';
import { LanguageScreen } from '../src/screens/Language';
import { SettingsScreen } from '../src/screens/Settings';
import Native, { seed } from '../tests/nativeMock';
import { strings } from '../src/ui/i18n';
import { ThemeSwitch } from '../src/components/kinetik/theme-switch';
import { KinetikProvider } from '../src/lib/kinetik/tokens/theme';

const copy = strings.en;
const navigation = { navigate: jest.fn(), goBack: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  seed({}, { language: 'en' });
});

test('language picker searches local names and saves the selected locale', async () => {
  await render(
    <AppProvider>
      <LanguageScreen navigation={navigation as any} route={{} as any} />
    </AppProvider>,
  );
  await userEvent.press(screen.getByRole('button', { name: `${copy.language}, English` }));
  const search = screen.getByPlaceholderText(copy.recreate.languageSearch);
  await userEvent.type(search, '\u0420\u0443\u0441\u0441\u043a\u0438\u0439');
  await fireEvent.press(screen.getByRole('menuitem', { name: '\u0420\u0443\u0441\u0441\u043a\u0438\u0439' }));
  expect(Native.updateSettings).toHaveBeenCalledWith('ru', 'png', 'light');
  expect(navigation.goBack).toHaveBeenCalledTimes(1);
});

test('failed locale persistence keeps the selector open and shows an error', async () => {
  (Native.updateSettings as jest.Mock).mockRejectedValueOnce(new Error('storage unavailable'));
  await render(
    <AppProvider>
      <LanguageScreen navigation={navigation as any} route={{} as any} />
    </AppProvider>,
  );

  await userEvent.press(screen.getByRole('button', { name: `${copy.language}, English` }));
  await userEvent.type(screen.getByPlaceholderText(copy.recreate.languageSearch), '\u0420\u0443\u0441\u0441\u043a\u0438\u0439');
  await userEvent.press(screen.getByRole('menuitem', { name: '\u0420\u0443\u0441\u0441\u043a\u0438\u0439' }));

  expect(await screen.findByText(copy.errors.INFERENCE_FAILED)).toBeOnTheScreen();
  expect(navigation.goBack).not.toHaveBeenCalled();
  await userEvent.press(screen.getByRole('button', { name: copy.back }));
  expect(navigation.goBack).toHaveBeenCalledTimes(1);
});

test('settings keeps the searchable language selector inline and persists the choice', async () => {
  const view = await render(
    <AppProvider>
      <SettingsScreen navigation={navigation as any} route={{} as any} />
    </AppProvider>,
  );

  // Settings is a scrollable screen around MorphSelect's own modal/list. Its
  // ancestor must not consume the first option tap to dismiss the IME.
  expect(view.container.queryAll(node => node.props.keyboardShouldPersistTaps === 'always')).toHaveLength(1);
  await userEvent.press(await screen.findByRole('button', { name: `${copy.language}, English` }));
  await userEvent.type(screen.getByPlaceholderText(copy.recreate.languageSearch), 'ar');
  await userEvent.press(screen.getByRole('menuitem', { name: '\u0627\u0644\u0639\u0631\u0628\u064a\u0629' }));

  expect(Native.updateSettings).toHaveBeenCalledTimes(1);
  expect(Native.updateSettings).toHaveBeenCalledWith('ar', 'png', 'light');
  expect(navigation.navigate).not.toHaveBeenCalledWith('Language');
  expect(await screen.findByRole('button', { name: '\u0627\u0644\u0644\u063a\u0629, \u0627\u0644\u0639\u0631\u0628\u064a\u0629' })).toBeOnTheScreen();
});

test('theme control exposes direct system, light, and dark choices', async () => {
  seed({}, { language: 'en', theme: 'system' });
  await render(
    <AppProvider>
      <SettingsScreen navigation={navigation as any} route={{} as any} />
    </AppProvider>,
  );

  const group = await screen.findByRole('radiogroup', { name: copy.theme });
  expect(group).toBeOnTheScreen();
  const system = screen.getByRole('radio', { name: copy.system });
  const light = screen.getByRole('radio', { name: copy.light });
  const dark = screen.getByRole('radio', { name: copy.dark });
  expect(system).toBeChecked();
  await userEvent.press(dark);
  expect(dark).toBeChecked();
  await userEvent.press(light);
  expect(light).toBeChecked();
  await userEvent.press(system);
  expect(system).toBeChecked();
});

test('telemetry switches keep one visible label and a readable switch target', async () => {
  await render(
    <AppProvider>
      <SettingsScreen navigation={navigation as any} route={{} as any} />
    </AppProvider>,
  );

  expect(screen.getAllByText(copy.analyticsTitle)).toHaveLength(1);
  expect(screen.getByRole('switch', { name: copy.analyticsTitle })).toBeOnTheScreen();
  expect(screen.getAllByText(copy.crashesTitle)).toHaveLength(1);
  expect(screen.getByRole('switch', { name: copy.crashesTitle })).toBeOnTheScreen();
});

test('storage breakdown reports every app category and keeps the cache policy independent', async () => {
  await render(
    <AppProvider>
      <SettingsScreen navigation={navigation as any} route={{} as any} />
    </AppProvider>,
  );

  expect(await screen.findByRole('progressbar', { name: copy.storageUsage.total })).toBeOnTheScreen();
  for (const key of ['sessions', 'temporary', 'model', 'cache', 'other'] as const) {
    expect(screen.getByText(copy.storageUsage[key])).toBeOnTheScreen();
  }
  expect(screen.getByText(copy.cacheUnlimited)).toBeOnTheScreen();
  expect(screen.getByText(new RegExp(`${copy.storageUsage.free}:`))).toBeOnTheScreen();
});

test('storage refreshes after returning to the foreground', async () => {
  const listeners: Array<(state: string) => void> = [];
  const appStateSpy = jest.spyOn(AppState, 'addEventListener').mockImplementation((event, listener) => {
    if (event === 'change') listeners.push(listener as (state: string) => void);
    return { remove: jest.fn() } as any;
  });
  try {
    await render(
      <AppProvider>
        <SettingsScreen navigation={navigation as any} route={{} as any} />
      </AppProvider>,
    );
    const calls = (Native.getStorageUsage as jest.Mock).mock.calls.length;
    await act(async () => {
      listeners.forEach(listener => listener('background'));
      listeners.forEach(listener => listener('active'));
    });
    // Foregrounding settings performs one fresh byte-count query.
    expect(Native.getStorageUsage).toHaveBeenCalledTimes(calls + 1);
  } finally {
    appStateSpy.mockRestore();
  }
});

test('unlabelled theme control names its radio group and reflects system appearance', async () => {
  const onValueChange = jest.fn();
  await render(
    <KinetikProvider scheme="light" reduceMotion="always" haptics={false}>
      <ThemeSwitch value="system" onValueChange={onValueChange} systemDark />
    </KinetikProvider>,
  );

  expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeOnTheScreen();
  expect(screen.getByRole('radio', { name: 'System' })).toBeChecked();
  await userEvent.press(screen.getByRole('radio', { name: 'Dark' }));
  expect(onValueChange).toHaveBeenCalledWith('dark');
});
