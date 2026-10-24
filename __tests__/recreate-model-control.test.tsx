import React from 'react';
import { render, screen, userEvent, act, waitFor } from '@testing-library/react-native';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import { AppProvider } from '../src/application/AppProvider';
import { RecreateModelControl } from '../src/ui/recreateModelControl';
import { formatStorage } from '../src/domain/storage';
import { strings } from '../src/ui/i18n';
import Native, { emitRecreateModel, recreateListeners, seed } from '../tests/nativeMock';

const t = strings.en;
let appStateListeners: Array<(state: AppStateStatus) => void> = [];
const appStateSpy = jest.spyOn(AppState, 'addEventListener');
function findInstance(root: any, predicate: (node: any) => boolean): any {
  if (!root || typeof root !== 'object') return null;
  if (predicate(root)) return root;
  for (const child of root.children ?? []) {
    const found = findInstance(child, predicate);
    if (found) return found;
  }
  return null;
}

beforeEach(() => {
  jest.clearAllMocks();
  appStateListeners = [];
  appStateSpy.mockReset().mockImplementation((_event, listener) => {
    appStateListeners.push(listener as (state: AppStateStatus) => void);
    return { remove: jest.fn() } as any;
  });
  Native.getNotificationStatus.mockReset();
  Native.getNotificationStatus.mockResolvedValue(false);
  seed();
});

test('download terms disclose package size and cancel leaves model absent', async () => {
  await render(<AppProvider><RecreateModelControl /></AppProvider>);
  await userEvent.press(await screen.findByRole('button', { name: t.recreate.download }));
  expect(screen.getAllByText(new RegExp(formatStorage(1881812340, 'en').replace('.', '\\.')))).toHaveLength(2);
  await userEvent.press(screen.getByRole('button', { name: t.cancel }));
  expect(Native.downloadRecreateModel).not.toHaveBeenCalled();
});

test('native dialog dismissal closes consent without starting a download', async () => {
  const view = await render(<AppProvider><RecreateModelControl /></AppProvider>);
  await userEvent.press(await screen.findByRole('button', { name: t.recreate.download }));
  const modal = findInstance(view.container, node => typeof node.props?.onRequestClose === 'function');
  expect(modal).not.toBeNull();
  await act(async () => modal.props.onRequestClose());
  expect(screen.queryByText(t.recreate.terms)).not.toBeOnTheScreen();
  expect(Native.downloadRecreateModel).not.toHaveBeenCalled();
});

test('explicit terms acceptance continues after notification refusal and reports byte progress', async () => {
  const platform = Object.getOwnPropertyDescriptor(Platform, 'OS');
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  seed({}, { notificationIntroSeen: false });
  try {
    await render(<AppProvider><RecreateModelControl /></AppProvider>);
    await userEvent.press(await screen.findByRole('button', { name: t.recreate.download }));
    await userEvent.press(screen.getByRole('button', { name: t.recreate.acceptDownload }));
    expect(await screen.findByText(t.recreate.notificationBody)).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: t.notificationWithoutContinue }));
    expect(Native.markNotificationIntroSeen).toHaveBeenCalledTimes(1);
    expect(Native.requestNotifications).not.toHaveBeenCalled();
    expect(Native.downloadRecreateModel).toHaveBeenCalledTimes(1);
    await act(async () => { emitRecreateModel({ state: 'downloading', downloadedBytes: 950000000, totalBytes: 1881812340 }); });
    expect(screen.getByText(`${formatStorage(950000000, 'en')} / ${formatStorage(1881812340, 'en')}`)).toBeOnTheScreen();
    expect(screen.getByRole('progressbar', { name: t.recreate.downloading })).toHaveAccessibilityValue({ min: 0, max: 100, now: 50 });
  } finally {
    if (platform) Object.defineProperty(Platform, 'OS', platform);
  }
});

