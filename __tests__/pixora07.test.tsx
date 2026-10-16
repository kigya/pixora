import React from 'react';
import { AppState, Image } from 'react-native';
import {
  render,
  screen,
  act,
  fireEvent,
  userEvent,
} from '@testing-library/react-native';
import { AppProvider } from '../src/application/AppProvider';
import { ProcessingCard } from '../src/ui/processingCard';
import { ProfilePreview } from '../src/ui/profilePreview';
import {
  TelemetryControls,
  TelemetryNotice,
} from '../src/ui/telemetryControls';
import { StorageSlider } from '../src/ui/storageSlider';
import { LocaleContext } from '../src/ui/locale';
import { jobContext, useTrackedScreen } from '../src/application/telemetry';
import { emptySession } from '../src/domain/session';
import Native, { seed } from '../tests/nativeMock';
import { strings } from '../src/ui/i18n';

const events = () =>
  Native.logTelemetryEvent.mock.calls.map(([name, data]) => [
    name,
    JSON.parse(data),
  ]);
beforeEach(() => {
  jest.clearAllMocks();
  seed();
  AppState.currentState = 'active';
  Native.getTelemetrySettings.mockResolvedValue({
    analytics: false,
    crashes: false,
    noticeSeen: true,
    consentVersion: 0,
  });
  Native.updateTelemetrySettings.mockImplementation(
    async (analytics, crashes, noticeSeen) => ({
      analytics,
      crashes,
      noticeSeen,
      consentVersion: 2,
    }),
  );
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('telemetry controls persist independently and retain state after a failed write', async () => {
  await render(
    <AppProvider>
      <TelemetryControls />
    </AppProvider>,
  );
  const analytics = await screen.findByRole('switch', {
    name: strings.en.analyticsTitle,
  });
  await act(() => fireEvent(analytics, 'valueChange', true));
  expect(Native.updateTelemetrySettings).toHaveBeenLastCalledWith(
    true,
    false,
    true,
  );
  expect(
    screen.getByRole('switch', { name: strings.en.analyticsTitle }),
  ).toHaveProp('value', true);
  await act(() =>
    fireEvent(
      screen.getByRole('switch', { name: strings.en.crashesTitle }),
      'valueChange',
      true,
    ),
  );
  expect(Native.updateTelemetrySettings).toHaveBeenLastCalledWith(
    true,
    true,
    true,
  );
  await act(() =>
    fireEvent(
      screen.getByRole('switch', { name: strings.en.analyticsTitle }),
      'valueChange',
      false,
    ),
  );
  await act(() =>
    fireEvent(
      screen.getByRole('switch', { name: strings.en.crashesTitle }),
      'valueChange',
      false,
    ),
  );
  expect(events()).toEqual(
    expect.arrayContaining([
      ['settings_changed', { setting: 'analytics', value: 'on' }],
      ['settings_changed', { setting: 'analytics', value: 'off' }],
    ]),
  );
  Native.updateTelemetrySettings.mockRejectedValueOnce(
    new Error('write failed'),
  );
  await act(() =>
    fireEvent(
      screen.getByRole('switch', { name: strings.en.analyticsTitle }),
      'valueChange',
      true,
    ),
  );
  expect(
    await screen.findByText(strings.en.errors.INFERENCE_FAILED),
  ).toBeOnTheScreen();
  expect(
    screen.getByRole('switch', { name: strings.en.analyticsTitle }),
  ).toHaveProp('value', false);
});

test('informational first-launch notice keeps default-on choices and reports save failure', async () => {
  Native.getTelemetrySettings.mockResolvedValue({
    analytics: true,
    crashes: true,
    noticeSeen: true,
    consentVersion: 0,
  });
  const user = userEvent.setup();
  await render(
    <AppProvider>
      <TelemetryNotice />
    </AppProvider>,
  );
  const dismiss = await screen.findByRole('button', {
    name: strings.en.continue,
  });
  expect(screen.queryByRole('switch')).toBeNull();
  expect(screen.queryByRole('button', { name: strings.en.notNow })).toBeNull();
  Native.updateTelemetrySettings.mockRejectedValueOnce(new Error('disk'));
  await user.press(dismiss);
  expect(
    await screen.findByText(strings.en.errors.INFERENCE_FAILED),
  ).toBeOnTheScreen();
  await user.press(dismiss);
  expect(Native.updateTelemetrySettings).toHaveBeenLastCalledWith(
    true,
    true,
    true,
  );
  expect(screen.queryByText(strings.en.telemetryIntro)).not.toBeOnTheScreen();
});

test('example comparison handles buttons, resized image, and clamped horizontal gesture without selecting a mode', async () => {
  jest
    .spyOn(Image, 'resolveAssetSource')
    .mockReturnValue({ width: 800, height: 400, uri: 'asset', scale: 1 });
  const user = userEvent.setup();
  await render(<ProfilePreview id="standard" />);
  await user.press(screen.getByRole('radio', { name: strings.en.before }));
  await user.press(screen.getByRole('radio', { name: strings.en.after }));
  await user.press(screen.getByRole('radio', { name: strings.en.compare }));
  const boundary = screen.getByTestId('gesture-boundary');
  const group = boundary.parent!;
  await act(() =>
    fireEvent(group, 'layout', { nativeEvent: { layout: { width: 200 } } }),
  );
  await act(() => {
    const handlers =
      screen.getByTestId('gesture-boundary').props.gesture.handlers;
    handlers.onUpdate({ x: -30 });
    handlers.onUpdate({ x: 999 });
    handlers.onEnd();
  });
  expect(events()).toEqual(
    expect.arrayContaining([
      [
        'profile_preview_interacted',
        { profile_id: 'standard', action: 'divider' },
      ],
      [
        'profile_preview_interacted',
        { profile_id: 'standard', action: 'before' },
      ],
    ]),
  );
  expect(events().some(([name]) => name === 'profile_selected')).toBe(false);
  await act(() => {
    /* No per-frame telemetry. */
  });
});

test('cache slider commits once on release, not during movement, cancels cleanly and supports mirrored taps', async () => {
  const changed = jest.fn();
  await render(
    <AppProvider>
      <LocaleContext.Provider value="ar">
        <StorageSlider value={50} onChange={changed} />
      </LocaleContext.Provider>
    </AppProvider>,
  );
  const track = await screen.findByRole('adjustable');
  await act(() =>
    fireEvent(track, 'layout', { nativeEvent: { layout: { width: 240 } } }),
  );
  const [pan, tap] = screen.getByTestId('gesture-boundary').props.gesture;
  await act(() => {
    pan.handlers.onUpdate({ x: -10 });
    pan.handlers.onUpdate({ x: 999 });
  });
  expect(changed).not.toHaveBeenCalled();
  await act(() => pan.handlers.onFinalize({}, false));
  expect(changed).not.toHaveBeenCalled();
  await act(() => {
    pan.handlers.onUpdate({ x: 14 });
    pan.handlers.onEnd();
    pan.handlers.onFinalize({}, true);
  });
  expect(changed).toHaveBeenCalledTimes(1);
  expect(changed).toHaveBeenLastCalledWith(-1);
  await act(() => {
    tap.handlers.onEnd({ x: 240 }, false);
    tap.handlers.onEnd({ x: 240 }, true);
  });
  expect(changed).toHaveBeenCalledTimes(2);
  expect(changed).toHaveBeenLastCalledWith(0);
});

test('processing card reports real phases, uncertainty, fallback and stops its clock in background', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(1000000);
  let listener: (state: any) => void = () => {};
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_event, callback) => {
      listener = callback;
      return { remove: jest.fn() };
    });
  const job = {
    ...emptySession,
    state: 'RUNNING',
    startedAt: Date.now(),
    phase: 'upscaling',
    progress: 54,
    backend: 'GPU',
  };
  const { rerender } = await render(<ProcessingCard session={job} />);
  expect(screen.getByRole('progressbar')).toHaveAccessibilityValue({
    min: 0,
    max: 100,
    now: 54,
  });
  expect(screen.queryByText(strings.en.estimatingTime)).not.toBeOnTheScreen();
  expect(screen.queryByText('GPU')).not.toBeOnTheScreen();
  expect(screen.queryByText(strings.en.remainingLabel)).not.toBeOnTheScreen();
  await act(() => jest.advanceTimersByTime(2000));
  expect(screen.getByText(/0.*:.*02/)).toBeOnTheScreen();
  await act(() => listener('background'));
  await act(() => jest.advanceTimersByTime(6000));
  expect(screen.getByText(/0.*:.*02/)).toBeOnTheScreen();
  await act(() => listener('active'));
  await rerender(
    <ProcessingCard
      session={{
        ...job,
        error: 'GPU_FAILED',
        backend: 'CPU',
        remainingLowMs: 60000,
        remainingHighMs: 120000,
      }}
    />,
  );
  expect(screen.getByText(strings.en.fallback)).toBeOnTheScreen();
  await rerender(
    <ProcessingCard
      session={{
        ...job,
        state: 'FINALIZING',
        phase: 'writing_result',
        progress: -1,
        backend: '',
      }}
    />,
  );
  expect(screen.getByRole('progressbar')).toHaveAccessibilityValue({
    text: strings.en.finalizing,
  });
  await rerender(
    <ProcessingCard
      session={{ ...job, phase: 'unknown', backend: 'CPU', elapsedMs: 301000 }}
    />,
  );
  expect(screen.getByText(strings.en.long)).toBeOnTheScreen();
  await rerender(
    <ProcessingCard
      session={{ ...job, phase: 'preparing_image', backend: 'CPU' }}
    />,
  );
  expect(screen.getByText(strings.en.cpu)).toBeOnTheScreen();
});

