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

jest.mock('../src/components/kinetik/confetti-burst', () => {
  const ReactModule = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    ConfettiBurst: ({ children, trigger }: { children: React.ReactNode; trigger?: string }) =>
      ReactModule.createElement(View, { testID: 'confetti-burst', accessibilityLabel: trigger ?? 'idle' }, children),
  };
});

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

test('applying a fast suggestion to a legacy original-resolution session keeps quality processing', async () => {
  const legacyImage = { ...image, needsPreparation: false, workWidth: image.width, workHeight: image.height };
  seed({ state: 'READY', image: legacyImage, resolution: 'original', speed: 'fast', mode: 'fast', jobId: 'legacy-original-job' });
  Native.getImageRecommendation.mockResolvedValue({ ...recommendation, profileId: 'standard', speed: 'fast', reasonId: 'photo' });
  await render(<AppProvider><Home {...props} /></AppProvider>);
  await screen.findByRole('header', { name: copy.presets.standard.title });
  await userEvent.press(screen.getByRole('button', { name: copy.recommendationApply }));
  expect(screen.getByRole('adjustable', { name: copy.speedTitle }).props.accessibilityValue.now).toBe(0);
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

test('home preserves scale until Apply and updates the collapsed model only after selection', async () => {
  seed({ state: 'READY', image, scale: 2, mode: 'quality' });
  Native.getImageRecommendation.mockResolvedValue(recommendation);
  await render(
    <AppProvider>
      <Home {...props} />
    </AppProvider>,
  );
  expect(await screen.findByRole('header', { name: copy.presets.art.title })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: `${copy.recreate.model}: ${copy.presets.standard.title}` })).toBeOnTheScreen();
  capabilities.modes = ['quality', 'lite', 'natural', 'details', 'balanced', 'sharp', 'art', 'pixel'];
  await userEvent.press(screen.getByRole('radio', { name: '4×' }));
  const speed = screen.getByRole('adjustable', { name: copy.speedTitle });
  await fireEvent(speed, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
  expect(screen.getByRole('adjustable', { name: copy.speedTitle })).toHaveAccessibilityValue({ now: 1 });
  expect(screen.getByRole('button', { name: `${copy.recreate.model}: ${copy.presets.standard.title}` })).toBeOnTheScreen();
  expect(screen.getByRole('radio', { name: '4×' })).toBeChecked();
  await userEvent.press(screen.getByRole('button', { name: copy.recommendationApply }));
  expect(screen.getByRole('button', { name: `${copy.recreate.model}: ${copy.presets.art.title}` })).toBeOnTheScreen();
  expect(screen.getByRole('radio', { name: '4×' })).toBeChecked();
  expect(screen.getByRole('adjustable', { name: copy.speedTitle })).toHaveAccessibilityValue({ now: 0 });
  expect(screen.queryByRole('header', { name: copy.presets.art.title })).not.toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: copy.recommendationApply })).toBeNull();
});

test('an applied recommendation from an earlier image is not attached to a replacement job', async () => {
  seed({ state: 'READY', image, scale: 2, mode: 'quality' });
  let resolveReplacementRecommendation!: (value: ImageRecommendation | null) => void;
  Native.getImageRecommendation.mockImplementation(async id => id === image.id
    ? recommendation
    : new Promise(resolve => { resolveReplacementRecommendation = resolve; }));
  const setContext = jest.fn(async () => session);
  Object.defineProperty(Native, 'setRecommendationContext', { configurable: true, value: setContext });
  try {
    await render(<AppProvider><Home {...props} /></AppProvider>);
    await userEvent.press(await screen.findByRole('button', { name: copy.recommendationApply }));

    const replacement = { ...image, id: 'replacement-image' };
    await act(async () => { emitSession({ state: 'READY', image: replacement }); });
    await waitFor(() => expect(Native.getImageRecommendation).toHaveBeenCalledWith(replacement.id));
    await userEvent.press(await screen.findByRole('button', { name: copy.upscale }));
    await screen.findByText(copy.prepareTitle);
    await userEvent.press(screen.getByRole('button', { name: copy.prepare }));

    expect(setContext).toHaveBeenCalledWith('job', '', false);
    expect(Native.startJobWithProfile).toHaveBeenCalledWith(replacement.id, 2, 'art', 'quality', true);
    expect(await screen.findByRole('button', { name: copy.cancelJob })).toBeOnTheScreen();
    await act(async () => { resolveReplacementRecommendation(null); });
  } finally {
    delete (Native as typeof Native & { setRecommendationContext?: unknown }).setRecommendationContext;
  }
});

