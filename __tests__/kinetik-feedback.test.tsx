import React from 'react';
import { Skia } from '@shopify/react-native-skia';
import { AccessibilityInfo, Platform, StyleSheet, Text } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { KinetikProvider } from '../src/lib/kinetik/tokens/theme';
import { UsageMeter } from '../src/components/kinetik/usage-meter';
import { NoticeBar } from '../src/components/kinetik/notice-bar';
import { PopDialog } from '../src/components/kinetik/pop-dialog';
import { ProgressBar } from '../src/components/kinetik/progress-bar';
import { ScanProgress } from '../src/components/kinetik/scan-progress';
import { RingSpinner } from '../src/components/kinetik/ring-spinner';

const app = (children: React.ReactNode) => <KinetikProvider scheme="dark">{children}</KinetikProvider>;
function findInstance(root: any, predicate: (node: any) => boolean): any {
  if (!root || typeof root !== 'object') return null;
  if (predicate(root)) return root;
  for (const child of root.children ?? []) {
    const found = findInstance(child, predicate);
    if (found) return found;
  }
  return null;
}
function findInstances(root: any, predicate: (node: any) => boolean): any[] {
  if (!root || typeof root !== 'object') return [];
  const matches = predicate(root) ? [root] : [];
  for (const child of root.children ?? []) matches.push(...findInstances(child, predicate));
  return matches;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove: jest.fn() } as any);
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

test('UsageMeter breakdown exposes mutually disjoint named category shares without an invented capacity', async () => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  const props = {
    title: 'App storage', total: 10, breakdown: true, unit: 'GB',
    segments: [
      { label: 'Sessions', value: 4 },
      { label: 'Model', value: 3 },
      { label: 'Cache', value: 2 },
    ],
  } as const;
  const view = await render(app(<UsageMeter {...props} testID="usage-meter" />));
  const meter = view.getByRole('progressbar', { name: 'App storage' });
  expect(meter.props.accessibilityValue).toEqual({
    min: 0, max: 10, now: 9, text: '9.0 GB. Sessions 4.0 GB, Model 3.0 GB, Cache 2.0 GB',
  });
  expect(view.getByText('9.0')).toBeOnTheScreen();
  expect(view.queryByText(/of 10 GB|left|over/)).toBeNull();

  const track = findInstance(view.getByTestId('usage-meter'), node => typeof node.props?.onLayout === 'function');
  await act(async () => track.props.onLayout({ nativeEvent: { layout: { width: 200, height: 12 } } }));
  await view.rerender(app(<UsageMeter {...props} testID="usage-meter" />));
  const categorySegments = findInstances(view.getByTestId('usage-meter'), node => {
    const style = StyleSheet.flatten(node.props?.style);
    return style?.position === 'absolute' && typeof style.left === 'number' && typeof style.width === 'number';
  });
  expect(categorySegments).toHaveLength(3);
  const geometry = categorySegments.map((segment: any) => {
    const style = segment.props.style.at(-1);
    return { left: style.left, width: style.width };
  });
  expect(geometry[0]).toEqual({ left: 0, width: 79 });
  expect(geometry[1]!.left).toBe(81);
  expect(geometry[1]!.width).toBeCloseTo(58);
  expect(geometry[2]!.left).toBe(141);
  expect(geometry[2]!.width).toBeCloseTo(38);
  expect(geometry[0]!.left + geometry[0]!.width).toBeLessThanOrEqual(geometry[1]!.left);
  expect(geometry[1]!.left + geometry[1]!.width).toBeLessThanOrEqual(geometry[2]!.left);
});