test('screen engagement excludes background and loss of native navigation focus', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(1000);
  let appState: (state: any) => void = () => {};
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_event, listener) => {
      appState = listener;
      return { remove: jest.fn() };
    });
  let focused = true;
  const notify: Record<string, () => void> = {};
  const removed = jest.fn();
  const navigation = {
    isFocused: () => focused,
    addListener: (name: string, fn: () => void) => {
      notify[name] = fn;
      return removed;
    },
  };
  function Screen() {
    useTrackedScreen('settings', {}, navigation);
    return null;
  }
  const { unmount } = await render(<Screen />);
  await act(() => {
    jest.advanceTimersByTime(100);
    appState('background');
    appState('background');
  });
  await act(() => {
    jest.advanceTimersByTime(10000);
    appState('active');
  });
  await act(() => {
    jest.advanceTimersByTime(200);
    focused = false;
    notify.blur();
  });
  await act(() => {
    jest.advanceTimersByTime(10000);
    focused = true;
    notify.focus();
  });
  await unmount();
  const times = events()
    .filter(([name]) => name === 'screen_engagement')
    .map(([, params]) => params.engagement_ms);
  expect(times).toEqual([100, 200, 0]);
  expect(removed).toHaveBeenCalled();
});

test('job analytics categorises sizes without image URI or filenames', () => {
  const context = jobContext(emptySession);
  expect(context.size_bucket).toBe('small');
  expect(context.speed).toBe('quality');
  expect(
    jobContext({
      ...emptySession,
      image: { workWidth: 700, workHeight: 700 } as any,
      speed: 'fast',
      profileId: 'natural',
    }),
  ).toEqual(
    expect.objectContaining({
      size_bucket: 'medium',
      speed: 'fast',
      profile_id: 'natural',
    }),
  );
  expect(
    jobContext({
      ...emptySession,
      image: { workWidth: 1024, workHeight: 1024 } as any,
    }),
  ).toEqual(expect.objectContaining({ size_bucket: 'large' }));
  expect(JSON.stringify(context)).not.toMatch(/uri|filename|email/i);
});

