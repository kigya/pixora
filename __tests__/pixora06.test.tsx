import { formatEta } from '../src/ui/eta';
import React from 'react';
import { AccessibilityInfo, AppState } from 'react-native';
import { render, screen, userEvent, act } from '@testing-library/react-native';
import { publicProfile, aiSize, profileIds } from '../src/domain/profiles';
import { ProcessingOverlay } from '../src/ui/processingOverlay';
import { Home } from '../src/screens/Home';
import { AppProvider } from '../src/application/AppProvider';
import Native, { seed } from '../tests/nativeMock';
import { strings } from '../src/ui/i18n';
import { beginUpscale } from '../src/application/beginUpscale';
const t = strings.en;
const image = {
  id: 'input',
  mime: 'image/png',
  size: 20,
  width: 1024,
  height: 768,
  workWidth: 1024,
  workHeight: 768,
  hasAlpha: false,
  previewUri: 'file:///input',
  needsPreparation: false,
};
const props = {
  navigation: { navigate: jest.fn(), goBack: jest.fn() },
  route: {},
} as any;
beforeEach(() => {
  seed();
  jest.clearAllMocks();
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockResolvedValue(false);
  jest
    .spyOn(AppState, 'addEventListener')
    .mockReturnValue({ remove: jest.fn() });
  jest
    .spyOn(AccessibilityInfo, 'addEventListener')
    .mockReturnValue({ remove: jest.fn() });
});
test('public presets restore legacy IDs and bound fast input without upscaling', () => {
  expect(profileIds).toHaveLength(8);
  for (const id of profileIds) expect(publicProfile(id)).toBe(id);
  expect(publicProfile('quality')).toBe('standard');
  expect(publicProfile('fast')).toBe('lite');
  expect(publicProfile('illustration')).toBe('art');
  expect(publicProfile('illustration-fast')).toBe('art');
  expect(publicProfile('unknown')).toBe('standard');
  expect(aiSize(1024, 768, 'fast', 'standard')).toEqual({
    width: 512,
    height: 384,
  });
  expect(aiSize(3, 9, 'fast', 'lite')).toEqual({ width: 3, height: 9 });
  expect(aiSize(1024, 768, 'quality', 'art')).toEqual({
    width: 1024,
    height: 768,
  });
  expect(aiSize(1024, 768, 'fast', 'pixel')).toEqual({
    width: 1024,
    height: 768,
  });
  expect(aiSize(0, 0, 'quality', 'standard')).toEqual({ width: 1, height: 1 });
});
test('new command preserves confirmed dimensions and freezes profile and speed', async () => {
  await beginUpscale(image, 4, 'natural', async () => true, 'fast');
  await beginUpscale(image, 2, 'quality', async () => true);
  expect(Native.startJobWithMode).toHaveBeenCalledWith(
    'input',
    2,
    true,
    'quality',
  );
  expect(Native.startJobWithProfile).toHaveBeenCalledWith(
    'input',
    4,
    'natural',
    'fast',
    true,
  );
});
test('fast selection shows actual AI input and reaches the new native contract', async () => {
  seed({ state: 'READY', image });
  await render(
    <AppProvider>
      <Home {...props} />
    </AppProvider>,
  );
  await userEvent.press(
    await screen.findByRole('radio', { name: t.speedFast }),
  );
  expect(screen.getByText(t.speedNote)).toBeOnTheScreen();
  expect(screen.queryByText(t.sameInput)).toBeNull();
  await userEvent.press(screen.getByRole('button', { name: t.upscale }));
  expect(Native.startJobWithProfile).toHaveBeenCalledWith(
    'input',
    2,
    'standard',
    'fast',
    true,
  );
});
test.each([
  { remainingLowMs: 40000, remainingHighMs: 150000 },
  { remainingLowMs: undefined, remainingHighMs: undefined },
  { remainingLowMs: 1000, remainingHighMs: undefined },
])('processing renders known range or an honest unknown %#', async estimate => {
  seed({
    state: 'RUNNING',
    image,
    jobId: 'job',
    backend: 'GPU',
    phase: 'upscaling',
    profileId: 'natural',
    speed: 'fast',
    ...estimate,
  });
  await render(
    <AppProvider>
      <Home {...props} />
    </AppProvider>,
  );
  expect(await screen.findByText(t.elapsedLabel)).toBeOnTheScreen();
  expect(screen.queryByText(t.estimatingTime)).not.toBeOnTheScreen();
  expect(screen.queryByText(/About.*min left/)).not.toBeOnTheScreen();
});
test('pixel has no speed control or artificial ETA', async () => {
  seed({ state: 'READY', image, mode: 'pixel' });
  await render(
    <AppProvider>
      <Home {...props} />
    </AppProvider>,
  );
  expect(await screen.findByText(t.presets.pixel.note)).toBeOnTheScreen();
  expect(screen.queryByRole('radio', { name: t.speedFast })).toBeNull();
  await userEvent.press(screen.getByRole('button', { name: t.upscale }));
  expect(Native.startJobWithProfile).toHaveBeenCalledWith(
    'input',
    2,
    'pixel',
    'quality',
    true,
  );
});
test('overlay stops when backgrounded, restricted, or reduced motion is selected', async () => {
  const motion = jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockResolvedValue(false);
  let change!: (value: any) => void, reduce!: (value: boolean) => void;
  const state = jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_, fn) => {
      change = fn;
      return { remove: jest.fn() };
    });
  const access = jest
    .spyOn(AccessibilityInfo, 'addEventListener')
    .mockImplementation((_, fn: any) => {
      reduce = fn;
      return { remove: jest.fn() };
    });
  await render(<ProcessingOverlay height={200} active />);
  await act(async () => change('active'));
  expect(
    screen.getByTestId('processing-scan', { includeHiddenElements: true }),
  ).toBeOnTheScreen();
  await act(async () => change('background'));
  expect(
    screen.getByTestId('processing-scan', { includeHiddenElements: true }),
  ).toHaveStyle({ opacity: 0 });
  await act(async () => change('active'));
  await act(async () => reduce(true));
  expect(
    screen.getByTestId('processing-scan', { includeHiddenElements: true }),
  ).toHaveStyle({ opacity: 0 });
  await act(async () => reduce(false));
  await screen.rerender(<ProcessingOverlay height={200} active restricted />);
  expect(
    screen.getByTestId('processing-scan', { includeHiddenElements: true }),
  ).toHaveStyle({ opacity: 0 });
  await screen.rerender(<ProcessingOverlay height={200} active={false} />);
  expect(
    screen.getByTestId('processing-overlay', { includeHiddenElements: true }),
  ).toHaveStyle({ opacity: 0 });
  await screen.unmount();
  motion.mockRestore();
  state.mockRestore();
  access.mockRestore();
});
test.each([false, true])(
  'a late or rejected accessibility query does not update an unmounted overlay %s',
  async fail => {
    let resolve!: (v: boolean) => void, reject!: (e: Error) => void;
    const spy = jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockImplementation(
        () =>
          new Promise((a, b) => {
            resolve = a;
            reject = b;
          }),
      );
    await render(<ProcessingOverlay height={100} active />);
    await screen.unmount();
    await act(async () => {
      if (fail) reject(new Error('unavailable'));
      else resolve(false);
    });
    spy.mockRestore();
  },
);
test('picker waits for capabilities and exposes eight separate selection buttons', async () => {
  const { ProcessingPicker } = require('../src/ui/processingPicker');
  let resolve!: (v: any) => void;
  Native.getCapabilities.mockImplementationOnce(
    () =>
      new Promise(a => {
        resolve = a;
      }),
  );
  await render(
    <AppProvider>
      <ProcessingPicker value="standard" onChange={() => {}} />
    </AppProvider>,
  );
  await userEvent.press(
    screen.getByRole('button', {
      name: `${t.profileTitle}: ${t.presets.standard.title}`,
    }),
  );
  expect(screen.queryAllByRole('radio')).toHaveLength(0);
  const { capabilities } = require('../tests/nativeMock');
  await act(async () => resolve({ ...capabilities, modes: profileIds }));
  for (const profile of profileIds) expect(screen.getByRole('button', { name: t.presets[profile].title })).toBeOnTheScreen();
  await userEvent.press(
    screen.getByRole('button', { name: t.presets.sharp.title }),
  );
});

