import React from 'react';
import { fireEvent, render, screen, userEvent, act } from '@testing-library/react-native';
import { AccessibilityInfo, Text, View } from 'react-native';
import { AppProvider } from '../src/application/AppProvider';
import { ExpandCard } from '../src/components/kinetik/expand-card';
import { SegmentBar } from '../src/components/kinetik/segment-bar';
import { ThemeSwitch } from '../src/components/kinetik/theme-switch';
import { PressJelly } from '../src/components/kinetik/press-jelly';
import { StarRating } from '../src/components/kinetik/star-rating';
import { PulseToggle } from '../src/components/kinetik/pulse-toggle';
import Native, { seed } from '../tests/nativeMock';

beforeEach(() => {
  jest.clearAllMocks();
  seed();
  Native.getTelemetrySettings.mockResolvedValue({
    analytics: false, crashes: false, noticeSeen: true, consentVersion: 2,
  });
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove: jest.fn() } as any);
});
afterEach(() => jest.restoreAllMocks());

const renderInApp = (children: React.ReactNode) => render(<AppProvider>{children}</AppProvider>);

test('ExpandCard mounts its preview only when open and keeps selection available while closed', async () => {
  const onSelect = jest.fn();
  const user = userEvent.setup();
  await renderInApp(
    <ExpandCard
      title="Balanced"
      subtitle="For mixed photo content"
      selectionSlot={<PressJelly accessibilityLabel="Select Balanced" onPress={onSelect}>Select</PressJelly>}
    >
      <View testID="comparison-preview"><Text>Before and after</Text></View>
    </ExpandCard>,
  );
  expect(screen.queryByTestId('comparison-preview')).toBeNull();
  expect(screen.getByText('For mixed photo content')).toBeOnTheScreen();
  await user.press(screen.getByRole('button', { name: 'Select Balanced' }));
  expect(onSelect).toHaveBeenCalledTimes(1);
  await user.press(screen.getByRole('button', { name: 'Balanced' }));
  expect(screen.getByTestId('comparison-preview')).toBeOnTheScreen();
  await user.press(screen.getByRole('button', { name: 'Balanced' }));
  expect(screen.queryByTestId('comparison-preview')).toBeNull();
});

test('controlled ExpandCard requests changes without changing state until its owner updates it', async () => {
  const onExpandedChange = jest.fn();
  const view = await renderInApp(
    <ExpandCard title="Sharp" expanded={false} onExpandedChange={onExpandedChange}>
      <Text testID="sharp-details">Protected edges</Text>
    </ExpandCard>,
  );
  await userEvent.press(screen.getByRole('button', { name: 'Sharp' }));
  expect(onExpandedChange).toHaveBeenCalledWith(true);
  expect(screen.queryByTestId('sharp-details')).toBeNull();
  await view.rerender(
    <AppProvider><ExpandCard title="Sharp" expanded onExpandedChange={onExpandedChange}>
      <Text testID="sharp-details">Protected edges</Text>
    </ExpandCard></AppProvider>,
  );
  expect(screen.getByTestId('sharp-details')).toBeOnTheScreen();
  await userEvent.press(screen.getByRole('button', { name: 'Sharp' }));
  expect(onExpandedChange).toHaveBeenLastCalledWith(false);
});

test('defaultExpanded opens immediately and can close using the header', async () => {
  await renderInApp(<ExpandCard title="Natural" defaultExpanded><Text testID="natural-preview">Preview</Text></ExpandCard>);
  expect(screen.getByTestId('natural-preview')).toBeOnTheScreen();
  await userEvent.press(screen.getByRole('button', { name: 'Natural' }));
  expect(screen.queryByTestId('natural-preview')).toBeNull();
});

