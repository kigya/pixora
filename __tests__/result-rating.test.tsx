import React from 'react';
import { AppState } from 'react-native';
import { act, fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { AppProvider } from '../src/application/AppProvider';
import { ResultRating } from '../src/ui/resultRating';
import { FeedbackScreen } from '../src/screens/Feedback';
import Native, { emitSession, seed, session } from '../tests/nativeMock';
import { ratingContext } from '../src/application/telemetry';
import { strings } from '../src/ui/i18n';

jest.mock('../src/components/kinetik/pop-dialog', () => {
  const ReactModule = require('react');
  const { Pressable: PressableMock, Text: TextMock, View: ViewMock } = require('react-native');
  return {
    PopDialog: ({ visible, title, children, onClose, onShow }: any) => {
      mockLastRatingClose = onClose;
      mockLastRatingShow = onShow;
      ReactModule.useEffect(() => {
        if (visible) onShow?.();
      }, [visible]);
      return visible
        ? ReactModule.createElement(
            ViewMock,
            { testID: 'rating-dialog' },
            ReactModule.createElement(PressableMock, { testID: 'rating-dismiss', onPress: onClose },
              ReactModule.createElement(TextMock, null, 'Dismiss')),
            ReactModule.createElement(TextMock, null, title),
            children,
          )
        : null;
    },
  };
});

let mockLastRatingClose: (() => void) | undefined;
let mockLastRatingShow: (() => void) | undefined;

const t = strings.en;
type Listener = () => void;
function makeNavigation(initiallyFocused = true) {
  const listeners: Partial<Record<'focus' | 'blur', Listener>> = {};
  return {
    isFocused: jest.fn(() => initiallyFocused),
    addListener: jest.fn((event: 'focus' | 'blur', listener: Listener) => {
      listeners[event] = listener;
      return jest.fn(() => { delete listeners[event]; });
    }),
    navigate: jest.fn(),
    emit(event: 'focus' | 'blur') { listeners[event]?.(); },
  };
}

function successfulJob(overrides: Partial<typeof session> = {}) {
  return {
    ...session,
    state: 'SUCCEEDED',
    jobId: 'rating-job',
    processingKind: 'enhance',
    mode: 'standard',
    profileId: 'standard',
    modelId: 'realesrgan-x4plus',
    speed: 'quality',
    scale: 2,
    backend: 'cpu',
    resultWidth: 640,
    resultHeight: 480,
    elapsedMs: 1200,
    image: {
      id: 'private-image-id',
      uri: 'file:///private/private-photo.jpg',
      width: 320,
      height: 240,
      workWidth: 320,
      workHeight: 240,
      mime: 'image/jpeg',
      hasAlpha: false,
    },
    ...overrides,
  } as typeof session;
}

async function renderRating(options: { eligible?: boolean; focused?: boolean; job?: typeof session } = {}) {
  const navigation = makeNavigation(options.focused ?? true);
  await render(
    <AppProvider>
      <ResultRating
        job={options.job ?? successfulJob()}
        eligible={options.eligible ?? true}
        navigation={navigation as any}
      />
    </AppProvider>,
  );
  return navigation;
}

async function advanceRatingDelay(ms = 1200) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    await Promise.resolve();
  });
}