test('a failed native recommendation-context write does not discard a successful upscale', async () => {
  seed({ state: 'READY', image, scale: 2, mode: 'quality' });
  const setContext = jest.fn().mockRejectedValue(new Error('context persistence failed'));
  Object.defineProperty(Native, 'setRecommendationContext', { configurable: true, value: setContext });
  try {
    await render(<AppProvider><Home {...props} /></AppProvider>);
    await userEvent.press(await screen.findByRole('button', { name: copy.upscale }));
    await screen.findByText(copy.prepareTitle);
    await userEvent.press(screen.getByRole('button', { name: copy.prepare }));

    expect(setContext).toHaveBeenCalledWith('job', '', false);
    expect(Native.startJobWithProfile).toHaveBeenCalledWith(image.id, 2, 'standard', 'quality', true);
    expect(await screen.findByRole('button', { name: copy.cancelJob })).toBeOnTheScreen();
  } finally {
    delete (Native as typeof Native & { setRecommendationContext?: unknown }).setRecommendationContext;
  }
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

test('recreate predicts exact 2x and 4x output for a compact 256px working image', async () => {
  seed({
    state: 'READY',
    image: { ...image, width: 256, height: 128, workWidth: 256, workHeight: 128, needsPreparation: false },
    scale: 2,
  });
  emitRecreateModel({ state: 'ready', installedBytes: 1881812340 });
  await render(<AppProvider><Home {...props} /></AppProvider>);
  await userEvent.press(screen.getByRole('radio', { name: copy.recreate.title }));
  expect(screen.getAllByText(/512/).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/256/).length).toBeGreaterThan(0);
  await userEvent.press(screen.getByRole('radio', { name: '4×' }));
  expect(screen.getAllByText(/1,024/).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/512/).length).toBeGreaterThan(0);
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
    expect(screen.getByPlaceholderText(copy.recreate.prompt)).toBeOnTheScreen();
    expect(screen.queryByText(copy.aiInput)).toBeNull();
    expect(screen.getAllByText(/2,048/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/1,536/).length).toBeGreaterThan(0);
    const prompt = screen.getByPlaceholderText(copy.recreate.prompt);
    await userEvent.type(prompt, 'A tabby cat in daylight');
    await userEvent.press(screen.getByRole('button', { name: copy.recreate.title }));
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

test('recreate job cannot start until native model state is ready', async () => {
  seed({ state: 'READY', image });
  await render(<AppProvider><Home {...props} /></AppProvider>);
  await userEvent.press(screen.getByRole('radio', { name: copy.recreate.title }));
  const start = await screen.findByRole('button', { name: copy.recreate.title });
  expect(start).toBeDisabled();
  await userEvent.press(start);
  expect(Native.startRecreateJob).not.toHaveBeenCalled();
  const boundary = start.parent;
  expect(boundary).not.toBeNull();
  if (!boundary) throw new Error('Press Jelly gesture boundary is missing');
  const gesture = boundary.props.gesture as { handlers: { withTestId: string; onEnd: (event: object, success: boolean) => void } };
  expect(gesture.handlers.withTestId).toBe('press-jelly');
  await act(async () => gesture.handlers.onEnd({}, true)); // A late native touch must still be rejected by Home's readiness check.
  expect(Native.startRecreateJob).not.toHaveBeenCalled();
  await act(async () => { emitRecreateModel({ state: 'ready', installedBytes: 1881812340 }); });
  expect(screen.getByRole('button', { name: copy.recreate.title })).toBeEnabled();
});

test('recreate model selection carries the processing kind and selected enhancement profile', async () => {
  seed({ state: 'READY', image });
  await render(<AppProvider><Home {...props} /></AppProvider>);
  await userEvent.press(screen.getByRole('radio', { name: copy.recreate.title }));
  await userEvent.press(screen.getByRole('button', { name: `${copy.recreate.model}: SD 1.5 · LCM` }));
  expect(navigation.navigate).toHaveBeenCalledWith('Models', {
    processingKind: 'recreate',
    selectedProfile: 'standard',
  });
  expect(Native.startRecreateJob).not.toHaveBeenCalled();
});

test('recreation trims the local prompt and maps the quality stop to eight native steps', async () => {
  seed({ state: 'READY', image, scale: 2 });
  emitRecreateModel({ state: 'ready', installedBytes: 1881812340 });
  await render(<AppProvider><Home {...props} /></AppProvider>);
  await userEvent.press(screen.getByRole('radio', { name: copy.recreate.title }));
  await userEvent.type(screen.getByPlaceholderText(copy.recreate.prompt), '  soft watercolor  ');
  const steps = screen.getByRole('adjustable', { name: copy.speedTitle });
  await fireEvent(steps, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
  expect(steps).toHaveAccessibilityValue({ min: 0, max: 1, now: 0, text: copy.speedQuality });

  await userEvent.press(screen.getByRole('button', { name: copy.recreate.title }));
  expect(Native.startRecreateJob).toHaveBeenCalledWith(image.id, 2, 'quality', 'soft watercolor', true);
});

test('a failed recreate start preserves the selected image and remains retryable', async () => {
  seed({ state: 'READY', image });
  emitRecreateModel({ state: 'ready', installedBytes: 1881812340 });
  Native.startRecreateJob.mockRejectedValueOnce({ code: 'INFERENCE_FAILED' });
  await render(<AppProvider><Home {...props} /></AppProvider>);
  await userEvent.press(screen.getByRole('radio', { name: copy.recreate.title }));
  await userEvent.press(screen.getByRole('button', { name: copy.recreate.title }));
  expect(await screen.findByText(copy.errors.INFERENCE_FAILED)).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: copy.recreate.title })).toBeEnabled();
  await userEvent.press(screen.getByRole('button', { name: copy.recreate.title }));
  expect(Native.startRecreateJob).toHaveBeenNthCalledWith(2, image.id, 2, 'fast', '', true);
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
  await userEvent.press(screen.getByRole('button',{name:copy.understood}));
  expect(screen.queryByText(copy.notice.aiDetailsMayChange)).not.toBeOnTheScreen();
});

