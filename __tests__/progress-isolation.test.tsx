import React from 'react';
import { render, act, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { AppProvider, useApp } from '../src/application/AppProvider';
import { emitSession, seed } from '../tests/nativeMock';

test('measure settings subscription during progress delivery', async () => {
  seed({ state: 'RUNNING', startedAt: Date.now() });
  let renders = 0;
  function SettingsConsumer() { const { t } = useApp(); renders++; return <Text>{t.settings}</Text>; }
  await render(<AppProvider><SettingsConsumer /></AppProvider>);
  expect(await screen.findByText('Settings')).toBeOnTheScreen();
  const baseline = renders;
  for (let progress = 1; progress <= 20; progress++) await act(() => { emitSession({ progress }); });
  console.log(`Settings renders for 20 progress events: ${renders - baseline}`);
  expect(renders - baseline).toBe(0);
});
