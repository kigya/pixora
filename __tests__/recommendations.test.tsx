import React from 'react';
import { act, fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { AppProvider } from '../src/application/AppProvider';
import { RecommendationRequestGate } from '../src/domain/recommendation';
import { Home } from '../src/screens/Home';
import { RecommendationCard } from '../src/ui/recommendationCard';
import { SettingsScreen } from '../src/screens/Settings';
import { HelpLink } from '../src/ui/information';
import { LocaleContext } from '../src/ui/locale';
import { ThemeContext, lightColors } from '../src/ui/theme';
import { strings } from '../src/ui/i18n';
import type { ImageRecommendation, ProfileAvailability } from '../src/specs/NativeUpscale';
import Native, { capabilities, emitRecreateModel, emitSession, seed, session } from '../tests/nativeMock';

const copy = strings.en;
const navigation = { navigate: jest.fn(), goBack: jest.fn() };
const props = { navigation, route: { key: 'test', name: 'Home' } } as any;
const image = {
  id: 'image-1',
  mime: 'image/jpeg',
  size: 800,
  width: 2048,
  height: 1536,
  workWidth: 1024,
  workHeight: 768,
  hasAlpha: false,
  previewUri: 'file:///private/before.png',
  needsPreparation: true,
};
const recommendation: ImageRecommendation = {
  imageId: image.id,
  profileId: 'art',
  speed: 'quality',
  reasonId: 'art',
};
const available: ProfileAvailability = {
  standard: true,
  lite: true,
  natural: true,
  details: true,
  balanced: true,
  sharp: true,
  art: true,
  pixel: true,
  source: 'default',
  updatedAt: 0,
};

beforeEach(() => {
  jest.clearAllMocks();
  seed();
  Native.getCurrentSession.mockImplementation(async () => session);
  Native.getImageRecommendation.mockResolvedValue(null);
  capabilities.modes = ['quality', 'lite', 'natural', 'details', 'balanced', 'sharp', 'art', 'pixel'];
});

test('recommendation shows only the model name and applies only after its action', async () => {
  const onApply = jest.fn();
  await render(
    <AppProvider>
      <RecommendationCard value={recommendation} copy={copy} onApply={onApply} />
    </AppProvider>,
  );
  expect(screen.getByRole('header', { name: copy.presets.art.title })).toBeOnTheScreen();
  expect(onApply).not.toHaveBeenCalled();
  await userEvent.press(screen.getByRole('button', { name: copy.recommendationApply }));
  expect(onApply).toHaveBeenCalledWith(recommendation);
});

test.each([
  ['standard', 'photo'],
  ['natural', 'smooth'],
  ['balanced', 'mixed'],
  ['lite', 'unavailable'],
] as const)('card shows only the %s suggestion', async (profileId, reasonId) => {
  await render(
    <AppProvider>
      <RecommendationCard value={{ ...recommendation, profileId, reasonId }} copy={copy} onApply={jest.fn()} />
    </AppProvider>,
  );
  expect(screen.getByRole('header', { name: copy.presets[profileId].title })).toBeOnTheScreen();
  expect(screen.queryByText(copy.recommendationReason[reasonId])).not.toBeOnTheScreen();
  expect(screen.queryByText(/\d+\s*%/)).not.toBeOnTheScreen();
});

test('recommendation requests reject stale, mismatched, unavailable and missing results', () => {
  const gate = new RecommendationRequestGate();
  const oldRequest = gate.begin();
  const currentRequest = gate.begin();
  expect(gate.accepts(oldRequest, image.id, recommendation, available)).toBe(false);
  expect(gate.accepts(currentRequest, 'another-image', recommendation, available)).toBe(false);
  expect(gate.accepts(currentRequest, image.id, null, available)).toBe(false);
  expect(
    gate.accepts(currentRequest, image.id, recommendation, { ...available, art: false }),
  ).toBe(false);
  expect(gate.accepts(currentRequest, image.id, recommendation, available)).toBe(true);
  gate.invalidate();
  expect(gate.accepts(currentRequest, image.id, recommendation, available)).toBe(false);
});

test('home preserves manual choices until Apply and then hides the suggestion until a new image', async () => {
  seed({ state: 'READY', image, scale: 2, mode: 'quality' });
  Native.getImageRecommendation.mockResolvedValue(recommendation);
  await render(
    <AppProvider>
      <Home {...props} />
    </AppProvider>,
  );
  expect(await screen.findByRole('header', { name: copy.presets.art.title })).toBeOnTheScreen();
  expect(
    screen.getByRole('button', { name: copy.presets.standard.title }),
  ).toBeOnTheScreen();
  capabilities.modes = ['quality', 'lite', 'natural', 'details', 'balanced', 'sharp', 'art', 'pixel'];
  await userEvent.press(screen.getByRole('radio', { name: '4×' }));
  await userEvent.press(
    screen.getByRole('button', { name: copy.presets.standard.title }),
  );
  await userEvent.press(screen.getByTestId('select-model-natural'));
  expect(
    screen.getByRole('button', { name: copy.presets.natural.title }),
  ).toBeOnTheScreen();
  expect(screen.getByRole('radio', { name: '4×' })).toBeChecked();
  await userEvent.press(screen.getByRole('button', { name: copy.recommendationApply }));
  expect(
    screen.getByRole('button', { name: copy.presets.art.title }),
  ).toBeOnTheScreen();
  expect(screen.getByRole('radio', { name: '4×' })).toBeChecked();
  expect(screen.queryByRole('header', { name: copy.presets.art.title })).not.toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: copy.recommendationApply })).toBeNull();
});