test('acknowledging the AI detail notice persists across a later job', async () => {
  seed({ state: 'RUNNING', image, jobId: 'first-job' }, { aiDetailNoticeSeen: false, notificationIntroSeen: true });
  await render(<AppProvider><Home {...props} /></AppProvider>);
  expect(await screen.findByText(copy.notice.aiDetailsMayChange)).toBeOnTheScreen();
  await waitFor(() => expect(Native.markAiDetailNoticeSeen).toHaveBeenCalledTimes(1));
  await userEvent.press(screen.getByRole('button', { name: copy.understood }));

  await act(async () => { emitSession({ state: 'READY', jobId: 'second-job' }); });
  await act(async () => { emitSession({ state: 'RUNNING', jobId: 'second-job' }); });
  expect(screen.queryByText(copy.notice.aiDetailsMayChange)).not.toBeOnTheScreen();
  expect(Native.markAiDetailNoticeSeen).toHaveBeenCalledTimes(1);
});

test('live success triggers one confetti job identity without aperture or early rating request', async () => {
  seed({ state: 'RUNNING', image, jobId: 'live-job', progress: 100 });
  await render(<AppProvider><Home {...props} /></AppProvider>);
  expect(screen.queryByTestId('aperture-card')).not.toBeOnTheScreen();
  expect(screen.queryByTestId('confetti-burst')).not.toBeOnTheScreen();
  expect(Native.claimReviewPrompt).not.toHaveBeenCalled();
  await act(async () => emitSession({
    state: 'SUCCEEDED',
    jobId: 'live-job',
    resultUri: 'file:///private/result.png',
    resultWidth: 4096,
    resultHeight: 3072,
  }));
  expect(await screen.findByRole('button', { name: copy.save })).toBeOnTheScreen();
  expect(screen.queryByTestId('aperture-card')).not.toBeOnTheScreen();
  expect(screen.getByTestId('confetti-burst')).toHaveProp('accessibilityLabel', 'live-job');
  expect(Native.claimReviewPrompt).not.toHaveBeenCalled();
  await act(async () => { emitSession({ state: 'SUCCEEDED', jobId: 'live-job', resultUri: 'file:///private/result.png' }); });
  expect(screen.getByTestId('confetti-burst')).toHaveProp('accessibilityLabel', 'live-job');
});

test('restored successful results do not replay completion effects', async () => {
  seed({ state: 'SUCCEEDED', image, jobId: 'restored-job', resultUri: 'file:///private/result.png' });
  await render(<AppProvider><Home {...props} /></AppProvider>);
  expect(screen.queryByTestId('aperture-card')).not.toBeOnTheScreen();
  expect(screen.getByTestId('confetti-burst')).toHaveProp('accessibilityLabel', 'idle');
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

test('Settings ignores a storage response that resolves after the screen unmounts', async () => {
  let resolveStorage!: (usage: Awaited<ReturnType<typeof Native.getStorageUsage>>) => void;
  Native.getStorageUsage.mockImplementationOnce(() => new Promise(resolve => { resolveStorage = resolve; }));
  const view = await render(
    <AppProvider>
      <SettingsScreen {...props} />
    </AppProvider>,
  );
  expect(await screen.findByText(copy.settings)).toBeOnTheScreen();
  expect(Native.getStorageUsage).toHaveBeenCalledTimes(1);
  await view.unmount();
  await act(async () => {
    resolveStorage({
      cacheBytes: 0,
      sessionBytes: 0,
      temporaryBytes: 0,
      recreateModelBytes: 0,
      otherBytes: 0,
      totalBytes: 0,
      freeBytes: 0,
    });
    await Promise.resolve();
  });
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
