import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { AppProvider } from '../src/application/AppProvider';
import { Home } from '../src/screens/Home';
import { beginUpscale } from '../src/application/beginUpscale';
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
  Native.getTelemetrySettings.mockResolvedValue({
    analytics: false, crashes: false, noticeSeen: true, consentVersion: 2,
  });
});
test('the default launch confirms preparation and creates a prepared-resolution job', async () => {
  const confirm = jest.fn(async () => true);
  const notice = jest.fn(async () => true);
  await beginUpscale(image, 2, 'standard', confirm, 'quality', notice);
  expect(confirm).toHaveBeenCalledWith(image, 2);
  expect(notice).toHaveBeenCalledTimes(1);
  expect(Native.startJobWithProfile).toHaveBeenCalledWith(
    'source', 2, 'standard', 'quality', true,
  );
  expect(Native.startJobWithResolution).not.toHaveBeenCalled();
});
test('new jobs expose only the prepared input and omit original-resolution choice', async () => {
  seed({ state: 'READY', image: { ...image, needsPreparation: false } });
  await render(
    <AppProvider>
      <Home {...({ navigation: { navigate: jest.fn() }, route: {} } as any)} />
    </AppProvider>,
  );
  expect(screen.queryByRole('radio', { name: 'Original resolution' })).not.toBeOnTheScreen();
  expect(screen.getByTestId('start-job')).toBeEnabled();
  await fireEvent.press(screen.getByRole('radio', { name: '4×' }));
  expect(screen.getByTestId('start-job')).toBeEnabled();
  await fireEvent.press(screen.getByTestId('start-job'));
  expect(Native.startJobWithProfile).toHaveBeenCalledWith(
    'source', 4, 'standard', 'quality', true,
  );
  expect(Native.startJobWithResolution).not.toHaveBeenCalled();
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
  const png = await screen.findByRole('radio', { name: 'PNG' });
  expect(png.props.accessibilityState).toEqual({ checked: true, disabled: false });
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
  await screen.findByRole('header', { name: 'Standard' });
  expect(screen.queryByText('This looks like a photo.')).not.toBeOnTheScreen();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Apply suggestion' }),
  );
  expect(screen.getByLabelText('Processing speed')).toHaveAccessibilityValue({
    min: 0,
    max: 1,
    now: 0,
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