test('big-image preparation keeps dimensions and cancellation available without extra copy', async () => {
  seed({ state: 'READY', image, scale: 2, mode: 'quality' });
  await render(
    <AppProvider>
      <Home {...props} />
    </AppProvider>,
  );
  expect(await screen.findByText(copy.output)).toBeOnTheScreen();
  expect(screen.queryByText(copy.preparationWhy)).not.toBeOnTheScreen();
  expect(screen.queryByText(copy.preparationDetailLoss)).not.toBeOnTheScreen();
  expect(screen.getAllByText(/2,048/).length).toBeGreaterThan(0);
  expect(screen.queryByText(copy.aiInput)).toBeNull();
  expect(screen.queryByText(copy.preparationLabel)).toBeNull();
  expect(screen.getAllByText(copy.output)).toHaveLength(1);
  await userEvent.press(screen.getByRole('button', { name: copy.upscale }));
  expect(await screen.findByText(copy.prepareTitle)).toBeOnTheScreen();
  expect(screen.queryByText(copy.preparationDetailLoss)).not.toBeOnTheScreen();
  expect(screen.getAllByText(/2,048/)).toHaveLength(3);
  await userEvent.press(screen.getByRole('button', { name: copy.cancel }));
  expect(Native.startJobWithProfile).not.toHaveBeenCalled();
});

test('fast preparation confirmation distinguishes the 512 px AI input cap', async () => {
  seed({ state: 'READY', image, scale: 2, mode: 'quality' });
  await render(
    <AppProvider>
      <Home {...props} />
    </AppProvider>,
  );
  await screen.findByLabelText(copy.speedTitle);
  await fireEvent(screen.getByLabelText(copy.speedTitle), 'accessibilityAction', {
    nativeEvent: { actionName: 'increment' },
  });
  expect(screen.queryByText(copy.preparationFast)).not.toBeOnTheScreen();
  await userEvent.press(screen.getByRole('button', { name: copy.upscale }));
  expect(screen.queryByText(copy.preparationFast)).not.toBeOnTheScreen();
  await userEvent.press(screen.getByRole('button', { name: copy.cancel }));
});