test('SegmentBar measures the selected pill, changes checked option, and disables choices and action together', async () => {
  const onChange = jest.fn();
  const onSave = jest.fn();
  const user = userEvent.setup();
  const options = [
    { value: 'png', label: 'PNG' },
    { value: 'jpeg', label: 'JPEG' },
  ] as const;
  const view = await renderInApp(
    <SegmentBar options={options} value="png" label="Export format" onChange={onChange}
      action={{ icon: <Text>Save</Text>, label: 'Save export', onPress: onSave }} />,
  );
  const group = screen.getByLabelText('Export format');
  expect(group).toBeOnTheScreen();
  const png = screen.getByRole('radio', { name: 'PNG' });
  const jpeg = screen.getByRole('radio', { name: 'JPEG' });
  expect(png.props.accessibilityState).toEqual({ checked: true, disabled: false });
  expect(png.props.onLayout).toEqual(expect.any(Function));
  await user.press(png);
  expect(onChange).not.toHaveBeenCalled();
  await act(async () => png.props.onLayout({ nativeEvent: { layout: { x: 3, width: 80 } } }));
  await view.rerender(
    <AppProvider><SegmentBar options={options} value="png" label="Export format" onChange={onChange}
      action={{ icon: <Text>Save</Text>, label: 'Save export', onPress: onSave }} /></AppProvider>,
  );
  const pill = screen.getByLabelText('Export format').children[0];
  expect(pill).toBeTruthy();
  expect(typeof pill).not.toBe('string');
  if (typeof pill === 'string') throw new Error('SegmentBar pill must be a rendered element');
  expect(pill.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ width: 80, opacity: 1 })]));
  await user.press(jpeg);
  expect(onChange).toHaveBeenCalledWith('jpeg');
  expect(jpeg.props.accessibilityState.checked).toBe(false); // controlled until caller updates value
  await view.rerender(
    <AppProvider><SegmentBar options={options} value="jpeg" label="Export format" onChange={onChange}
      action={{ icon: <Text>Save</Text>, label: 'Save export', onPress: onSave }} /></AppProvider>,
  );
  const selectedJpeg = screen.getByRole('radio', { name: 'JPEG' });
  await act(async () => selectedJpeg.props.onLayout({ nativeEvent: { layout: { x: 91, width: 84 } } }));
  expect(selectedJpeg.props.accessibilityState.checked).toBe(true);
  await user.press(screen.getByRole('button', { name: 'Save export' }));
  expect(onSave).toHaveBeenCalledTimes(1);

  await view.rerender(
    <AppProvider><SegmentBar options={options} value="jpeg" label="Export format" onChange={onChange}
      action={{ icon: <Text>Save</Text>, label: 'Save export', onPress: onSave }} disabled /></AppProvider>,
  );
  expect(screen.getByRole('radio', { name: 'JPEG' }).props.accessibilityState).toEqual({ checked: true, disabled: true });
  expect(screen.getByRole('radio', { name: 'PNG' }).props.accessibilityState.disabled).toBe(true);
  expect(screen.getByRole('button', { name: 'Save export' }).props.accessibilityState.disabled).toBe(true);
  await user.press(screen.getByRole('radio', { name: 'PNG' }));
  await user.press(screen.getByRole('button', { name: 'Save export' }));
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onSave).toHaveBeenCalledTimes(1);
});

test.each([
  ['system', false], ['system', true], ['light', true], ['dark', false],
] as const)('ThemeSwitch directly selects %s while its sun/moon follows systemDark=%s', async (initial, systemDark) => {
  const onValueChange = jest.fn();
  await renderInApp(
    <ThemeSwitch value={initial} systemDark={systemDark} onValueChange={onValueChange}
      label="Appearance" accessibilityLabel="Appearance"
      optionLabels={{ system: 'System', light: 'Light', dark: 'Dark' }} testID="appearance" />,
  );
  const group = screen.getByLabelText('Appearance');
  expect(group).toBeOnTheScreen();
  expect(screen.getAllByRole('radio')).toHaveLength(3);
  expect(screen.getByRole('radio', { name: 'System' }).props.accessibilityState.checked).toBe(initial === 'system');
  await userEvent.press(screen.getByRole('radio', { name: initial === 'light' ? 'Dark' : 'Light' }));
  expect(onValueChange).toHaveBeenCalledWith(initial === 'light' ? 'dark' : 'light');
});