test('integrity rejection is visible and retry can restart the accepted download', async () => {
  Native.downloadRecreateModel.mockImplementationOnce(async () => emitRecreateModel({ state: 'failed', error: 'MODEL_HASH_MISMATCH' }));
  await render(<AppProvider><RecreateModelControl /></AppProvider>);
  await userEvent.press(await screen.findByRole('button', { name: t.recreate.download }));
  await userEvent.press(screen.getByRole('button', { name: t.recreate.acceptDownload }));
  expect(await screen.findByRole('alert')).toHaveTextContent(t.errors.INFERENCE_FAILED);
  await userEvent.press(screen.getByRole('button', { name: t.recreate.retry }));
  await userEvent.press(screen.getByRole('button', { name: t.recreate.acceptDownload }));
  expect(Native.downloadRecreateModel).toHaveBeenCalledTimes(2);
});

test('ready model reports installed bytes even when the native total is absent', async () => {
  seed();
  emitRecreateModel({ state: 'ready', totalBytes: 0, installedBytes: 1881812340 });
  await render(<AppProvider><RecreateModelControl /></AppProvider>);
  expect(await screen.findByText(`${t.recreate.model}: ${formatStorage(1881812340, 'en')}`)).toBeOnTheScreen();
  expect(screen.getByText(t.recreate.ready)).toBeOnTheScreen();
});

test('compact model control hides itself once the verified model is ready', async () => {
  seed();
  emitRecreateModel({ state: 'ready', installedBytes: 1881812340 });
  const onStateChange = jest.fn();
  await render(<AppProvider><RecreateModelControl compact onStateChange={onStateChange} /></AppProvider>);

  await waitFor(() => expect(onStateChange).toHaveBeenCalledWith(expect.objectContaining({ state: 'ready', installedBytes: 1881812340 })));
  expect(screen.queryByText(`${t.recreate.model}: ${formatStorage(1881812340, 'en')}`)).toBeNull();
  expect(screen.queryByRole('button', { name: t.recreate.download })).not.toBeOnTheScreen();
  expect(screen.queryByText(t.recreate.licenses)).not.toBeOnTheScreen();
});

test('model state refresh failure is non-blocking and keeps the download action available', async () => {
  Native.getRecreateModelState.mockRejectedValueOnce(new Error('model status unavailable'));
  await render(<AppProvider><RecreateModelControl /></AppProvider>);
  expect(await screen.findByRole('button', { name: t.recreate.download })).toBeEnabled();
  expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
});

test('late native model notification after unmount is ignored', async () => {
  const onStateChange = jest.fn();
  const view = await render(<AppProvider><RecreateModelControl onStateChange={onStateChange} /></AppProvider>);
  await screen.findByRole('button', { name: t.recreate.download });
  await waitFor(() => expect(onStateChange).toHaveBeenCalled());
  const lateUpdate = [...recreateListeners][0];
  expect(lateUpdate).toBeDefined();
  const callsBeforeUnmount = onStateChange.mock.calls.length;
  await view.unmount();
  await act(async () => lateUpdate?.({ state: 'ready', downloadedBytes: 0, totalBytes: 1881812340, installedBytes: 1881812340, error: '' }));
  expect(onStateChange).toHaveBeenCalledTimes(callsBeforeUnmount);
});

test('license flow opens locally and returns to download terms', async () => {
  await render(<AppProvider><RecreateModelControl /></AppProvider>);
  await userEvent.press(screen.getByRole('link', { name: `${t.recreate.licenses} ↗` }));
  expect(await screen.findByText('Local license text')).toBeOnTheScreen();
  await userEvent.press(screen.getByRole('button', { name: t.back }));
  expect(await screen.findByText(t.recreate.terms, { exact: false })).toBeOnTheScreen();
  await userEvent.press(screen.getByRole('button', { name: t.cancel }));
  expect(Native.downloadRecreateModel).not.toHaveBeenCalled();
});

test('license loading errors are presented without starting a model download', async () => {
  Native.getLegalText.mockRejectedValueOnce(new Error('license storage unavailable'));
  await render(<AppProvider><RecreateModelControl /></AppProvider>);
  await userEvent.press(screen.getByRole('link', { name: `${t.recreate.licenses} ↗` }));
  expect(await screen.findByRole('alert')).toHaveTextContent(t.errors.INFERENCE_FAILED);
  expect(Native.downloadRecreateModel).not.toHaveBeenCalled();
});