test('UsageMeter reports warning, over-limit, and zero-total states without a legend', async () => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  const formatValue = (value: number) => `$${value}`;
  const view = await render(app(
    <UsageMeter
      title="Local storage"
      total={100}
      unit="MB"
      warnAt={0.75}
      formatValue={formatValue}
      legend={false}
      segments={[{ label: 'Cache', value: 80, displayValue: '80 MB' }]}
      testID="storage-meter-states"
    />,
  ));

  expect(view.getByTestId('storage-meter-states').props.accessibilityValue).toEqual({
    min: 0,
    max: 100,
    now: 80,
    text: '$80 of $100 MB used, $20 MB left. Cache 80 MB',
  });
  expect(view.getByText('$20 MB left')).toBeOnTheScreen();
  expect(view.queryByText('Cache')).toBeNull();

  await view.rerender(app(
    <UsageMeter
      title="Local storage"
      total={100}
      unit="MB"
      formatValue={formatValue}
      legend={false}
      segments={[{ label: 'Cache', value: 120 }, { label: 'Negative input', value: -20 }]}
      testID="storage-meter-states"
    />,
  ));
  expect(view.getByTestId('storage-meter-states').props.accessibilityValue).toMatchObject({
    min: 0,
    max: 100,
    now: 100,
    text: '$120 of $100 MB used, $20 MB over. Cache $120 MB, Negative input $-20 MB',
  });
  expect(view.getByText('$20 MB over')).toBeOnTheScreen();

  await view.rerender(app(
    <UsageMeter
      title="Empty storage"
      total={0}
      unit="MB"
      formatValue={formatValue}
      legend={false}
      segments={[]}
      testID="empty-storage-meter"
    />,
  ));
  expect(view.getByTestId('empty-storage-meter').props.accessibilityValue).toEqual({
    min: 0,
    max: 0,
    now: 0,
    text: '$0 of $0 MB used, $0 MB left. ',
  });
});

test('NoticeBar rotates messages and dismisses after folding', async () => {
  const onDismiss = jest.fn();
  const onAction = jest.fn();
  const messages = [
    { text: 'First update', action: { label: 'Details', onPress: onAction } },
    { text: 'Second update' },
  ];
  const view = await render(app(<NoticeBar testID="notice" messages={messages} interval={10} onDismiss={onDismiss} dismissLabel="Close notice" leading={<Text>•</Text>} />));
  await fireEvent(view.getByTestId('notice'), 'layout', { nativeEvent: { layout: { width: 320, height: 52 } } });
  await act(async () => { await Promise.resolve(); });
  expect(view.getByText('First update')).toBeOnTheScreen();
  expect(view.getByText('•')).toBeOnTheScreen();
  await fireEvent.press(view.getByRole('link', { name: 'Details' }));
  expect(onAction).toHaveBeenCalledTimes(1);
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  expect(view.getByText('Second update')).toBeOnTheScreen();
  expect(view.queryByText('First update')).toBeNull();
  await fireEvent.press(view.getByRole('button', { name: 'Close notice' }));
  expect(onDismiss).toHaveBeenCalledTimes(1);
  expect(view.queryByTestId('notice')).toBeNull();
});

test('NoticeBar does not rotate for a screen reader, a single message, or an empty list', async () => {
  const readers: Array<(enabled: boolean) => void> = [];
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(true);
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((event, listener) => {
    if (event === 'screenReaderChanged') readers.push(listener as (enabled: boolean) => void);
    return { remove: jest.fn() } as any;
  });
  const view = await render(app(<NoticeBar testID="screen-reader-notice" interval={10} messages={[{ text: 'Accessible first' }, { text: 'Accessible second' }]} />));
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
  expect(view.getByText('Accessible first')).toBeOnTheScreen();
  await act(async () => readers.forEach(listener => listener(true)));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
  expect(view.getByText('Accessible first')).toBeOnTheScreen();

  await view.rerender(app(<NoticeBar testID="one-notice" interval={10} messages={[{ text: 'Only message' }]} />));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  expect(view.getByText('Only message')).toBeOnTheScreen();
  await view.rerender(app(<NoticeBar testID="empty-notice" messages={[]} />));
  expect(view.queryByTestId('empty-notice')).toBeNull();
});

test('NoticeBar pauses its real rotation timer while its message Pressable is held', async () => {
  jest.useFakeTimers();
  const view = await render(app(<NoticeBar messages={[{ text: 'Hold this' }, { text: 'Next note' }]} interval={1000} />));
  const touchTarget = view.container.queryAll(node => node.props.accessible === false && typeof node.props.onResponderGrant === 'function')[0];
  expect(touchTarget).toBeTruthy();
  await fireEvent(touchTarget!, 'responderGrant', { nativeEvent: { pageX: 0, pageY: 0, identifier: 1 }, persist: jest.fn() });
  await act(() => { jest.advanceTimersByTime(1500); });
  expect(view.getByText('Hold this')).toBeOnTheScreen();
  await fireEvent(touchTarget!, 'pressOut');
  await act(() => { jest.advanceTimersByTime(1000); });
  expect(view.getByText('Next note')).toBeOnTheScreen();
});