test('processing layout adapts to large type and RTL while keeping values LTR', async () => {
  const rn = require('react-native');
  const dimensions = jest
    .spyOn(rn, 'useWindowDimensions')
    .mockReturnValue({ width: 320, height: 640, fontScale: 2, scale: 1 });
  const job = {
    ...emptySession,
    startedAt: Date.now(),
    state: 'RUNNING',
    phase: 'upscaling',
    progress: 30,
  };
  const { rerender } = await render(
    <LocaleContext.Provider value="ar">
      <ProcessingCard session={job} />
    </LocaleContext.Provider>,
  );
  expect(screen.getByRole('progressbar')).toHaveAccessibilityValue({
    min: 0,
    max: 100,
    now: 30,
  });
  dimensions.mockReturnValue({
    width: 840,
    height: 640,
    fontScale: 1,
    scale: 1,
  });
  await rerender(
    <LocaleContext.Provider value="ar">
      <ProcessingCard session={job} />
    </LocaleContext.Provider>,
  );
  expect(screen.queryByText(strings.ar.estimatingTime)).not.toBeOnTheScreen();
  await rerender(<ProcessingCard session={job} />);
});

test('slider falls back for obsolete setting, successful tap/pan release keep discrete storage', async () => {
  const changed = jest.fn();
  await render(
    <AppProvider>
      <StorageSlider value={123} onChange={changed} />
    </AppProvider>,
  );
  const track = await screen.findByRole('adjustable');
  expect(track).toHaveAccessibilityValue({ now: 4 });
  const [pan, tap] = screen.getByTestId('gesture-boundary').props.gesture;
  await act(() => {
    pan.handlers.onUpdate({ x: 120 });
    pan.handlers.onEnd();
    pan.handlers.onFinalize({}, true);
    tap.handlers.onEnd({ x: 14 }, true);
  });
  expect(changed.mock.calls.map(([value]) => value)).toEqual([50, 0]);
});

