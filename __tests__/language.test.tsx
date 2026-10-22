import React from 'react';
import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { AppProvider } from '../src/application/AppProvider';
import { LanguageScreen } from '../src/screens/Language';
import Native, { seed } from '../tests/nativeMock';
import { strings } from '../src/ui/i18n';

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