test('retry of an interrupted legacy illustration keeps its old network until the user selects a new profile', async () => {
  seed({
    state: 'INTERRUPTED',
    image,
    mode: 'illustration-fast',
    jobId: 'old-job',
    profileId: undefined,
  });
  await render(
    <AppProvider>
      <Home {...props} />
    </AppProvider>,
  );
  await userEvent.press(await screen.findByRole('button', { name: t.retry }));
  expect(Native.startJobWithMode).toHaveBeenCalledWith(
    'input',
    2,
    true,
    'illustration-fast',
  );
});

test.each([1, 2, 3, 4])(
  'review sends %s stars to support only after Continue',
  async rating => {
    const { ReviewDialog } = require('../src/ui/feedback');
    const close = jest.fn(),
      feedback = jest.fn();
    await render(
      <AppProvider>
        <ReviewDialog visible onClose={close} onFeedback={feedback} />
      </AppProvider>,
    );
    await userEvent.press(screen.getByRole('radio', { name: `${rating} / 5` }));
    expect(feedback).not.toHaveBeenCalled();
    await userEvent.press(screen.getByRole('button', { name: t.continue }));
    expect(feedback).toHaveBeenCalledWith(rating);
    await screen.rerender(
      <AppProvider>
        <ReviewDialog visible={false} onClose={close} onFeedback={feedback} />
      </AppProvider>,
    );
    await screen.rerender(
      <AppProvider>
        <ReviewDialog visible onClose={close} onFeedback={feedback} />
      </AppProvider>,
    );
    expect(screen.getByRole('button', { name: t.continue })).toBeDisabled();
  },
);

test('time ranges use seconds for short jobs and collapse equal bounds', () => {
  const copy = require('../src/locales/en.json');
  const number = (value: number) => String(value);
  const text = (low: number, high: number) =>
    formatEta(copy, low, high, number).replace(/[\u200e\u2066-\u2069]/g, '');
  expect(text(8000, 15000)).toContain('8–15 sec');
  expect(text(1000, 1000)).toContain('1 sec');
  expect(text(60000, 60000)).toContain('1 min');
  expect(text(60000, 180000)).toContain('1–3 min');
  expect(text(0, 0)).toContain('1 sec');
  expect(text(2000, 1000)).toContain('2 sec');
});
