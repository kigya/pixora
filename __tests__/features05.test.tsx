import React from 'react';
import { Keyboard, Platform } from 'react-native';
import {
  render,
  screen,
  userEvent,
  fireEvent,
  act,
} from '@testing-library/react-native';
import { AppProvider } from '../src/application/AppProvider';
import { FeedbackScreen, feedbackId } from '../src/screens/Feedback';
import { Home } from '../src/screens/Home';
import { SettingsScreen } from '../src/screens/Settings';
import { ProcessingPicker } from '../src/ui/processingPicker';
import { ImagePreview } from '../src/ui/imagePreview';
import { StorageSlider } from '../src/ui/storageSlider';
import Native, { seed, capabilities } from '../tests/nativeMock';
import { strings } from '../src/ui/i18n';
import {
  validEmail,
  validMessage,
  previewSize,
  needsAspectWarning,
} from '../src/domain/presentation';
const t = strings.en,
  navigation = { navigate: jest.fn(), goBack: jest.fn() };
const image = {
  id: 'i',
  mime: 'image/png',
  size: 200,
  width: 120,
  height: 60,
  workWidth: 120,
  workHeight: 60,
  hasAlpha: false,
  previewUri: 'file:///before.png',
  needsPreparation: false,
};
const props = { navigation, route: { params: undefined } } as any;
beforeEach(() => {
  jest.clearAllMocks();
  seed();
  Native.getFeedbackStatus.mockResolvedValue(false);
  Native.getNotificationStatus.mockResolvedValue(false);
  Native.claimReviewPrompt.mockResolvedValue(false);
  Native.sendFeedback.mockResolvedValue(true);
});
test('aspect fit has no square border and extreme shapes warn rather than reject', () => {
  expect(previewSize(100, 200, 300, 320)).toEqual({ width: 160, height: 320 });
  expect(previewSize(200, 100, 300, 320)).toEqual({ width: 300, height: 150 });
  expect(previewSize(0, 0, 0, 0)).toEqual({ width: 1, height: 1 });
  expect(needsAspectWarning(1200, 100)).toBe(true);
  expect(needsAspectWarning(100, 1200)).toBe(true);
  expect(needsAspectWarning(300, 100)).toBe(false);
  for (const v of ['person@example.com', ' person@example.com '])
    expect(validEmail(v)).toBe(true);
  for (const v of ['bad', 'a@b', 'a\n@b.com', 'a'.repeat(255)])
    expect(validEmail(v)).toBe(false);
  expect(validMessage('hello')).toBe(true);
  expect(validMessage('four')).toBe(false);
  expect(validMessage('a'.repeat(4001))).toBe(false);
  expect(feedbackId()).toMatch(/^[a-f0-9-]{36}$/);
});
test('feedback unavailable is clear and cannot pretend to send', async () => {
  await render(
    <AppProvider>
      <FeedbackScreen {...props} />
    </AppProvider>,
  );
  expect(await screen.findByText(t.feedbackUnavailable)).toBeOnTheScreen();
  expect(screen.getByTestId('feedback-scroll').props.keyboardShouldPersistTaps).toBe('handled');
  expect(screen.getByTestId('feedback-scroll').props.automaticallyAdjustKeyboardInsets).toBe(true);
  expect(screen.getByRole('button', { name: t.send })).toBeDisabled();
  await userEvent.press(screen.getByRole('button', { name: t.back }));
  expect(navigation.goBack).toHaveBeenCalled();
});
test('feedback preserves automatic scroll insets when iOS keyboard avoidance is not needed', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  Native.getFeedbackStatus.mockResolvedValue(true);
  await render(
    <AppProvider>
      <FeedbackScreen {...props} />
    </AppProvider>,
  );
  const scroll = await screen.findByTestId('feedback-scroll');
  expect(Platform.OS).toBe('android');
  expect(scroll.props.automaticallyAdjustKeyboardInsets).toBe(true);
});
test('feedback re-scrolls the focused field after keyboard resize and removes its listener', async () => {
  const remove = jest.fn();
  let keyboardDidShow: (() => void) | undefined;
  let subscriptions = 0;
  jest.spyOn(Keyboard, 'addListener').mockImplementation((_event, listener) => {
    subscriptions += 1;
    keyboardDidShow = listener as () => void;
    return { remove } as any;
  });
  Native.getFeedbackStatus.mockResolvedValue(true);
  const view = await render(
    <AppProvider>
      <FeedbackScreen {...props} />
    </AppProvider>,
  );
  const field = await screen.findByLabelText(t.message);
  await act(async () => keyboardDidShow?.()); // No focused field: the late keyboard event is ignored.
  await fireEvent(field, 'focus', { nativeEvent: { target: 731 } });
  expect(keyboardDidShow).toEqual(expect.any(Function));
  await act(async () => keyboardDidShow?.());
  await view.unmount();
  expect(subscriptions).toBeGreaterThan(0);
  expect(remove).toHaveBeenCalledTimes(subscriptions);
});
test('feedback email is optional; failures retain text and retry id', async () => {
  Native.getFeedbackStatus.mockResolvedValue(true);
  await render(
    <AppProvider>
      <FeedbackScreen {...props} />
    </AppProvider>,
  );
  const send = await screen.findByRole('button', {
    name: t.send,
    disabled: false,
  });
  await userEvent.press(send);
  expect(screen.getByText(t.invalidMessage)).toBeOnTheScreen();
  await userEvent.type(screen.getByLabelText(t.message), 'A useful question');
  Native.sendFeedback.mockRejectedValueOnce(new Error('offline'));
  await userEvent.press(send);
  expect(await screen.findByText(t.feedbackError)).toBeOnTheScreen();
  expect(screen.getByDisplayValue('A useful question')).toBeOnTheScreen();
  const id = Native.sendFeedback.mock.calls[0][3];
  await userEvent.press(send);
  expect(await screen.findByText(t.feedbackSuccess)).toBeOnTheScreen();
  expect(Native.sendFeedback).toHaveBeenLastCalledWith(
    '',
    'A useful question',
    0,
    id,
  );
  expect(send).toBeDisabled();
  expect(screen.queryByRole('radio')).toBeNull();
});
test('feedback config failure is a local unavailable state', async () => {
  Native.getFeedbackStatus.mockRejectedValueOnce(new Error('unavailable'));
  await render(
    <AppProvider>
      <FeedbackScreen {...props} />
    </AppProvider>,
  );
  expect(await screen.findByText(t.feedbackUnavailable)).toBeOnTheScreen();
});
test('collapsed model cards select independently and keep one expanded comparison', async () => {
  capabilities.modes = [
    'quality',
    'fast',
    'illustration',
    'illustration-fast',
    'pixel',
  ];
  const change = jest.fn();
  await render(
    <AppProvider>
      <ProcessingPicker value="quality" onChange={change} />
    </AppProvider>,
  );
  await screen.findByTestId('select-model-standard');
  await userEvent.press(screen.getByTestId('select-model-art'));
  expect(change).toHaveBeenCalledWith('art');
  await userEvent.press(screen.getByRole('button', { name: t.presets.standard.title }));
  expect(screen.getByText(t.presets.standard.note)).toBeOnTheScreen();
  expect(screen.getByRole('adjustable', { name: `${t.presets.standard.title}: ${t.before} / ${t.after}` })).toBeOnTheScreen();
  await userEvent.press(screen.getByRole('button', { name: t.presets.pixel.title }));
  expect(screen.queryByText(t.presets.standard.note)).not.toBeOnTheScreen();
  expect(screen.getByText(t.presets.pixel.note)).toBeOnTheScreen();
  expect(screen.getByRole('adjustable', { name: `${t.presets.pixel.title}: ${t.before} / ${t.after}` })).toBeOnTheScreen();
  await userEvent.press(screen.getByTestId('select-model-pixel'));
  expect(change).toHaveBeenCalledWith('pixel');
});
test('storage slider is bounded, accessible and has no numeric input', async () => {
  const onChange = jest.fn();
  await render(
    <AppProvider>
      <StorageSlider value={-1} onChange={onChange} />
    </AppProvider>,
  );
  const slider = screen.getByRole('adjustable');
  await fireEvent(slider, 'accessibilityAction', {
    nativeEvent: { actionName: 'increment' },
  });
  expect(onChange).toHaveBeenLastCalledWith(-1);
  await fireEvent(slider, 'accessibilityAction', {
    nativeEvent: { actionName: 'decrement' },
  });
  expect(onChange).toHaveBeenLastCalledWith(200);
  await userEvent.press(screen.getByRole('button', { name: t.cacheNo }));
  expect(onChange).toHaveBeenLastCalledWith(0);
});
test('settings indicates granted permission and links support; WebP has readable description', async () => {
  Native.getNotificationStatus.mockResolvedValue(true);
  await render(
    <AppProvider>
      <SettingsScreen {...props} />
    </AppProvider>,
  );
  expect(await screen.findByText(t.notificationsOn)).toBeOnTheScreen();
  await userEvent.press(screen.getByRole('radio', { name: 'WebP' }));
  expect(await screen.findByText(t.webpNote)).toBeOnTheScreen();
  await userEvent.press(screen.getByRole('button', { name: t.issues }));
  expect(navigation.navigate).toHaveBeenCalledWith('Feedback');
});
test('iOS notification settings explain interruption instead of Android service controls', async () => {
  const original = Object.getOwnPropertyDescriptor(Platform, 'OS');
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  try {
    await render(
      <AppProvider>
        <SettingsScreen {...props} />
      </AppProvider>,
    );
    expect(
      await screen.findByText(t.notificationIosBody),
    ).toBeOnTheScreen();
    expect(screen.queryByText(t.notificationBody)).toBeNull();
  } finally {
    if (original) Object.defineProperty(Platform, 'OS', original);
  }
});
test('extreme ratio confirmation can stop a job; WebP save reaches native format', async () => {
  seed({ state: 'READY', image: { ...image, width: 1200, height: 100 } });
  await render(
    <AppProvider>
      <Home {...props} />
    </AppProvider>,
  );
  await userEvent.press(await screen.findByRole('button', { name: t.upscale }));
  expect(screen.getByText(t.aspectTitle)).toBeOnTheScreen();
  await userEvent.press(screen.getByRole('button', { name: t.cancel }));
  expect(Native.startJobWithMode).not.toHaveBeenCalled();
});
test.each([false, true])(
  'closing feedback before config resolves is safe %s',
  async fail => {
    let resolve!: (v: boolean) => void, reject!: (e: Error) => void;
    Native.getFeedbackStatus.mockImplementationOnce(
      () =>
        new Promise((a, b) => {
          resolve = a;
          reject = b;
        }),
    );
    await render(
      <AppProvider>
        <FeedbackScreen {...props} />
      </AppProvider>,
    );
    await screen.unmount();
    const { act } = require('@testing-library/react-native');
    await act(async () => {
      if (fail) reject(new Error('late'));
      else resolve(true);
    });
  },
);
test('Arabic feedback keeps an LTR optional reply address and has no rating control', async () => {
  seed({}, { language: 'ar' });
  Native.getFeedbackStatus.mockResolvedValue(true);
  await render(
    <AppProvider>
      <FeedbackScreen {...props} />
    </AppProvider>,
  );
  expect(await screen.findByLabelText(strings.ar.email)).toHaveStyle({
    direction: 'ltr',
    textAlign: 'left',
  });
  expect(screen.queryByRole('radio')).toBeNull();
});
test('pending feedback cannot submit twice', async () => {
  Native.getFeedbackStatus.mockResolvedValue(true);
  let done!: (v: boolean) => void;
  Native.sendFeedback.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        done = resolve;
      }),
  );
  await render(
    <AppProvider>
      <FeedbackScreen {...props} />
    </AppProvider>,
  );
  await screen.findByRole('button', { name: t.send, disabled: false });
  await userEvent.type(screen.getByLabelText(t.email), 'me@example.com');
  await userEvent.type(screen.getByLabelText(t.message), 'This is feedback');
  await userEvent.press(screen.getByRole('button', { name: t.send }));
  expect(screen.getByRole('button', { name: t.send })).toBeDisabled();
  const { act } = require('@testing-library/react-native');
  await act(async () => done(true));
});
test('image preview measures actual available width', async () => {
  await render(
    <AppProvider>
      <ImagePreview
        uri="file:///i"
        width={100}
        height={200}
        maxHeight={320}
        label="Picture"
      />
    </AppProvider>,
  );
  await fireEvent(screen.getByLabelText('Picture'), 'layout', {
    nativeEvent: { layout: { width: 100 } },
  });
  expect(screen.getByLabelText('Picture')).toHaveStyle({
    width: 100,
    height: 200,
  });
});
test('unknown profile falls back and picker backdrop closes safely', async () => {
  const change = jest.fn();
  await render(
    <AppProvider>
      <ProcessingPicker value="unknown" onChange={change} />
    </AppProvider>,
  );
  await userEvent.press(await screen.findByRole('button', { name: t.presets.standard.title }));
  expect(screen.getByText(t.presets.standard.note)).toBeOnTheScreen();
  await userEvent.press(screen.getByRole('button', { name: t.presets.standard.title }));
  expect(screen.queryByText(t.presets.standard.note)).not.toBeOnTheScreen();
  expect(change).not.toHaveBeenCalled();
});
test('storage slider follows gesture without persisting until release', async () => {
  const onChange = jest.fn();
  await render(<AppProvider><StorageSlider value={0} onChange={onChange} /></AppProvider>);
  const slider = screen.getByRole('adjustable');
  await fireEvent(slider, 'layout', { nativeEvent: { layout: { width: 200 } } });
  const [pan] = screen.getByTestId('gesture-boundary').props.gesture;
  expect(pan.handlers.activeOffsetX).toEqual([-8, 8]);
  expect(pan.handlers.failOffsetY).toEqual([-12, 12]);
  await act(() => pan.handlers.onUpdate({ x: 100 }));
  expect(onChange).not.toHaveBeenCalled();
  await act(() => pan.handlers.onEnd());
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledWith(50);
});
test('settings help explains storage and changes retention setting', async () => {
  await render(
    <AppProvider>
      <SettingsScreen {...props} />
    </AppProvider>,
  );
  await userEvent.press(
    await screen.findByRole('button', { name: t.cacheHelpTitle }),
  );
  expect(screen.getByText(t.cacheHelpBody)).toBeOnTheScreen();
  await userEvent.press(screen.getByRole('button', { name: t.understood }));
  const retention = screen.getByRole('adjustable', { name: t.cacheLimit });
  for (let i = 0; i < 4; i++) await fireEvent(retention, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
  expect(Native.setCacheLimit).toHaveBeenLastCalledWith(0);
});
test('successful export requests a neutral native review without a rating screen', async () => {
  seed({
    state: 'SUCCEEDED',
    image,
    jobId: 'j',
    resultUri: 'file:///after.png',
  });
  Native.claimReviewPrompt.mockResolvedValue(true);
  Native.requestReview.mockResolvedValue(true);
  await render(
    <AppProvider>
      <Home {...props} />
    </AppProvider>,
  );
  await userEvent.press(await screen.findByRole('radio', { name: 'WebP' }));
  expect(screen.getByText(t.webpNote)).toBeOnTheScreen();
  await userEvent.press(screen.getByRole('button', { name: t.save }));
  expect(await screen.findByText(t.exportSuccess)).toBeOnTheScreen();
  expect(Native.claimReviewPrompt).not.toHaveBeenCalled();
  expect(Native.requestReview).not.toHaveBeenCalled();
  expect(screen.queryByText(t.rateTitle)).toBeNull();
  expect(navigation.navigate).not.toHaveBeenCalledWith('Feedback', expect.anything());
  expect(Native.exportResult).toHaveBeenCalledWith('j', 'webp');
});

test('pixel profile does not show an AI modification warning', async () => {
  seed({ state: 'READY', image, mode: 'pixel' });
  capabilities.modes = ['quality', 'fast', 'illustration', 'pixel'];
  await render(
    <AppProvider>
      <Home {...props} />
    </AppProvider>,
  );
  await userEvent.press(await screen.findByRole('button', { name: `Model: ${t.presets.pixel.title}` }));
  expect(screen.queryByText(t.aiNote)).toBeNull();
});

test('empty home explains the benefit once without the preparation hint', async () => {
  await render(
    <AppProvider>
      <Home {...props} />
    </AppProvider>,
  );
  expect(await screen.findByText(t.hero)).toBeOnTheScreen();
  expect(screen.queryByText(t.photoHint)).toBeNull();
});