test('NoticeBar keeps rotating if screen-reader detection fails and closes immediately with reduced motion', async () => {
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockRejectedValueOnce(new Error('accessibility unavailable'));
  const rotation = await render(app(<NoticeBar interval={10} messages={[{ text: 'First' }, { text: 'Second' }]} />));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  expect(rotation.getByText('Second')).toBeOnTheScreen();
  await rotation.unmount();

  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  const onDismiss = jest.fn();
  const reduced = await render(app(<NoticeBar messages={[{ text: 'Dismiss now' }]} onDismiss={onDismiss} dismissLabel="Dismiss now" />));
  await fireEvent.press(reduced.getByRole('button', { name: 'Dismiss now' }));
  expect(onDismiss).toHaveBeenCalledTimes(1);
  expect(reduced.queryByText('Dismiss now')).toBeNull();
});

test('NoticeBar skips native screen-reader listeners on web', async () => {
  jest.replaceProperty(Platform, 'OS', 'web');
  const addListener = jest.spyOn(AccessibilityInfo, 'addEventListener');
  const screenReaderCheck = jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled');
  const view = await render(app(<NoticeBar messages={[{ text: 'Web first' }, { text: 'Web second' }]} interval={10} />));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  expect(view.getByText('Web second')).toBeOnTheScreen();
  expect(addListener.mock.calls.filter(([event]) => event === 'screenReaderChanged')).toHaveLength(0);
  expect(screenReaderCheck).not.toHaveBeenCalled();
});

test('PopDialog focuses its title on show, closes on Android Back, backdrop, and accessibility escape', async () => {
  const onClose = jest.fn();
  const setFocus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => Promise.resolve());
  jest.spyOn(require('react-native'), 'findNodeHandle').mockReturnValue(42);
  const view = await render(app(<PopDialog visible title="Confirm export" message="Keep this copy?" actions={[]} onClose={onClose} testID="confirm-dialog" backdropTestID="dialog-backdrop" />));
  expect(view.getByTestId('confirm-dialog')).toBeOnTheScreen();
  const modal = view.getByTestId('confirm-dialog-modal');
  await act(async () => modal.props.onShow());
  expect(setFocus).toHaveBeenCalledTimes(1);
  expect(modal.props.onRequestClose).toBe(onClose);
  const backdrop = view.container.queryAll(node => node.props.testID === 'dialog-backdrop')[0];
  expect(backdrop).toBeTruthy();
  await fireEvent.press(backdrop);
  expect(onClose).toHaveBeenCalledTimes(1);
  const root = findInstance(view.container, node => typeof node.props?.onAccessibilityEscape === 'function');
  await act(() => root.props.onAccessibilityEscape());
  expect(onClose).toHaveBeenCalledTimes(2);
});

test('PopDialog ignores a hidden non-dismissable backdrop and quick reduced-motion re-open remains visible', async () => {
  jest.useFakeTimers();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  const onClose = jest.fn();
  const view = await render(app(<PopDialog visible title="Remove model" actions={[]} onClose={onClose} dismissable={false} testID="model-dialog" backdropTestID="model-backdrop" />));
  await fireEvent.press(view.getByTestId('model-backdrop', { includeHiddenElements: true }));
  expect(onClose).not.toHaveBeenCalled();
  await view.rerender(app(<PopDialog visible={false} title="Remove model" actions={[]} onClose={onClose} dismissable={false} testID="model-dialog" />));
  await view.rerender(app(<PopDialog visible title="Remove model" actions={[]} onClose={onClose} dismissable={false} testID="model-dialog" />));
  expect(view.getByTestId('model-dialog-modal').props.visible).toBe(true);
});

test('ProgressBar reports exact determinate values, completion and indeterminate state without fake advancement', async () => {
  jest.useFakeTimers();
  const view = await render(app(<ProgressBar value={0} active={false} label="Enhancing" testID="progress" />));
  const track = view.container.queryAll(node => typeof node.props?.onLayout === 'function')[0];
  expect(track).toBeTruthy();
  await fireEvent(track!, 'layout', { nativeEvent: { layout: { width: 240, height: 10 } } });
  expect(view.getByTestId('progress').props.accessibilityValue).toEqual({ min: 0, max: 100, now: 0 });
  await view.rerender(app(<ProgressBar value={0.37} active={false} label="Enhancing" testID="progress" />));
  const progress = view.getByTestId('progress');
  expect(progress.props.accessibilityValue.now).toBe(37);
  await act(async () => { jest.advanceTimersByTime(5000); });
  expect(view.getByTestId('progress').props.accessibilityValue.now).toBe(37);
  await view.rerender(app(<ProgressBar value={1} active={false} label="Enhancing" doneLabel="Finished" testID="progress" />));
  expect(view.getByText('Finished')).toBeOnTheScreen();
  expect(view.getByTestId('progress').props.accessibilityState.busy).toBe(false);
  await view.rerender(app(<ProgressBar value={null} active={false} label="Waiting for native progress" testID="progress" />));
  expect(view.getByTestId('progress').props.accessibilityValue).toBeUndefined();
  expect(view.getByTestId('progress').props.accessibilityState.busy).toBe(true);
});