async function addStars(count: number) {
  const stars = screen.getByRole('adjustable', { name: t.rating.title });
  for (let i = 0; i < count; i++) {
    await fireEvent(stars, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
  }
  await fireEvent(stars, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
  await act(async () => { await Promise.resolve(); });
}
async function commitSelectedRating() {
  await fireEvent(screen.getByRole('adjustable', { name: t.rating.title }), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
  await act(async () => { await Promise.resolve(); });
}
function setupUser() {
  return userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLastRatingClose = undefined;
  mockLastRatingShow = undefined;
  seed({
    state: 'SUCCEEDED', jobId: 'rating-job', resultWidth: 640, resultHeight: 480,
    processingKind: 'enhance', mode: 'standard', profileId: 'standard',
    modelId: 'realesrgan-x4plus', speed: 'quality', scale: 2, backend: 'cpu',
    image: {
      id: 'private-image-id', mime: 'image/jpeg', size: 1000, width: 320, height: 240,
      workWidth: 320, workHeight: 240, hasAlpha: false,
      previewUri: 'file:///private/private-photo.jpg', needsPreparation: false,
    },
  });
  jest.useFakeTimers();
  (Native.claimReviewPrompt as jest.Mock).mockResolvedValue(true);
  (Native.markReviewPromptShown as jest.Mock).mockResolvedValue(true);
  (Native.getFeedbackStatus as jest.Mock).mockResolvedValue(false);
  (Native.openStoreReview as jest.Mock).mockResolvedValue(true);
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

test('fresh completion waits 1200ms, claims eligibility, then records only an actually shown prompt', async () => {
  await renderRating();
  await advanceRatingDelay(1199);
  expect(Native.claimReviewPrompt).not.toHaveBeenCalled();
  expect(screen.queryByTestId('rating-dialog')).not.toBeOnTheScreen();

  await advanceRatingDelay(1);
  expect(Native.claimReviewPrompt).toHaveBeenCalledWith('rating-job');
  expect(await screen.findByTestId('rating-dialog')).toBeOnTheScreen();
  expect(Native.markReviewPromptShown).toHaveBeenCalledWith('rating-job');
  expect(Native.logTelemetryEvent).toHaveBeenCalledWith(
    'review_prompt_requested', expect.stringContaining('rating-job'),
  );
});

test('claim false, claim error, ineligible job, and lost focus never show a prompt', async () => {
  (Native.claimReviewPrompt as jest.Mock).mockResolvedValue(false);
  await renderRating();
  await advanceRatingDelay();
  expect(screen.queryByTestId('rating-dialog')).not.toBeOnTheScreen();
  expect(Native.markReviewPromptShown).not.toHaveBeenCalled();

  await screen.unmount();
  (Native.claimReviewPrompt as jest.Mock).mockRejectedValue(new Error('storage error'));
  await renderRating();
  await advanceRatingDelay();
  expect(screen.queryByTestId('rating-dialog')).not.toBeOnTheScreen();

  await screen.unmount();
  (Native.claimReviewPrompt as jest.Mock).mockResolvedValue(true);
  (Native.claimReviewPrompt as jest.Mock).mockClear();
  const navigation = await renderRating({ eligible: false });
  await advanceRatingDelay();
  expect(Native.claimReviewPrompt).not.toHaveBeenCalled();
  await screen.unmount();
  (Native.claimReviewPrompt as jest.Mock).mockClear();

  const unfocused = await renderRating();
  await act(async () => { unfocused.emit('blur'); });
  await advanceRatingDelay(1200);
  expect(Native.claimReviewPrompt).not.toHaveBeenCalled();
  await act(async () => { unfocused.emit('focus'); });
  await advanceRatingDelay(1200);
  expect(screen.getByTestId('rating-dialog')).toBeOnTheScreen();
  expect(navigation.navigate).not.toHaveBeenCalled();
});

test('a delayed eligibility claim for a replaced job cannot open or mark a stale prompt', async () => {
  let resolveClaim!: (value: boolean) => void;
  (Native.claimReviewPrompt as jest.Mock).mockReturnValueOnce(
    new Promise(resolve => { resolveClaim = resolve; }),
  );
  const navigation = makeNavigation();
  const view = await render(
    <AppProvider>
      <ResultRating job={successfulJob()} eligible navigation={navigation as any} />
    </AppProvider>,
  );
  await advanceRatingDelay();
  expect(Native.claimReviewPrompt).toHaveBeenCalledWith('rating-job');

  await view.rerender(
    <AppProvider>
      <ResultRating job={successfulJob({ jobId: 'replacement-job' })} eligible navigation={navigation as any} />
    </AppProvider>,
  );
  await act(async () => { resolveClaim(true); await Promise.resolve(); });
  expect(screen.queryByTestId('rating-dialog')).not.toBeOnTheScreen();
  expect(Native.markReviewPromptShown).not.toHaveBeenCalled();
});

test('backgrounding cancels the pending prompt timer until the app returns to foreground', async () => {
  const changes: Array<(state: 'active' | 'background' | 'inactive') => void> = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener: any) => {
    changes.push(listener);
    return { remove: jest.fn() } as any;
  });
  await renderRating();
  expect(changes.length).toBeGreaterThan(0);
  await act(async () => { changes.forEach(change => change('background')); });
  await advanceRatingDelay(1500);
  expect(Native.claimReviewPrompt).not.toHaveBeenCalled();
  await act(async () => { changes.forEach(change => change('active')); });
  await advanceRatingDelay(1200);
  expect(screen.getByTestId('rating-dialog')).toBeOnTheScreen();
  expect(Native.claimReviewPrompt).toHaveBeenCalledTimes(1);
});

test('dismissal records dismissal, and an uncommitted zero rating is never submitted', async () => {
  const user = setupUser();
  const navigation = await renderRating();
  await advanceRatingDelay();
  expect(screen.getByRole('adjustable', { name: t.rating.title })).toBeEnabled();
  await user.press(screen.getByTestId('rating-dismiss'));
  expect(screen.queryByTestId('rating-dialog')).not.toBeOnTheScreen();
  expect(Native.logTelemetryEvent).toHaveBeenCalledWith(
    'review_dismissed', expect.stringContaining('rating-job'),
  );
  expect(Native.submitResultRating).not.toHaveBeenCalled();
  expect(navigation.navigate).not.toHaveBeenCalled();
});

test('rating choices stay disabled until the visible prompt is durably marked', async () => {
  let resolveMark!: (value: boolean) => void;
  (Native.markReviewPromptShown as jest.Mock).mockReturnValueOnce(
    new Promise(resolve => { resolveMark = resolve; }),
  );
  await renderRating();
  await advanceRatingDelay();
  await screen.findByTestId('rating-dialog');
  const stars = screen.getByRole('adjustable', { name: t.rating.title });
  expect(stars.props.accessibilityState.disabled).toBe(true);
  await fireEvent(stars, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
  await fireEvent(stars, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
  expect(Native.submitResultRating).not.toHaveBeenCalled();
  await act(async () => resolveMark(true));
  expect(screen.getByRole('adjustable', { name: t.rating.title }).props.accessibilityState.disabled).toBe(false);
  await addStars(2);
  expect(Native.submitResultRating).toHaveBeenCalledWith('rating-job', 2);
});

test.each(['false', 'rejected'] as const)('a mark that is %s closes the prompt without enabling rating', async outcome => {
  if (outcome === 'false') (Native.markReviewPromptShown as jest.Mock).mockResolvedValueOnce(false);
  else (Native.markReviewPromptShown as jest.Mock).mockRejectedValueOnce(new Error('write failed'));
  await renderRating();
  await advanceRatingDelay();
  await act(async () => { await Promise.resolve(); });
  expect(screen.queryByTestId('rating-dialog')).not.toBeOnTheScreen();
  expect(Native.submitResultRating).not.toHaveBeenCalled();
  expect(Native.logTelemetryEvent).not.toHaveBeenCalledWith('review_prompt_requested', expect.anything());
});

test('low ratings persist once, then route to feedback with star count and privacy-safe context', async () => {
  const user = setupUser();
  const navigation = await renderRating();
  await advanceRatingDelay();
  await addStars(2);
  expect(Native.submitResultRating).toHaveBeenCalledTimes(1);
  expect(Native.submitResultRating).toHaveBeenCalledWith('rating-job', 2);
  const [route, params] = navigation.navigate.mock.calls[0] as any[];
  expect(route).toBe('Feedback');
  expect(params.rating).toBe(2);
  expect(params.context).toMatchObject({
    attempt_token: 'rating-job', processing_kind: 'enhance', profile_id: 'standard',
    source_format: 'jpeg', source_width: 320, output_width: 640,
  });
  expect(JSON.stringify(params.context)).not.toContain('private-photo');
  expect(JSON.stringify(params.context)).not.toContain('private-image-id');
  expect(JSON.stringify(Native.logTelemetryEvent.mock.calls)).not.toContain('file:///private');
  expect(JSON.stringify(Native.logTelemetryEvent.mock.calls)).not.toContain('private-photo');

  await screen.unmount();
  (Native.getFeedbackStatus as jest.Mock).mockResolvedValue(true);
  const feedbackNavigation = makeNavigation();
  await render(
    <AppProvider>
      <FeedbackScreen navigation={feedbackNavigation as any} route={{ params } as any} />
    </AppProvider>,
  );
  const message = screen.getByLabelText('Your message');
  await user.type(message, 'The image still looks soft.');
  await user.press(screen.getByRole('button', { name: t.send }));
  expect(Native.sendFeedback).toHaveBeenCalledWith('', 'The image still looks soft.', 2, expect.any(String));
});

test('a rejected rating write stays in the prompt and reports a retryable error', async () => {
  (Native.submitResultRating as jest.Mock).mockRejectedValueOnce(new Error('storage unavailable'));
  await renderRating();
  await advanceRatingDelay();
  await addStars(2);
  expect(screen.getByRole('alert')).toHaveTextContent(t.error);
  expect(screen.getByTestId('rating-dialog')).toBeOnTheScreen();
  expect(Native.submitResultRating).toHaveBeenCalledTimes(1);
  expect(Native.openStoreReview).not.toHaveBeenCalled();
});

test('a failed rating write can be retried without losing the chosen value', async () => {
  (Native.submitResultRating as jest.Mock)
    .mockRejectedValueOnce(new Error('temporary storage error'))
    .mockResolvedValueOnce(emitSession({ resultRating: 2 }));
  const navigation = await renderRating();
  await advanceRatingDelay();
  await addStars(2);

  expect(screen.getByRole('alert')).toHaveTextContent(t.error);
  expect(screen.getByRole('adjustable', { name: t.rating.title })).toHaveAccessibilityValue({
    min: 0,
    max: 5,
    now: 2,
    text: '2 of 5 stars',
  });
  await commitSelectedRating();

  expect(Native.submitResultRating).toHaveBeenCalledTimes(2);
  expect(Native.submitResultRating).toHaveBeenLastCalledWith('rating-job', 2);
  expect(navigation.navigate).toHaveBeenCalledWith('Feedback', expect.objectContaining({ rating: 2 }));
  expect(screen.queryByTestId('rating-dialog')).not.toBeOnTheScreen();
});

test('five committed stars open the store directly and can retry a transient store error', async () => {
  (Native.openStoreReview as jest.Mock)
    .mockResolvedValueOnce(false)
    .mockResolvedValueOnce(true);
  await renderRating();
  await advanceRatingDelay();
  await addStars(5);
  expect(Native.submitResultRating).toHaveBeenCalledWith('rating-job', 5);
  expect(Native.openStoreReview).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('alert')).toHaveTextContent(t.error);
  expect(Native.logTelemetryEvent).toHaveBeenCalledWith(
    'play_redirect_finished', expect.stringContaining('error'),
  );
  await commitSelectedRating();
  expect(Native.submitResultRating).toHaveBeenCalledTimes(2);
  expect(Native.openStoreReview).toHaveBeenCalledTimes(2);
  expect(screen.queryByTestId('rating-dialog')).not.toBeOnTheScreen();
  expect(Native.logTelemetryEvent).toHaveBeenCalledWith(
    'play_redirect_finished', expect.stringContaining('success'),
  );
});

test('repeated rating activation is guarded while the native write is unresolved', async () => {
  let resolveWrite!: (value: typeof session) => void;
  (Native.submitResultRating as jest.Mock).mockReturnValueOnce(new Promise(resolve => { resolveWrite = resolve; }));
  await renderRating();
  await advanceRatingDelay();
  await addStars(1);
  await fireEvent.press(screen.getByTestId('rating-dismiss'));
  expect(screen.getByTestId('rating-dialog')).toBeOnTheScreen();
  expect(Native.logTelemetryEvent).not.toHaveBeenCalledWith('review_dismissed', expect.anything());
  await commitSelectedRating();
  expect(Native.submitResultRating).toHaveBeenCalledTimes(1);
  await act(async () => resolveWrite(emitSession({ resultRating: 1 })));
});

test('a delayed mark for a previous job cannot unlock a prompt for a newer job', async () => {
  let resolveOldMark!: (value: boolean) => void;
  (Native.markReviewPromptShown as jest.Mock)
    .mockReturnValueOnce(new Promise(resolve => { resolveOldMark = resolve; }))
    .mockResolvedValueOnce(true);
  const navigation = makeNavigation();
  const firstJob = successfulJob({ jobId: 'old-job' });
  const view = await render(<AppProvider><ResultRating job={firstJob} eligible navigation={navigation as any} /></AppProvider>);
  await advanceRatingDelay();
  expect(Native.markReviewPromptShown).toHaveBeenCalledWith('old-job');

  const newerJob = successfulJob({ jobId: 'new-job' });
  await view.rerender(<AppProvider><ResultRating job={newerJob} eligible navigation={navigation as any} /></AppProvider>);
  await advanceRatingDelay();
  expect(Native.markReviewPromptShown).toHaveBeenCalledWith('new-job');
  await screen.findByTestId('rating-dialog');
  await act(async () => resolveOldMark(true));

  await addStars(1);
  expect(Native.submitResultRating).toHaveBeenCalledWith('new-job', 1);
  expect(Native.submitResultRating).not.toHaveBeenCalledWith('old-job', expect.anything());
});

test('a late native modal show callback for a replaced job cannot mark the new prompt', async () => {
  const navigation = makeNavigation();
  const view = await render(
    <AppProvider>
      <ResultRating job={successfulJob({ jobId: 'old-job' })} eligible navigation={navigation as any} />
    </AppProvider>,
  );
  await advanceRatingDelay();
  expect(Native.markReviewPromptShown).toHaveBeenCalledWith('old-job');
  const staleShow = mockLastRatingShow;
  expect(staleShow).toBeDefined();

  await view.rerender(
    <AppProvider>
      <ResultRating job={successfulJob({ jobId: 'new-job' })} eligible navigation={navigation as any} />
    </AppProvider>,
  );
  Native.markReviewPromptShown.mockClear();
  await act(async () => staleShow?.());

  expect(Native.markReviewPromptShown).not.toHaveBeenCalled();
  expect(Native.submitResultRating).not.toHaveBeenCalled();
});

test('a stale mark rejection cannot close the prompt currently shown for another job', async () => {
  let rejectOldMark!: (reason: Error) => void;
  (Native.markReviewPromptShown as jest.Mock)
    .mockReturnValueOnce(new Promise((_resolve, reject) => { rejectOldMark = reject; }))
    .mockResolvedValueOnce(true);
  const navigation = makeNavigation();
  const view = await render(
    <AppProvider>
      <ResultRating job={successfulJob({ jobId: 'old-job' })} eligible navigation={navigation as any} />
    </AppProvider>,
  );
  await advanceRatingDelay();

  await view.rerender(
    <AppProvider>
      <ResultRating job={successfulJob({ jobId: 'new-job' })} eligible navigation={navigation as any} />
    </AppProvider>,
  );
  await advanceRatingDelay();
  expect(await screen.findByTestId('rating-dialog')).toBeOnTheScreen();
  expect(screen.getByRole('adjustable', { name: t.rating.title })).toBeEnabled();

  await act(async () => { rejectOldMark(new Error('stale storage failure')); });

  expect(screen.getByTestId('rating-dialog')).toBeOnTheScreen();
  expect(screen.getByRole('adjustable', { name: t.rating.title })).toBeEnabled();
});

test('a stale close callback after switching jobs does not record dismissal for the new job', async () => {
  await renderRating();
  await advanceRatingDelay();
  const nextJob = successfulJob({ jobId: 'next-job' });
  await screen.rerender(<AppProvider><ResultRating job={nextJob} eligible navigation={makeNavigation() as any} /></AppProvider>);
  const staleExitClose = mockLastRatingClose;
  expect(staleExitClose).toBeDefined();
  await act(async () => staleExitClose?.());
  expect(Native.logTelemetryEvent).not.toHaveBeenCalledWith(
    'review_dismissed', expect.stringContaining('next-job'),
  );
});

test('a pending rating write resolved after blur does not navigate or open the store', async () => {
  let resolveWrite!: (value: typeof session) => void;
  (Native.submitResultRating as jest.Mock).mockReturnValueOnce(new Promise(resolve => { resolveWrite = resolve; }));
  const navigation = await renderRating();
  await advanceRatingDelay();
  await addStars(1);
  expect(Native.submitResultRating).toHaveBeenCalledWith('rating-job', 1);

  await act(async () => navigation.emit('blur'));
  await act(async () => resolveWrite(emitSession({ resultRating: 1 })));
  expect(navigation.navigate).not.toHaveBeenCalled();
  expect(Native.openStoreReview).not.toHaveBeenCalled();
});

test('a pending native rating write settling after unmount does not restore the dialog', async () => {
  let resolveWrite!: (value: typeof session) => void;
  (Native.submitResultRating as jest.Mock).mockReturnValueOnce(
    new Promise(resolve => { resolveWrite = resolve; }),
  );
  await renderRating();
  await advanceRatingDelay();
  await addStars(2);
  expect(Native.submitResultRating).toHaveBeenCalledWith('rating-job', 2);

  await screen.unmount();
  await act(async () => resolveWrite(emitSession({ resultRating: 2 })));

  expect(Native.openStoreReview).not.toHaveBeenCalled();
  expect(Native.logTelemetryEvent).not.toHaveBeenCalledWith('review_dismissed', expect.anything());
  expect(screen.queryByTestId('rating-dialog')).toBeNull();
});

test('a store request resolving after the dialog loses focus does not emit stale telemetry', async () => {
  let resolveStore!: (value: boolean) => void;
  (Native.openStoreReview as jest.Mock).mockReturnValueOnce(new Promise(resolve => { resolveStore = resolve; }));
  const navigation = await renderRating();
  await advanceRatingDelay();
  await addStars(5);
  expect(Native.openStoreReview).toHaveBeenCalledTimes(1);

  await act(async () => navigation.emit('blur'));
  await act(async () => resolveStore(true));
  expect(navigation.navigate).not.toHaveBeenCalled();
  expect(Native.logTelemetryEvent).not.toHaveBeenCalledWith('play_redirect_finished', expect.anything());
  expect(screen.queryByTestId('rating-dialog')).not.toBeOnTheScreen();
});

test('a completed Play Store request records its outcome after backgrounding without restoring the dialog', async () => {
  let resolveStore!: (value: boolean) => void;
  const appStateListeners:Array<(state:string)=>void>=[];
  jest.spyOn(AppState,'addEventListener').mockImplementation((_event,listener)=>{
    appStateListeners.push(listener as (state:string)=>void);
    return {remove:jest.fn()};
  });
  (Native.openStoreReview as jest.Mock).mockReturnValueOnce(new Promise(resolve=>{resolveStore=resolve;}));
  await renderRating();
  await advanceRatingDelay();
  await addStars(5);
  expect(Native.openStoreReview).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId('rating-dialog')).toBeOnTheScreen();

  await act(async()=>{appStateListeners.forEach(listener=>listener('background'));});
  expect(screen.queryByTestId('rating-dialog')).not.toBeOnTheScreen();
  await act(async()=>resolveStore(true));

  const outcomes=Native.logTelemetryEvent.mock.calls.filter(([event])=>event==='play_redirect_finished');
  expect(outcomes).toHaveLength(1);
  expect(outcomes[0]?.[1]).toContain('success');
  expect(screen.queryByTestId('rating-dialog')).not.toBeOnTheScreen();
});

test('rating context covers enhance/recreate metadata and all source-format fallbacks', () => {
  const base = successfulJob();
  expect(ratingContext(base)).toMatchObject({ processing_kind: 'enhance', source_format: 'jpeg' });
  const recreate = ratingContext({
    ...base, processingKind: 'recreate', recreateSteps: 8, recreateModelRevision: 'r1',
    recreatePrompt: 'A cat', image: { ...base.image!, mime: 'image/png', hasAlpha: true },
  });
  expect(recreate).toMatchObject({ processing_kind: 'recreate', source_format: 'png', has_alpha: 1, steps: 8, prompt_present: 1 });
  expect(JSON.stringify(recreate)).not.toContain('A cat');
  expect(ratingContext({
    ...base, processingKind: 'recreate', recreateSteps: undefined, recreateModelRevision: undefined,
    recreatePrompt: ' ', image: { ...base.image!, mime: 'image/webp' },
  })).toMatchObject({ source_format: 'webp', steps: 4, recreate_revision: '', prompt_present: 0 });
  expect(ratingContext({
    ...base, processingKind: undefined, profileId: '', mode: '', speed: undefined,
    image: { ...base.image!, mime: 'image/gif', workWidth: 0, workHeight: 0, width: 0, height: 0 },
  })).toMatchObject({ processing_kind: 'enhance', source_format: 'other', profile_id: 'standard', speed: 'quality', input_width: 0 });
});