test('recreation is explicit, keeps the prompt local, and starts with selected steps', async () => {
  seed({ state: 'READY', image, scale: 4 });
  emitRecreateModel({ state: 'ready', installedBytes: 1881812340 });
  Native.getImageRecommendation.mockResolvedValue(recommendation);
  const setRecommendationContext = jest.fn(async () => session);
  Object.defineProperty(Native, 'setRecommendationContext', {
    configurable: true,
    value: setRecommendationContext,
  });
  try {
    await render(<AppProvider><Home {...props} /></AppProvider>);
    await userEvent.press(screen.getByRole('radio', { name: copy.recreate.title }));
    expect(screen.getByTestId('recreate-preview')).toBeOnTheScreen();
    expect(screen.queryByText(copy.aiInput)).toBeNull();
    expect(screen.getAllByText(/2,048/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/1,536/).length).toBeGreaterThan(0);
    const prompt = screen.getByPlaceholderText(copy.recreate.prompt);
    await userEvent.type(prompt, 'A tabby cat in daylight');
    await userEvent.press(screen.getByRole('button', { name: copy.upscale }));
    expect(Native.startRecreateJob).toHaveBeenCalledWith(
      image.id,
      4,
      'fast',
      'A tabby cat in daylight',
      true,
    );
    expect(setRecommendationContext).not.toHaveBeenCalled();
  } finally {
    delete (Native as typeof Native & { setRecommendationContext?: unknown }).setRecommendationContext;
  }
});

test('AI detail notice is shown only during processing and then acknowledged', async () => {
  seed({ state: 'READY', image }, { aiDetailNoticeSeen: false });
  await render(<AppProvider><Home {...props} /></AppProvider>);
  expect(screen.queryByText(copy.notice.aiDetailsMayChange)).toBeNull();
  await userEvent.press(screen.getByRole('button', { name: copy.upscale }));
  expect(Native.markAiDetailNoticeSeen).not.toHaveBeenCalled();
  await userEvent.press(screen.getByRole('button', {name:copy.prepare}));
  await act(async()=>{emitSession({state:'RUNNING'});});
  expect(await screen.findByText(copy.notice.aiDetailsMayChange)).toBeOnTheScreen();
  await waitFor(()=>expect(Native.markAiDetailNoticeSeen).toHaveBeenCalledTimes(1));
});

test('completion aperture is triggered by a live native success transition only', async () => {
  seed({ state: 'RUNNING', image, jobId: 'live-job', progress: 100 });
  await render(<AppProvider><Home {...props} /></AppProvider>);
  expect(screen.queryByTestId('aperture-card')).not.toBeOnTheScreen();
  await act(async () => emitSession({
    state: 'SUCCEEDED',
    jobId: 'live-job',
    resultUri: 'file:///private/result.png',
    resultWidth: 4096,
    resultHeight: 3072,
  }));
  expect(await screen.findByTestId('aperture-card')).toBeOnTheScreen();
});

test('restored successful results do not replay completion effects', async () => {
  seed({ state: 'SUCCEEDED', image, jobId: 'restored-job', resultUri: 'file:///private/result.png' });
  await render(<AppProvider><Home {...props} /></AppProvider>);
  expect(screen.queryByTestId('aperture-card')).not.toBeOnTheScreen();
  await userEvent.press(screen.getByRole('button', { name: copy.save }));
  expect(screen.queryByTestId('aperture-card')).not.toBeOnTheScreen();
});


test.each([
  [
    'portrait',
    { width: 2000, height: 3000, workWidth: 682, workHeight: 1024 },
    '2×',
    ['1,364', '2,048'],
  ],
  [
    'wide',
    { width: 3000, height: 1000, workWidth: 1024, workHeight: 341 },
    '4×',
    ['4,096', '1,364'],
  ],
])('%s preparation reports actual source, work copy, and selected output sizes', async (_, dimensions, scale, outputNumbers) => {
  const sizedImage = { ...image, ...dimensions };
  seed({ state: 'READY', image: sizedImage, scale: scale === '4×' ? 4 : 2, mode: 'quality' });
  await render(
    <AppProvider>
      <Home {...props} />
    </AppProvider>,
  );
  await screen.findByText(copy.output);
  await userEvent.press(screen.getByRole('button', { name: copy.upscale }));
  expect(await screen.findByText(copy.prepareTitle)).toBeOnTheScreen();
  expect(screen.getAllByText(/2,000|3,000|682|1,024/).length).toBeGreaterThan(0);
  for (const number of outputNumbers) {
    expect(screen.getAllByText(new RegExp(number.replace(',', '[,\u2060]?'))).length).toBeGreaterThan(0);
  }
  await userEvent.press(screen.getByRole('button', { name: copy.cancel }));
  expect(Native.startJobWithProfile).not.toHaveBeenCalled();
});