test('ProgressBar supports an active compact visual-only state and measures its track', async () => {
  jest.useFakeTimers();
  const view = await render(app(
    <ProgressBar value={0.65} active size="sm" showValue={false} label="Hidden caption" testID="compact-progress" />,
  ));
  expect(view.getByTestId('compact-progress').props.accessibilityValue).toEqual({ min: 0, max: 100, now: 65 });
  expect(view.getByText('Hidden caption')).toBeOnTheScreen();
  expect(view.queryByText('65%')).toBeNull();
  const track = view.container.queryAll(node => typeof node.props?.onLayout === 'function')[0];
  expect(track).toBeTruthy();
  await act(async () => { await fireEvent(track!, 'layout', { nativeEvent: { layout: { width: 180, height: 6 } } }); });
  await act(async () => { jest.advanceTimersByTime(1000); });
  expect(view.getByTestId('compact-progress').props.accessibilityState.busy).toBe(true);
  await view.unmount();
});

test('ScanProgress distinguishes unknown progress from real zero and 100 percent native values', async () => {
  jest.useFakeTimers();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  const props = { label: 'Restoring', doneLabel: 'Restored', height: 120 };
  const view = await render(app(<ScanProgress {...props} progress={null} />));
  expect(view.getByLabelText('Restoring').props.accessibilityValue).toBeUndefined();
  await view.rerender(app(<ScanProgress {...props} progress={0} />));
  expect(view.getByLabelText('Restoring').props.accessibilityValue.now).toBe(0);
  await view.rerender(app(<ScanProgress {...props} progress={0.64} />));
  expect(view.getByLabelText('Restoring').props.accessibilityValue.now).toBe(64);
  await act(async () => { jest.advanceTimersByTime(60_000); });
  expect(view.getByLabelText('Restoring').props.accessibilityValue.now).toBe(64);
  await view.rerender(app(<ScanProgress {...props} progress={1} />));
  expect(view.getByLabelText('Restoring').props.accessibilityValue.now).toBe(100);
  await view.rerender(app(<ScanProgress {...props} progress={1} done />));
  expect(view.getByLabelText('Restored').props.accessibilityValue).toEqual({ min: 0, max: 100, now: 100 });
});

test('ScanProgress only runs its pixel clock for measured visible unfinished media', async () => {
  const callbacks = ((global as typeof global & { __pixoraFrameCallbacks?: Set<any> }).__pixoraFrameCallbacks ??= new Set());
  const existing = new Set(callbacks);
  const view = await render(
    <KinetikProvider scheme="dark" reduceMotion="never">
      <ScanProgress label="Restoring" progress={0.25} active height={120} source={{ uri: 'file:///photo.png' }} />
    </KinetikProvider>,
  );

  const card = findInstance(view.container, node => {
    const style = StyleSheet.flatten(node.props?.style);
    return typeof node.props?.onLayout === 'function' && style?.height === 120;
  });
  expect(card).not.toBeNull();
  await act(async () => card.props.onLayout({ nativeEvent: { layout: { width: 180, height: 120 } } }));
  const pill = findInstance(view.container, node => {
    const style = StyleSheet.flatten(node.props?.style);
    return typeof node.props?.onLayout === 'function' && style?.height === 60;
  });
  expect(pill).not.toBeNull();
  await act(async () => pill.props.onLayout({ nativeEvent: { layout: { width: 220, height: 60 } } }));
  expect(view.getByLabelText('Restoring').props.accessibilityValue.now).toBe(25);
  const liveCallbacks = (global as typeof global & { __pixoraFrameCallbacks?: Set<any> }).__pixoraFrameCallbacks ?? new Set();
  const pixelClocks = [...liveCallbacks].filter(callback => !existing.has(callback));
  expect(pixelClocks).toHaveLength(1);
  const clock = pixelClocks[0];
  expect(clock.active).toBe(true);
  await act(async () => {
    clock.frame(100);
    for (let frame = 1; frame <= 18; frame++) clock.frame(100 + frame * 16);
  });

  await view.rerender(
    <KinetikProvider scheme="dark" reduceMotion="never">
      <ScanProgress label="Restoring" progress={0.25} active={false} height={120} source={{ uri: 'file:///photo.png' }} />
    </KinetikProvider>,
  );
  expect(clock.active).toBe(false);

  await view.rerender(
    <KinetikProvider scheme="dark" reduceMotion="never">
      <ScanProgress label="Restoring" doneLabel="Restored" progress={1} done height={120} source={{ uri: 'file:///photo.png' }} />
    </KinetikProvider>,
  );
  expect(clock.active).toBe(false);
  expect(view.getByRole('progressbar', { name: 'Restored' })).toHaveAccessibilityValue({ min: 0, max: 100, now: 100 });
});

