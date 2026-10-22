import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { AppProvider } from '../src/application/AppProvider';
import { Home } from '../src/screens/Home';
import { beginUpscale } from '../src/application/beginUpscale';
import {
  originalSizeAllowed,
  processingDimensions,
} from '../src/domain/resolution';
import Native, { seed } from '../tests/nativeMock';
jest.setTimeout(20000);
const image = {
  id: 'source',
  width: 4000,
  height: 3000,
  workWidth: 1024,
  workHeight: 768,
  size: 1000,
  mime: 'image/jpeg',
  hasAlpha: false,
  previewUri: 'file:///photo.png',
  needsPreparation: true,
};
beforeEach(() => {
  jest.clearAllMocks();
  seed({ state: 'READY', image });
});
test('original resolution caps are identical for both scales and integer dimensions', () => {
  expect(originalSizeAllowed(4000, 4000, 2)).toBe(true);
  expect(originalSizeAllowed(2000, 2000, 4)).toBe(true);
  for (const [w, h, scale] of [
    [4001, 4000, 2],
    [8193, 1, 2],
    [1, 8193, 2],
    [0, 1, 2],
    [1, 0, 2],
    [1, 1, 3],
    [1.5, 1, 2],
    [1, 1.5, 2],
  ])
    expect(originalSizeAllowed(w, h, scale)).toBe(false);
  expect(processingDimensions(image, 'original')).toEqual({
    width: 4000,
    height: 3000,
  });
  expect(processingDimensions(image, 'prepared')).toEqual({
    width: 1024,
    height: 768,
  });
});
test('original launch bypasses reduction confirmation and keeps the notification gate', async () => {
  const confirm = jest.fn(async () => false),
    intro = jest.fn(async () => false);
  expect(
    await beginUpscale(
      image,
      2,
      'standard',
      confirm,
      'quality',
      intro,
      'original',
    ),
  ).toBeNull();
  expect(Native.startJobWithResolution).not.toHaveBeenCalled();
  await beginUpscale(
    image,
    2,
    'standard',
    confirm,
    'quality',
    async () => true,
    'original',
  );
  expect(confirm).not.toHaveBeenCalled();
  expect(Native.startJobWithResolution).toHaveBeenCalledWith(
    'source',
    2,
    'standard',
    'quality',
    'original',
    true,
  );
});
test('new jobs expose only the prepared input and omit original-resolution choice', async () => {
  await render(
    <AppProvider>
      <Home {...({ navigation: { navigate: jest.fn() }, route: {} } as any)} />
    </AppProvider>,
  );
  expect(await screen.findAllByText(/1,024.*768/)).not.toHaveLength(0);
  expect(screen.queryByRole('radio', { name: 'Original resolution' })).not.toBeOnTheScreen();
  expect(screen.getByTestId('start-job')).toBeEnabled();
  await fireEvent.press(screen.getByRole('radio', { name: '4×' }));
  expect(screen.getAllByText(/4,096.*3,072/).length).toBeGreaterThan(0);
  expect(screen.getByTestId('start-job')).toBeEnabled();
});

test('an original result defaults to PNG and excludes whole-image transcode formats', async () => {
  seed(
    {
      state: 'SUCCEEDED',
      image,
      resolution: 'original',
      jobId: 'original',
      resultUri: 'file:///after.png',
      resultWidth: 8000,
      resultHeight: 6000,
    },
    { format: 'webp' },
  );
  await render(
    <AppProvider>
      <Home {...({ navigation: { navigate: jest.fn() }, route: {} } as any)} />
    </AppProvider>,
  );
  expect(await screen.findByRole('radio', { name: 'PNG' })).toBeSelected();
  expect(screen.queryByRole('radio', { name: 'WebP' })).not.toBeOnTheScreen();
  await fireEvent.press(screen.getByTestId('save-result'));
  expect(Native.exportResult).toHaveBeenCalledWith('original', 'png');
});

test('recommendation shows only the suggested model and an explicit apply action', async () => {
  Native.getImageRecommendation.mockResolvedValueOnce({
    imageId: image.id,
    profileId: 'standard',
    speed: 'quality',
    reasonId: 'photo',
  });
  await render(
    <AppProvider>
      <Home {...({ navigation: { navigate: jest.fn() }, route: {} } as any)} />
    </AppProvider>,
  );
  await screen.findByRole('heading', { name: 'Standard' });
  expect(screen.queryByText(/photo|standard/i)).not.toBeOnTheScreen();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Apply suggestion' }),
  );
  expect(screen.getByLabelText('Processing speed')).toHaveAccessibilityValue({
    min: 0,
    max: 1,
    now: 1,
    text: 'Quality',
  });
});

test('settings replays onboarding and contains full-policy browser failures', async () => {
  const { SettingsScreen } = require('../src/screens/Settings');
  const { Linking } = require('react-native');
  const { strings } = require('../src/ui/i18n');
  const t = strings.en;
  const navigation = { navigate: jest.fn(), goBack: jest.fn() };
  await render(
    <AppProvider>
      <SettingsScreen navigation={navigation} route={{}} />
    </AppProvider>,
  );
  await fireEvent.press(
    await screen.findByRole('button', { name: t.onboarding.replay }),
  );
  expect(navigation.navigate).toHaveBeenCalledWith('Onboarding', {
    replay: true,
  });
  await fireEvent.press(screen.getByRole('button', { name: t.privacy }));
  const link = jest
    .spyOn(Linking, 'openURL')
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(undefined);
  await fireEvent.press(
    screen.getByRole('button', { name: t.privacyPolicyLink }),
  );
  expect(await screen.findByText(t.privacyPolicyOpenFailed)).toBeOnTheScreen();
  await fireEvent.press(
    screen.getByRole('button', { name: t.privacyPolicyLink }),
  );
  expect(screen.queryByText(t.privacyPolicyOpenFailed)).not.toBeOnTheScreen();
  link.mockRestore();
});