test.each([
  ['legacy fast mode', { mode: 'fast', jobId: 'legacy-job' }, 'fast'],
  ['pixel mode', { mode: 'pixel', profileId: 'pixel' }, 'quality'],
])('preparation confirmation resolves the selected speed for %s', async (_, session, expectedSpeed) => {
  seed({ state: 'READY', image, ...session });
  await render(
    <AppProvider>
      <Home {...props} />
    </AppProvider>,
  );
  await userEvent.press(screen.getByRole('button', { name: copy.upscale }));
  expect(await screen.findByText(copy.prepareTitle)).toBeOnTheScreen();
  await userEvent.press(screen.getByRole('button', { name: copy.prepare }));
  if (session.mode === 'fast') {
    expect(Native.startJobWithMode).toHaveBeenCalledWith(image.id, 2, true, 'fast');
  } else {
    expect(Native.startJobWithProfile).toHaveBeenCalledWith(
      image.id,
      2,
      'pixel',
      expectedSpeed,
      true,
    );
  }
});


test('rejected native recommendation requests quietly leave the card hidden', async () => {
  seed({ state: 'READY', image });
  Native.getImageRecommendation.mockRejectedValue(new Error('private preview unavailable'));
  await render(
    <AppProvider>
      <Home {...props} />
    </AppProvider>,
  );
  await waitFor(() =>
    expect(Native.getImageRecommendation).toHaveBeenCalledWith(image.id),
  );
  await act(async () => {
    await Promise.resolve();
  });
  expect(screen.queryByRole('header', { name: copy.presets.art.title })).not.toBeOnTheScreen();
});

test('settings contains a failed refresh and still renders', async () => {
  Native.getCurrentSession.mockRejectedValue(new Error('offline'));
  await render(
    <AppProvider>
      <SettingsScreen {...props} />
    </AppProvider>,
  );
  expect(await screen.findByText(copy.settings)).toBeOnTheScreen();
  await waitFor(() => expect(Native.getCurrentSession).toHaveBeenCalled());
});

test('cache cleanup uses the cache API and leaves the recreation model and session untouched', async () => {
  seed({ state: 'READY', image });
  emitRecreateModel({ state: 'ready', installedBytes: 1881812340 });
  await render(<AppProvider><SettingsScreen {...props} /></AppProvider>);
  await userEvent.press(await screen.findByRole('button', { name: copy.recreate.clearCache }));
  expect(Native.clearCache).toHaveBeenCalledTimes(1);
  expect(Native.deleteRecreateModel).not.toHaveBeenCalled();
  expect(Native.discardSession).not.toHaveBeenCalled();
  expect(Native.getStorageUsage).toHaveBeenCalled();
});

test('help link works with the default no-op help context', async () => {
  await render(
    <ThemeContext.Provider value={{ colors: lightColors, dark: false }}>
      <LocaleContext.Provider value="en">
        <HelpLink />
      </LocaleContext.Provider>
    </ThemeContext.Provider>,
  );
  await userEvent.press(screen.getByRole('button', { name: copy.how }));
  expect(screen.queryByText(copy.howTitle)).not.toBeOnTheScreen();
});

test('a delayed recommendation for a replaced image cannot replace the new suggestion', async () => {
  seed({ state: 'READY', image });
  let resolveOld!: (value: ImageRecommendation) => void;
  Native.getImageRecommendation.mockImplementation((id: string) =>
    id === image.id
      ? new Promise<ImageRecommendation>(resolve => { resolveOld = resolve; })
      : Promise.resolve<ImageRecommendation>({ ...recommendation, imageId: id, profileId: 'natural', reasonId: 'smooth' }),
  );
  await render(<AppProvider><Home {...props} /></AppProvider>);
  await waitFor(() => expect(Native.getImageRecommendation).toHaveBeenCalledWith(image.id));
  const replacement = { ...image, id: 'replacement' };
  await act(async () => { emitSession({ state: 'READY', image: replacement }); });
  expect(await screen.findByRole('header', { name: copy.presets.natural.title })).toBeOnTheScreen();
  await act(async () => { resolveOld(recommendation); });
  expect(screen.queryByRole('header', { name: copy.presets.art.title })).not.toBeOnTheScreen();
  expect(screen.getByRole('header', { name: copy.presets.natural.title })).toBeOnTheScreen();
});