test('ScanProgress uses its default card height and falls back when Skia rejects the ring path', async () => {
  const parsePath = jest.spyOn(Skia.Path, 'MakeFromSVGString').mockReturnValue(null);
  const fallbackPath = jest.spyOn(Skia.Path, 'Make');
  const view = await render(
    <KinetikProvider scheme="dark" reduceMotion="never">
      <ScanProgress label="Preparing" progress={0.5} />
    </KinetikProvider>,
  );
  const card = findInstance(view.container, node => {
    const style = StyleSheet.flatten(node.props?.style);
    return typeof node.props?.onLayout === 'function' && style?.height === 260;
  });
  expect(card).not.toBeNull();
  await act(async () => card.props.onLayout({ nativeEvent: { layout: { width: 160, height: 260 } } }));
  const pill = findInstance(view.container, node => {
    const style = StyleSheet.flatten(node.props?.style);
    return typeof node.props?.onLayout === 'function' && style?.height === 60;
  });
  await act(async () => pill.props.onLayout({ nativeEvent: { layout: { width: 200, height: 60 } } }));
  expect(parsePath).toHaveBeenCalled();
  expect(fallbackPath).toHaveBeenCalled();
});

test('RingSpinner is static in reduced motion and exposes determinate/success/error values', async () => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => Promise.resolve());
  const view = await render(app(<RingSpinner accessibilityLabel="Working" testID="spinner" />));
  expect(view.getByTestId('spinner').props.accessibilityValue).toBeUndefined();
  await view.rerender(app(<RingSpinner progress={0.42} active={false} accessibilityLabel="Working" testID="spinner" />));
  expect(view.getByTestId('spinner').props.accessibilityValue).toEqual({ min: 0, max: 100, now: 42 });
  await view.rerender(app(<RingSpinner status="success" accessibilityLabel="Result" testID="spinner" />));
  expect(view.getByTestId('spinner').props.accessibilityValue).toEqual({ text: 'Done' });
  expect(announce).toHaveBeenCalledWith('Done');
  await view.rerender(app(<RingSpinner status="error" accessibilityLabel="Result" testID="spinner" />));
  expect(view.getByTestId('spinner').props.accessibilityValue).toEqual({ text: 'Failed' });
  expect(announce).toHaveBeenLastCalledWith('Failed');
});

test('RingSpinner starts and pauses indeterminate motion and clamps spring-driven progress', async () => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  const reanimated = require('react-native-reanimated');
  const cancel = jest.spyOn(reanimated, 'cancelAnimation');
  const view = await render(
    <KinetikProvider scheme="light" reduceMotion="never">
      <RingSpinner active accessibilityLabel="Rendering" size={56} thickness={5} testID="motion-spinner" />
    </KinetikProvider>,
  );

  const spinner = view.getByRole('progressbar', { name: 'Rendering' });
  expect(spinner.props.style).toEqual([{ width: 56, height: 56 }, undefined]);
  expect(cancel).not.toHaveBeenCalled();

  await view.rerender(
    <KinetikProvider scheme="light" reduceMotion="never">
      <RingSpinner active={false} accessibilityLabel="Rendering" size={56} thickness={5} testID="motion-spinner" />
    </KinetikProvider>,
  );
  expect(cancel).toHaveBeenCalled();
  expect(view.getByTestId('motion-spinner').props.accessibilityValue).toBeUndefined();

  await view.rerender(
    <KinetikProvider scheme="light" reduceMotion="never">
      <RingSpinner progress={0.63} accessibilityLabel="Rendering" size={56} thickness={5} testID="motion-spinner" />
    </KinetikProvider>,
  );
  expect(view.getByTestId('motion-spinner').props.accessibilityValue).toEqual({ min: 0, max: 100, now: 63 });
});
