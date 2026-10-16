import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { AppProvider } from '../src/application/AppProvider';
import { StorageSlider } from '../src/ui/storageSlider';
import { TelemetryNotice } from '../src/ui/telemetryControls';
import { ProfilePreview } from '../src/ui/profilePreview';
import { LocaleContext } from '../src/ui/locale';
import Native, { seed } from '../tests/nativeMock';
import { strings } from '../src/ui/i18n';

beforeEach(() => {
  jest.clearAllMocks();
  seed();
  Native.getTelemetrySettings.mockResolvedValue({
    analytics: false,
    crashes: false,
    noticeSeen: true,
    consentVersion: 0,
  });
});
afterEach(() => jest.restoreAllMocks());

test.each(
  [320, 360, 412, 840].flatMap(width =>
    ['en', 'ar'].map(locale => ({ width, locale })),
  ),
)(
  'storage labels have the same centers as their stops at $width / $locale',
  async ({ width, locale }) => {
    await render(
      <AppProvider>
        <LocaleContext.Provider value={locale as 'en' | 'ar'}>
          <StorageSlider value={50} onChange={() => {}} />
        </LocaleContext.Provider>
      </AppProvider>,
    );
    await act(() =>
      fireEvent(screen.getByRole('adjustable'), 'layout', {
        nativeEvent: { layout: { width } },
      }),
    );
    for (let i = 0; i < 5; i++) {
      const stop = StyleSheet.flatten(
        screen.getByTestId('storage-stop-' + i).props.style,
      );
      const label = StyleSheet.flatten(
        screen.getByTestId('storage-label-' + i).props.style,
      );
      expect(
        Math.abs(stop.left + stop.width / 2 - label.left - label.width / 2),
      ).toBeLessThanOrEqual(1);
      expect(label.width).toBeGreaterThanOrEqual(48);
      expect(label.minHeight).toBeGreaterThanOrEqual(48);
    }
  },
);

test('nearest preview changes only at step boundaries and does not persist during movement', async () => {
  const reaction = jest.spyOn(
    require('react-native-reanimated'),
    'useAnimatedReaction',
  );
  const change = jest.fn();
  await render(
    <AppProvider>
      <StorageSlider value={10} onChange={change} />
    </AppProvider>,
  );
  const update = reaction.mock.calls[reaction.mock.calls.length - 1][1] as (
    next: number,
    previous: number,
  ) => void;
  await act(() => {
    update(1, 1);
    update(2, 1);
  });
  expect(screen.getAllByText('50')).toHaveLength(2);
  expect(change).not.toHaveBeenCalled();
});

test.each([
  ['standard', 1280, 960], ['lite', 1280, 960],
  ['natural', 1280, 960], ['details', 1280, 857],
  ['balanced', 1280, 575], ['sharp', 1280, 960],
  ['art', 1280, 1114], ['pixel', 981, 1280],
] as const)(
  '%s example images fill a comparison area with their own aspect ratio', async (id, sourceWidth, sourceHeight) => {
  const source = (require('../assets/presets/manifest.json') as Array<{ profile: string; side: string; width: number; height: number }>).find(row => row.profile === id && row.side === 'before');
  expect(source).toEqual(expect.objectContaining({ width: sourceWidth, height: sourceHeight }));
  await render(<AppProvider><ProfilePreview id={id} /></AppProvider>);
  let measured: any = screen.getByTestId('profile-after-image');
  while (measured && !measured.props.onLayout) measured = measured.parent;
  expect(measured).toBeTruthy();
  await act(() => fireEvent(measured, 'layout', {
    nativeEvent: { layout: { width: 320 } },
  }));
  for (const id of ['profile-before-image', 'profile-after-image']) {
    const image = screen.getByTestId(id);
    const style = StyleSheet.flatten(image.props.style);
    expect(image.props.resizeMode).toBe('contain');
    expect(style).toEqual(expect.objectContaining({ left: 0, top: 0, width: 320, height: Math.round(320 * sourceHeight / sourceWidth) }));
  }
  expect(StyleSheet.flatten(screen.getByTestId('profile-after-image').parent!.props.style))
    .toEqual(expect.objectContaining({ width: 320, height: Math.round(320 * sourceHeight / sourceWidth) }));
});

test('notice records measured height once for the collapse animation', async () => {
  Native.getTelemetrySettings.mockResolvedValueOnce({
    analytics: true,
    crashes: true,
    noticeSeen: false,
    consentVersion: 0,
  });
  await render(
    <AppProvider>
      <TelemetryNotice />
    </AppProvider>,
  );
  expect(screen.queryByRole('switch')).toBeNull();
  let node = (await screen.findByText(strings.en.telemetryIntro)).parent!;
  while (!node.props.onLayout) node = node.parent!;
  await act(() =>
    fireEvent(node, 'layout', { nativeEvent: { layout: { height: 200 } } }),
  );
  await act(() =>
    fireEvent(node, 'layout', { nativeEvent: { layout: { height: 180 } } }),
  );
});