test('ready model deletion requires confirmation and can be dismissed or accepted', async () => {
  emitRecreateModel({ state: 'ready', installedBytes: 1881812340 });
  await render(<AppProvider><RecreateModelControl allowDelete /></AppProvider>);
  await userEvent.press(await screen.findByRole('button', { name: t.recreate.delete }));
  expect(await screen.findByText(t.recreate.deleteConfirm)).toBeOnTheScreen();
  await userEvent.press(screen.getByRole('button', { name: t.cancel }));
  expect(Native.deleteRecreateModel).not.toHaveBeenCalled();

  await userEvent.press(screen.getByRole('button', { name: t.recreate.delete }));
  await userEvent.press(await screen.findByRole('button', { name: t.delete }));
  expect(Native.deleteRecreateModel).toHaveBeenCalledTimes(1);
  expect(await screen.findByRole('button', { name: t.recreate.download })).toBeOnTheScreen();
});

test.each([
  ['paused', { downloadedBytes: 734003200 }],
  ['failed', { downloadedBytes: 1881812340, error: 'MODEL_HASH_MISMATCH' }],
] as const)('%s partial model data can be deleted after confirmation', async (state, retained) => {
  emitRecreateModel({ state, ...retained });
  await render(<AppProvider><RecreateModelControl allowDelete /></AppProvider>);
  await userEvent.press(await screen.findByRole('button', { name: t.recreate.delete }));
  expect(await screen.findByText(t.recreate.deleteConfirm)).toBeOnTheScreen();
  await userEvent.press(screen.getByRole('button', { name: t.delete }));
  expect(Native.deleteRecreateModel).toHaveBeenCalledTimes(1);
});

test.each([
  ['paused', { downloadedBytes: 0, installedBytes: 0 }],
  ['failed', { downloadedBytes: 0, installedBytes: 0 }],
  ['downloading', { downloadedBytes: 734003200 }],
  ['verifying', { downloadedBytes: 1881812340 }],
] as const)('%s model without an available deletion action cannot be removed', async (state, bytes) => {
  emitRecreateModel({ state, ...bytes });
  await render(<AppProvider><RecreateModelControl allowDelete /></AppProvider>);
  expect(await screen.findByText(`${t.recreate.model}: ${formatStorage(1881812340, 'en')}`)).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: t.recreate.delete })).toBeNull();
  expect(Native.deleteRecreateModel).not.toHaveBeenCalled();
});

test('Android notification opt-in is requested only after explicit consent', async () => {
  const platform = Object.getOwnPropertyDescriptor(Platform, 'OS');
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  seed({}, { notificationIntroSeen: false });
  try {
    await render(<AppProvider><RecreateModelControl /></AppProvider>);
    await userEvent.press(await screen.findByRole('button', { name: t.recreate.download }));
    await userEvent.press(screen.getByRole('button', { name: t.recreate.acceptDownload }));
    await userEvent.press(await screen.findByRole('button', { name: t.notificationEnableContinue }));
    expect(Native.markNotificationIntroSeen).toHaveBeenCalledTimes(1);
    expect(Native.requestNotifications).toHaveBeenCalledTimes(1);
    expect(Native.downloadRecreateModel).toHaveBeenCalledTimes(1);
  } finally {
    if (platform) Object.defineProperty(Platform, 'OS', platform);
  }
});

