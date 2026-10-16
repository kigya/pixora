import React from 'react';
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
import { ReviewDialog } from '../src/ui/feedback';
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
  expect(screen.getByRole('button', { name: t.send })).toBeDisabled();
  await userEvent.press(screen.getByRole('button', { name: t.back }));
  expect(navigation.goBack).toHaveBeenCalled();
});
test('feedback validates reply email and message; failures retain text and retry id', async () => {
  Native.getFeedbackStatus.mockResolvedValue(true);
  await render(
    <AppProvider>
      <FeedbackScreen {...{ ...props, route: { params: { rating: 4 } } }} />
    </AppProvider>,
  );
  const send = await screen.findByRole('button', {
    name: t.send,
    disabled: false,
  });
  await userEvent.press(send);
  expect(screen.getByText(t.invalidEmail)).toBeOnTheScreen();
  await userEvent.type(screen.getByLabelText(t.email), 'person@example.com');
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
    'person@example.com',
    'A useful question',
    4,
    id,
  );
  expect(send).toBeDisabled();
  await userEvent.press(screen.getByRole('radio', { name: '5 / 5' }));
  expect(send).toBeEnabled();
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
test('all processing choices use native capability IDs and real examples', async () => {
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
  await userEvent.press(
    await screen.findByRole('button', {
      name: `${t.profileTitle}: ${t.presets.standard.title}`,
    }),
  );
  await userEvent.press(
    screen.getByRole('button', { name: t.presets.art.title }),
  );
  expect(change).toHaveBeenCalledWith('art');
  await userEvent.press(
    screen.getByRole('button', {
      name: `${t.profileTitle}: ${t.presets.standard.title}`,
    }),
  );
  await userEvent.press(
    screen.getByRole('button', { name: t.presets.pixel.title }),
  );
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
test('review dialog routes a low rating to private feedback', async () => {
  const onFeedback = jest.fn(),
    onClose = jest.fn();
  await render(
    <AppProvider>
      <ReviewDialog visible onClose={onClose} onFeedback={onFeedback} />
    </AppProvider>,
  );
  await userEvent.press(screen.getByRole('radio', { name: '1 / 5' }));
  expect(screen.getByRole('button', { name: t.continue })).toBeEnabled();
  await userEvent.press(screen.getByRole('button', { name: t.continue }));
  expect(onFeedback).toHaveBeenCalledWith(1);
  expect(onClose).toHaveBeenCalled();
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
test('Arabic feedback and rating controls keep an LTR reply address', async () => {
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
  await userEvent.press(screen.getAllByRole('radio')[2]);
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
  await userEvent.press(
    await screen.findByRole('button', {
      name: `${t.profileTitle}: ${t.presets.standard.title}`,
    }),
  );
  await fireEvent.press(screen.getByTestId('information-backdrop'));
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
  await userEvent.press(screen.getByRole('button', { name: t.cacheNo }));
  expect(Native.setCacheLimit).toHaveBeenCalledWith(0);
});
test('successful saved experience prompts with rating routing and forwards personal stars', async () => {
  seed({
    state: 'SUCCEEDED',
    image,
    jobId: 'j',
    resultUri: 'file:///after.png',
  });
  Native.claimReviewPrompt.mockResolvedValue(true);
  await render(
    <AppProvider>
      <Home {...props} />
    </AppProvider>,
  );
  await userEvent.press(await screen.findByRole('radio', { name: 'WebP' }));
  expect(screen.getByText(t.webpNote)).toBeOnTheScreen();
  await userEvent.press(screen.getByRole('button', { name: t.save }));
  expect(await screen.findByText(t.rateTitle)).toBeOnTheScreen();
  await userEvent.press(screen.getByRole('radio', { name: '4 / 5' }));
  await userEvent.press(screen.getByRole('button', { name: t.continue }));
  expect(navigation.navigate).toHaveBeenCalledWith('Feedback', expect.objectContaining({ rating: 4, context: expect.objectContaining({ attempt_token: 'j', profile_id: 'standard' }) }));
  expect(Native.exportResult).toHaveBeenCalledWith('j', 'webp');
});
test.each([false, true])(
  'Pixora Play navigation requires confirmation, cancellation=%s',
  async cancel => {
    const { Linking } = require('react-native');
    const link = jest
      .spyOn(Linking, 'openURL')
      .mockRejectedValueOnce(new Error('no browser'));
    const close = jest.fn();
    await render(
      <AppProvider>
        <ReviewDialog visible onClose={close} onFeedback={() => {}} />
      </AppProvider>,
    );
    await userEvent.press(screen.getByRole('radio', { name: '5 / 5' }));
    await userEvent.press(screen.getByRole('button', { name: t.continue }));
    expect(screen.getByText(t.playTest)).toBeOnTheScreen();
    await userEvent.press(
      screen.getByRole('button', { name: cancel ? t.cancel : t.open }),
    );
    if (cancel) expect(link).not.toHaveBeenCalled();
    else expect(link).toHaveBeenCalledWith('https://play.google.com/store/apps/details?id=dev.kigya.pixora');
    link.mockRestore();
    await userEvent.press(screen.getByRole('button', { name: t.notNow }));
    expect(close).toHaveBeenCalled();
  },
);

test('personal rating can be removed by selecting the same star', async () => {
  const onFeedback = jest.fn();
  await render(
    <AppProvider>
      <ReviewDialog visible onClose={() => {}} onFeedback={onFeedback} />
    </AppProvider>,
  );
  await userEvent.press(screen.getByRole('radio', { name: '2 / 5' }));
  await userEvent.press(screen.getByRole('radio', { name: '2 / 5' }));
  await userEvent.press(screen.getByRole('button', { name: t.continue }));
  expect(onFeedback).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: t.continue })).toBeDisabled();
});

test('pixel profile does not show an AI modification warning', async () => {
  seed({ state: 'READY', image, mode: 'pixel' });
  await render(
    <AppProvider>
      <Home {...props} />
    </AppProvider>,
  );
  expect(await screen.findByText(t.presets.pixel.note)).toBeOnTheScreen();
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