test('screen opened in background logs nothing until foreground and supports absent navigation APIs', async () => {
  AppState.currentState = 'background';
  let listener: (state: any) => void = () => {};
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_event, callback) => {
      listener = callback;
      return { remove: jest.fn() };
    });
  function Screen() {
    useTrackedScreen('about', {}, {});
    return null;
  }
  const { unmount } = await render(<Screen />);
  expect(Native.logTelemetryEvent).not.toHaveBeenCalled();
  await act(() => {
    listener('active');
    listener('active');
  });
  await unmount();
  expect(events()[0]).toEqual([
    'screen_view',
    { screen_name: 'about', screen_class: 'about' },
  ]);
  const { track } = require('../src/application/telemetry');
  track('ui_action');
  expect(events()).toContainEqual(['ui_action', {}]);
});

test('remote configuration replaces a disabled selection, preserves import and blocks only new processing', async () => {
  const { Home } = require('../src/screens/Home');
  const flags = {
    standard: false,
    lite: true,
    natural: true,
    details: true,
    balanced: true,
    sharp: true,
    art: true,
    pixel: true,
    source: 'remote',
    updatedAt: 1,
  };
  Native.getProfileAvailability.mockResolvedValue(flags);
  let updated: (value: any) => void = () => {};
  Native.onProfileAvailabilityChanged.mockImplementation(callback => {
    updated = callback!;
    return { remove: jest.fn() };
  });
  const image = {
    id: 'i',
    mime: 'image/png',
    size: 20,
    width: 100,
    height: 100,
    workWidth: 100,
    workHeight: 100,
    hasAlpha: false,
    previewUri: 'file:///image',
    needsPreparation: false,
  };
  seed({ state: 'READY', image, sessionId: 'session', profileId: 'standard' });
  const props = {
    navigation: { navigate: jest.fn(), goBack: jest.fn() },
    route: {},
  } as any;
  const { unmount } = await render(
    <AppProvider>
      <Home {...props} />
    </AppProvider>,
  );
  expect(await screen.findByText(strings.en.profileChanged)).toBeOnTheScreen();
  expect(
    screen.getByRole('button', {
      name: `${strings.en.profileTitle}: ${strings.en.presets.lite.title}`,
    }),
  ).toBeOnTheScreen();
  await act(() =>
    updated({
      ...flags,
      lite: false,
      natural: false,
      details: false,
      balanced: false,
      sharp: false,
      art: false,
      pixel: false,
    }),
  );
  expect(screen.getByText(strings.en.profilesUnavailable)).toBeOnTheScreen();
  expect(
    screen.getByRole('button', { name: strings.en.upscale }),
  ).toBeDisabled();
  expect(screen.getByRole('button', { name: strings.en.other })).toBeEnabled();
  await unmount();
  Native.getProfileAvailability.mockResolvedValue({ ...flags, standard: true });
  Native.onProfileAvailabilityChanged.mockImplementation(() => ({
    remove: jest.fn(),
  }));
});

test('feedback does not ask for or transmit a personal rating', async () => {
  const { FeedbackScreen } = require('../src/screens/Feedback');
  Native.getFeedbackStatus.mockResolvedValue(true);
  const user = userEvent.setup();
  const props = {
    navigation: { navigate: jest.fn(), goBack: jest.fn() },
    route: { params: undefined },
  } as any;
  await render(
    <AppProvider>
      <FeedbackScreen {...props} />
    </AppProvider>,
  );
  await screen.findByRole('button', { name: strings.en.send });
  expect(screen.queryByRole('radio')).toBeNull();
  await user.type(screen.getByLabelText(strings.en.message), 'A helpful note');
  await user.press(screen.getByRole('button', { name: strings.en.send }));
  expect(Native.sendFeedback).toHaveBeenCalledWith('', 'A helpful note', 0, expect.any(String));
});