test('ThemeSwitch remains usable with reduced motion and preserves the selected radio mode', async () => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  const onValueChange = jest.fn();
  await renderInApp(<ThemeSwitch value="system" systemDark onValueChange={onValueChange}
    optionLabels={{ system: 'System setting', light: 'Use light', dark: 'Use dark' }} />);
  expect(screen.getByRole('radio', { name: 'System setting' }).props.accessibilityState.checked).toBe(true);
  expect(screen.getByRole('radio', { name: 'Use light' })).toBeOnTheScreen();
  await userEvent.press(screen.getByRole('radio', { name: 'Use dark' }));
  expect(onValueChange).toHaveBeenCalledWith('dark');
  await userEvent.press(screen.getByRole('radio', { name: 'System setting' }));
  expect(onValueChange).not.toHaveBeenCalledWith('system');
});

test('PressJelly forwards pointer and accessible activation, while disabled and loading states block interaction', async () => {
  const onPress = jest.fn();
  const user = userEvent.setup();
  await renderInApp(<PressJelly onPress={onPress} accessibilityHint="Starts the export" accessibilityState={{ selected: true }} testID="save-jelly">Save</PressJelly>);
  const button = screen.getByRole('button', { name: 'Save' });
  expect(button.props.accessibilityHint).toBe('Starts the export');
  expect(button.props.accessibilityState).toMatchObject({ disabled: false, busy: false, selected: true });
  const boundary = screen.getByTestId('gesture-boundary');
  expect(boundary.props.gesture.handlers.enabled).toBe(true);
  await user.press(button);
  expect(onPress).toHaveBeenCalledTimes(1);
  await fireEvent(button, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
  expect(onPress).toHaveBeenCalledTimes(2);

  await screen.rerender(<AppProvider><PressJelly onPress={onPress} disabled testID="disabled-jelly">Disabled</PressJelly>
    <PressJelly onPress={onPress} loading testID="loading-jelly">Loading</PressJelly></AppProvider>);
  expect(screen.getByRole('button', { name: 'Disabled' }).props.accessibilityState.disabled).toBe(true);
  expect(screen.getByRole('button', { name: 'Loading' }).props.accessibilityState).toMatchObject({ disabled: true, busy: true });
  expect(screen.getByRole('button', { name: 'Loading' }).parent?.props.gesture.handlers.enabled).toBe(false);
  await fireEvent(screen.getByRole('button', { name: 'Disabled' }), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
  await fireEvent(screen.getByRole('button', { name: 'Loading' }), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
  expect(onPress).toHaveBeenCalledTimes(2);
});

test('PressJelly names non-text children when an explicit accessible label is provided', async () => {
  await renderInApp(
    <PressJelly accessibilityLabel="Export image" onPress={jest.fn()}>
      <Text>↗</Text>
    </PressJelly>,
  );
  expect(screen.getByRole('button', { name: 'Export image' })).toBeOnTheScreen();
});

test('PressJelly keeps its minimum target while allowing long labels to wrap and grow', async () => {
  await renderInApp(
    <PressJelly block size="md" testID="long-action">
      Delete model and downloaded package
    </PressJelly>,
  );

  const button = screen.getByRole('button', { name: 'Delete model and downloaded package' });
  expect(button).toHaveStyle({ minHeight: 48, paddingVertical: 8, maxWidth: '100%' });
  expect(button).not.toHaveStyle({ height: 48 });
  const label = screen.getByText('Delete model and downloaded package');
  expect(label.props.numberOfLines).toBeUndefined();
  expect(label).toHaveStyle({ flexShrink: 1, textAlign: 'center' });
});

test('StarRating supports accessible increment/decrement, star tap, drag, clear, read-only, and disabled states', async () => {
  const onValueChange = jest.fn();
  const view = await renderInApp(<StarRating value={2} onValueChange={onValueChange} accessibilityLabel="Satisfaction" testID="stars" />);
  const stars = screen.getByRole('adjustable', { name: 'Satisfaction' });
  expect(stars.props.accessibilityValue).toEqual({ min: 0, max: 5, now: 2, text: '2 of 5 stars' });
  await fireEvent(stars, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
  expect(onValueChange).toHaveBeenLastCalledWith(3);
  await view.rerender(<AppProvider><StarRating value={3} onValueChange={onValueChange} accessibilityLabel="Satisfaction" testID="stars" /></AppProvider>);
  const tapBoundary = screen.getByTestId('gesture-boundary');
  const [, tap] = tapBoundary.props.gesture;
  await act(async () => tap.handlers.onEnd({ x: 80 }, true));
  expect(onValueChange).toHaveBeenLastCalledWith(0); // tapping the current second star clears it
  const [pan] = screen.getByTestId('gesture-boundary').props.gesture;
  await act(async () => pan.handlers.onUpdate({ x: 100 }));
  expect(onValueChange).toHaveBeenLastCalledWith(3);

  await view.rerender(<AppProvider><StarRating value={4} onValueChange={onValueChange} disabled accessibilityLabel="Satisfaction" /></AppProvider>);
  await fireEvent(screen.getByRole('adjustable', { name: 'Satisfaction' }), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
  expect(onValueChange).toHaveBeenLastCalledWith(3);
  await view.rerender(<AppProvider><StarRating value={4} accessibilityLabel="Saved rating" /></AppProvider>);
  expect(screen.getByRole('image', { name: 'Saved rating: 4 of 5 stars' })).toBeOnTheScreen();
  expect(screen.queryByRole('adjustable', { name: 'Saved rating' })).toBeNull();
});

test('StarRating supports half-star accessibility steps and clearable=false keeps a selected value', async () => {
  const halfChange = jest.fn();
  const half = await renderInApp(<StarRating value={0} onValueChange={halfChange} allowHalf accessibilityLabel="Fine rating" />);
  const stars = screen.getByRole('adjustable', { name: 'Fine rating' });
  expect(stars.props.accessibilityValue).toEqual({ min: 0, max: 5, now: 0, text: '0 of 5 stars' });
  await fireEvent(stars, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
  expect(halfChange).toHaveBeenCalledWith(0.5);
  await half.rerender(<AppProvider><StarRating value={0.5} onValueChange={halfChange} allowHalf clearable={false} accessibilityLabel="Fine rating" /></AppProvider>);
  const boundary = screen.getByTestId('gesture-boundary');
  const [, tap] = boundary.props.gesture;
  await act(async () => tap.handlers.onEnd({ x: 0 }, true));
  expect(halfChange).toHaveBeenLastCalledWith(0.5);
});

test('StarRating separates visual previews from tap, drag-end, and accessibility commits', async () => {
  const preview = jest.fn();
  const commit = jest.fn();
  await renderInApp(
    <StarRating value={1} onValueChange={preview} onValueCommit={commit} clearable={false} accessibilityLabel="Committed rating" />,
  );
  const stars = screen.getByRole('adjustable', { name: 'Committed rating' });
  await fireEvent(stars, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
  expect(preview).toHaveBeenLastCalledWith(2);
  expect(commit).not.toHaveBeenCalled();
  await fireEvent(stars, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
  expect(commit).toHaveBeenCalledWith(2);

  const [pan, tap] = screen.getByTestId('gesture-boundary').props.gesture;
  await act(async () => tap.handlers.onEnd({ x: 120 }, true));
  expect(preview).toHaveBeenLastCalledWith(4);
  expect(commit).toHaveBeenLastCalledWith(4);
  await act(async () => pan.handlers.onUpdate({ x: 170 }));
  expect(preview).toHaveBeenLastCalledWith(5);
  expect(commit).toHaveBeenCalledTimes(2);
  await act(async () => pan.handlers.onEnd({ x: 170 }, true));
  expect(commit).toHaveBeenLastCalledWith(5);
});

test('PulseToggle supports successful and cancelled gestures plus accessible activation', async () => {
  const onValueChange = jest.fn();
  const view = await renderInApp(
    <PulseToggle value={false} onValueChange={onValueChange} label="Use detail mode"
      description="Keep fine texture" size="sm" activeColor="#7040ff" haptics={false} />,
  );
  const toggle = screen.getByRole('switch', { name: 'Use detail mode' });
  expect(toggle.props.accessibilityHint).toBe('Keep fine texture');
  const gesture = screen.getByTestId('gesture-boundary').props.gesture;
  gesture.handlers.onBegin?.();
  gesture.handlers.onFinalize?.();
  gesture.handlers.onEnd?.({}, false);
  expect(onValueChange).not.toHaveBeenCalled();
  gesture.handlers.onEnd?.({}, true);
  expect(onValueChange).toHaveBeenLastCalledWith(true);
  await fireEvent(toggle, 'accessibilityAction', { nativeEvent: { actionName: 'unknown' } });
  expect(onValueChange).toHaveBeenCalledTimes(1);
  await fireEvent(toggle, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
  expect(onValueChange).toHaveBeenLastCalledWith(true);

  await view.rerender(<AppProvider><PulseToggle value disabled accessibilityLabel="Locked toggle" onValueChange={onValueChange} haptics={false} /></AppProvider>);
  const disabled = screen.getByRole('switch', { name: 'Locked toggle' });
  expect(disabled.props.hitSlop).toEqual({ top: 8, bottom: 8, left: 8, right: 8 });
  expect(screen.getByTestId('gesture-boundary').props.gesture.handlers.enabled).toBe(false);
  await fireEvent(disabled, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
  expect(onValueChange).toHaveBeenCalledTimes(2);
});

test('PulseToggle uses the reduced-motion path while syncing its checked value', async () => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  const onValueChange = jest.fn();
  const view = await renderInApp(<PulseToggle value={false} onValueChange={onValueChange} accessibilityLabel="Compact toggle" haptics={false} />);
  const toggle = screen.getByRole('switch', { name: 'Compact toggle' });
  expect(toggle.props.hitSlop).toEqual({ top: 8, bottom: 8, left: 8, right: 8 });
  await view.rerender(<AppProvider><PulseToggle value onValueChange={onValueChange} accessibilityLabel="Compact toggle" haptics={false} /></AppProvider>);
  expect(screen.getByRole('switch', { name: 'Compact toggle' }).props.accessibilityState.checked).toBe(true);
});

test('StarRating snaps with reduced motion and clamps accessibility decrements at zero', async () => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  const onValueChange = jest.fn();
  const view = await renderInApp(<StarRating value={1} onValueChange={onValueChange} allowHalf color="#7040ff" haptics={false} />);
  const stars = screen.getByRole('adjustable', { name: 'Rating' });
  await fireEvent(stars, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
  expect(onValueChange).toHaveBeenLastCalledWith(0.5);
  await view.rerender(<AppProvider><StarRating value={0.5} onValueChange={onValueChange} allowHalf color="#7040ff" haptics={false} /></AppProvider>);
  await fireEvent(screen.getByRole('adjustable', { name: 'Rating' }), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
  expect(onValueChange).toHaveBeenLastCalledWith(0);
  await fireEvent(screen.getByRole('adjustable', { name: 'Rating' }), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
  expect(onValueChange).toHaveBeenCalledTimes(2);
});

test('StarRating commits only successful tap and pan gestures, once at the final dragged value', async () => {
  const preview = jest.fn();
  const commit = jest.fn();
  await renderInApp(
    <StarRating value={1} onValueChange={preview} onValueCommit={commit} clearable={false} accessibilityLabel="Final rating" />,
  );
  const [pan, tap] = screen.getByTestId('gesture-boundary').props.gesture;

  await act(async () => tap.handlers.onEnd({ x: 160 }, false));
  expect(preview).not.toHaveBeenCalled();
  expect(commit).not.toHaveBeenCalled();

  await act(async () => {
    pan.handlers.onUpdate({ x: 0 });
    pan.handlers.onUpdate({ x: 80 });
    pan.handlers.onUpdate({ x: 160 });
  });
  expect(preview).toHaveBeenLastCalledWith(5);
  expect(commit).not.toHaveBeenCalled();
  await act(async () => pan.handlers.onEnd({ x: 160 }, false));
  expect(commit).not.toHaveBeenCalled();

  await act(async () => pan.handlers.onEnd({ x: 160 }, true));
  expect(commit).toHaveBeenCalledTimes(1);
  expect(commit).toHaveBeenCalledWith(5);
});