test('backgrounding the Android notification explainer cancels the pending download', async () => {
  const platform = Object.getOwnPropertyDescriptor(Platform, 'OS');
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  seed({}, { notificationIntroSeen: false });
  let view: Awaited<ReturnType<typeof render>> | undefined;
  try {
    view = await render(<AppProvider><RecreateModelControl /></AppProvider>);
    await userEvent.press(await screen.findByRole('button', { name: t.recreate.download }));
    await userEvent.press(screen.getByRole('button', { name: t.recreate.acceptDownload }));
    expect(await screen.findByText(t.recreate.notificationBody)).toBeOnTheScreen();
    await act(async () => appStateListeners.forEach(listener => listener('background')));
    expect(screen.queryByText(t.recreate.notificationBody)).not.toBeOnTheScreen();
    expect(Native.markNotificationIntroSeen).not.toHaveBeenCalled();
    expect(Native.requestNotifications).not.toHaveBeenCalled();
    expect(Native.downloadRecreateModel).not.toHaveBeenCalled();
  } finally {
    await view?.unmount();
    if (platform) Object.defineProperty(Platform, 'OS', platform);
  }
});

test('verification has indeterminate progress and cancel leaves a resumable paused model', async () => {
  emitRecreateModel({ state: 'verifying', downloadedBytes: 1881812340 });
  await render(<AppProvider><RecreateModelControl /></AppProvider>);
  const progress = await screen.findByRole('progressbar', { name: t.recreate.verifying });
  expect(progress.props.accessibilityValue).toBeUndefined();
  await userEvent.press(screen.getByRole('button', { name: t.recreate.cancelDownload }));
  expect(Native.cancelRecreateDownload).toHaveBeenCalledTimes(1);
  expect(await screen.findByRole('button', { name: t.recreate.retry })).toBeOnTheScreen();
});

test('download rejection is shown and leaves the explicit retry action available', async () => {
  Native.downloadRecreateModel.mockRejectedValueOnce(new Error('storage is full'));
  await render(<AppProvider><RecreateModelControl /></AppProvider>);
  await userEvent.press(await screen.findByRole('button', { name: t.recreate.download }));
  await userEvent.press(screen.getByRole('button', { name: t.recreate.acceptDownload }));
  expect(await screen.findByRole('alert')).toHaveTextContent(t.errors.INFERENCE_FAILED);
  expect(screen.getByRole('button', { name: t.recreate.download })).toBeEnabled();
});

test('rapid duplicate consent activation starts only one native model download', async () => {
  let finishDownload: ((value: ReturnType<typeof emitRecreateModel>) => void) | undefined;
  Native.downloadRecreateModel.mockImplementationOnce(() => new Promise(resolve => { finishDownload = resolve; }));
  await render(<AppProvider><RecreateModelControl /></AppProvider>);
  await userEvent.press(await screen.findByRole('button', { name: t.recreate.download }));
  const consent = screen.getByRole('button', { name: t.recreate.acceptDownload });
  await act(async () => {
    consent.props.onPress();
    consent.props.onPress();
    await Promise.resolve();
  });
  expect(Native.downloadRecreateModel).toHaveBeenCalledTimes(1);
  await act(async () => finishDownload?.(emitRecreateModel({ state: 'downloading' })));
});

test('Android with notification permission already granted skips the explainer', async () => {
  const platform = Object.getOwnPropertyDescriptor(Platform, 'OS');
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  seed({}, { notificationIntroSeen: false });
  Native.getNotificationStatus.mockResolvedValue(true);
  try {
    await render(<AppProvider><RecreateModelControl /></AppProvider>);
    await userEvent.press(await screen.findByRole('button', { name: t.recreate.download }));
    await userEvent.press(screen.getByRole('button', { name: t.recreate.acceptDownload }));
    expect(Native.downloadRecreateModel).toHaveBeenCalledTimes(1);
    expect(Native.markNotificationIntroSeen).not.toHaveBeenCalled();
    expect(Native.requestNotifications).not.toHaveBeenCalled();
    expect(screen.queryByText(t.recreate.notificationBody)).not.toBeOnTheScreen();
  } finally {
    if (platform) Object.defineProperty(Platform, 'OS', platform);
  }
});

test('failed model state without a native error uses the localized fallback', async () => {
  emitRecreateModel({ state: 'failed', error: '' });
  await render(<AppProvider><RecreateModelControl /></AppProvider>);
  expect(await screen.findByRole('alert')).toHaveTextContent(t.recreate.downloadFailed);
});
