import React from 'react';
import { act, fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { Text } from 'react-native';
import { KinetikProvider } from '../src/lib/kinetik/tokens/theme';
import { CompareSlider } from '../src/components/kinetik/compare-slider';
import { ElasticSlider } from '../src/components/kinetik/elastic-slider';
import { StepSlider } from '../src/components/kinetik/step-slider';
import { MorphSelect } from '../src/components/kinetik/morph-select';
import { PressJelly } from '../src/components/kinetik/press-jelly';

type GestureDescriptor = { handlers: Record<string, ((...args: any[]) => unknown) | unknown> };

const renderKinetik = (
  children: React.ReactNode,
  reducedMotion: 'always' | 'never' = 'never',
) => render(
  <KinetikProvider scheme="light" reduceMotion={reducedMotion} haptics={false}>{children}</KinetikProvider>,
);

async function setLayout(node: { props: Record<string, any> }, width: number) {
  expect(node.props.onLayout).toEqual(expect.any(Function));
  await act(async () => node.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width, height: 48 } } }));
}

function gesture(testID: string): GestureDescriptor {
  const boundary = screen.getAllByTestId('gesture-boundary').find((node) => {
    const list = Array.isArray(node.props.gesture) ? node.props.gesture.flat() : [node.props.gesture];
    return list.some((item: GestureDescriptor) => item.handlers.withTestId === testID);
  });
  if (!boundary) throw new Error(`Missing gesture boundary for ${testID}`);
  const list = Array.isArray(boundary.props.gesture) ? boundary.props.gesture.flat() : [boundary.props.gesture];
  return list.find((item: GestureDescriptor) => item.handlers.withTestId === testID) as GestureDescriptor;
}

async function fireGesture(testID: string, phase: 'onBegin' | 'onStart' | 'onUpdate' | 'onEnd' | 'onFinalize', event: { x: number; y?: number }) {
  const target = gesture(testID);
  if (target.handlers.enabled === false) return;
  const callback = target.handlers[phase];
  if (typeof callback !== 'function') throw new Error(`Missing ${phase} handler for ${testID}`);
  await act(async () => callback(event, true));
}

const event = (actionName: 'increment' | 'decrement') => ({ nativeEvent: { actionName } });

test('CompareSlider adjusts through accessibility, clips through measured pan/tap bounds, and honours Reduce Motion', async () => {
  const onPositionChange = jest.fn();
  const view = await renderKinetik(
    <CompareSlider before={<Text>Before image</Text>} after={<Text>After image</Text>}
      accessibilityLabel="Result comparison" beforeLabel="Before" afterLabel="After"
      initial={0.5} hint={false} haptics={false} onPositionChange={onPositionChange} testID="result-compare" />,
    'always',
  );
  const control = screen.getByRole('adjustable', { name: 'Result comparison' });
  expect(control.props.accessibilityValue).toMatchObject({ min: 0, max: 100, now: 50 });
  await fireGesture('compare-slider-tap', 'onEnd', { x: 40 });
  expect(onPositionChange).not.toHaveBeenCalled();
  await fireGesture('compare-slider', 'onUpdate', { x: 120 });
  expect(onPositionChange).not.toHaveBeenCalled();
  await setLayout(control, 200);

  await fireEvent(control, 'accessibilityAction', event('increment'));
  expect(onPositionChange).toHaveBeenLastCalledWith(0.6);
  expect(screen.getByRole('adjustable', { name: 'Result comparison' }).props.accessibilityValue.now).toBe(60);

  await fireGesture('compare-slider', 'onUpdate', { x: 40 });
  await fireGesture('compare-slider', 'onFinalize', { x: 40 });
  expect(onPositionChange).toHaveBeenLastCalledWith(0.2);
  await fireGesture('compare-slider-tap', 'onEnd', { x: 320 });
  expect(onPositionChange).toHaveBeenLastCalledWith(1);
  await fireGesture('compare-slider', 'onUpdate', { x: 0 });
  await fireGesture('compare-slider', 'onFinalize', { x: 0 });
  expect(onPositionChange).toHaveBeenLastCalledWith(0);
  expect(onPositionChange).toHaveBeenCalledTimes(4);
  await view.unmount();
});

test('CompareSlider starts its one-time divider hint after it has a measured width', async () => {
  const view = await renderKinetik(
    <CompareSlider before={<Text>Before</Text>} after={<Text>After</Text>}
      accessibilityLabel="Hint comparison" initial={0.9} hint haptics={false} />,
  );
  const control = screen.getByRole('adjustable', { name: 'Hint comparison' });
  await setLayout(control, 240);
  expect(screen.getByRole('adjustable', { name: 'Hint comparison' }).props.accessibilityValue.now).toBe(90);
  await view.unmount();
});

test('CompareSlider reports an animated drag position in ordinary motion settings', async () => {
  const onPositionChange = jest.fn();
  const view = await renderKinetik(
    <CompareSlider before={<Text>Before</Text>} after={<Text>After</Text>}
      accessibilityLabel="Motion comparison" initial={0.4} hint={false} haptics={false}
      onPositionChange={onPositionChange} />,
    'never',
  );
  const control = screen.getByRole('adjustable', { name: 'Motion comparison' });
  await setLayout(control, 200);
  await fireGesture('compare-slider-tap', 'onEnd', { x: 150 });
  expect(onPositionChange).toHaveBeenCalledWith(0.75);
  expect(screen.getByRole('adjustable', { name: 'Motion comparison' }).props.accessibilityValue.now).toBe(75);
  await view.unmount();
});

test('ElasticSlider snaps a measured drag, completes on release, clamps endpoints, and supports accessible adjustments', async () => {
  const onValueChange = jest.fn();
  const onSlidingComplete = jest.fn();
  const view = await renderKinetik(
    <ElasticSlider value={20} min={10} max={50} step={10} label="Cache limit"
      formatValue={(value) => `${value} MiB`} onValueChange={onValueChange}
      onSlidingComplete={onSlidingComplete} leading={<Text>Less</Text>} trailing={<Text>More</Text>} haptics={false} />,
  );
  const control = screen.getByRole('adjustable', { name: 'Cache limit' });
  expect(control.props.accessibilityValue).toEqual({ min: 10, max: 50, now: 20, text: '20 MiB' });
  expect(screen.getByTestId('elastic-slider-thumb')).toBeOnTheScreen();
  expect(screen.getAllByTestId('elastic-slider-detent')).toHaveLength(3);
  await fireGesture('elastic-slider', 'onBegin', { x: 20 });
  await fireGesture('elastic-slider', 'onUpdate', { x: 160 });
  expect(onValueChange).not.toHaveBeenCalled(); // Layout has not supplied a usable track width yet.
  await setLayout(control, 200);

  await fireGesture('elastic-slider', 'onBegin', { x: 0 });
  await fireGesture('elastic-slider', 'onUpdate', { x: 151 });
  expect(onValueChange).toHaveBeenLastCalledWith(40);
  await view.rerender(
    <KinetikProvider scheme="light" reduceMotion="never" haptics={false}>
      <ElasticSlider value={10} min={10} max={50} step={10} label="Cache limit"
        formatValue={(value) => `${value} MiB`} onValueChange={onValueChange}
        onSlidingComplete={onSlidingComplete} leading={<Text>Less</Text>} trailing={<Text>More</Text>} haptics={false} />
    </KinetikProvider>,
  );
  await fireGesture('elastic-slider', 'onFinalize', { x: 151 });
  expect(onSlidingComplete).toHaveBeenLastCalledWith(40);

  await fireGesture('elastic-slider-tap', 'onEnd', { x: 240 });
  expect(onValueChange).toHaveBeenLastCalledWith(50);
  expect(onSlidingComplete).toHaveBeenLastCalledWith(50);
  await fireEvent(screen.getByRole('adjustable', { name: 'Cache limit' }), 'accessibilityAction', event('decrement'));
  expect(onValueChange).toHaveBeenLastCalledWith(40);
  expect(onSlidingComplete).toHaveBeenLastCalledWith(40);
  await fireEvent(screen.getByRole('adjustable', { name: 'Cache limit' }), 'accessibilityAction', event('increment'));
  expect(onValueChange).toHaveBeenLastCalledWith(50);
  expect(onSlidingComplete).toHaveBeenLastCalledWith(50);
  await view.unmount();
});

test('ElasticSlider and StepSlider block gestures and accessibility changes when disabled', async () => {
  const elasticChange = jest.fn();
  const stepChange = jest.fn();
  await renderKinetik(
    <>
      <ElasticSlider value={0.5} label="Disabled elastic" onValueChange={elasticChange} disabled haptics={false} />
      <StepSlider value={1} steps={4} labels={['4 steps', '6 steps', '8 steps', '12 steps']}
        label="Disabled steps" onValueChange={stepChange} disabled haptics={false} />
    </>,
  );
  const elastic = screen.getByRole('adjustable', { name: 'Disabled elastic' });
  const steps = screen.getByRole('adjustable', { name: 'Disabled steps' });
  expect(elastic.props.accessibilityState.disabled).toBe(true);
  expect(steps.props.accessibilityState.disabled).toBe(true);
  expect(gesture('elastic-slider').handlers.enabled).toBe(false);
  expect(gesture('step-slider').handlers.enabled).toBe(false);
  await fireGesture('elastic-slider', 'onUpdate', { x: 180 });
  await fireGesture('step-slider', 'onUpdate', { x: 180 });
  await fireEvent(elastic, 'accessibilityAction', event('increment'));
  await fireEvent(steps, 'accessibilityAction', event('increment'));
  expect(elasticChange).not.toHaveBeenCalled();
  expect(stepChange).not.toHaveBeenCalled();
});

test('StepSlider snaps by measured width and offers bounded accessible steps in reduced-motion mode', async () => {
  const onValueChange = jest.fn();
  const view = await renderKinetik(
    <StepSlider value={1} steps={4} labels={['Fast', 'Balanced', 'Careful', 'Maximum quality']}
      label="Generation speed" onValueChange={onValueChange} haptics={false} />,
    'always',
  );
  const control = screen.getByRole('adjustable', { name: 'Generation speed' });
  expect(control.props.accessibilityValue).toEqual({ min: 0, max: 3, now: 1, text: 'Balanced' });
  await fireGesture('step-slider', 'onBegin', { x: 20 });
  await fireGesture('step-slider', 'onUpdate', { x: 190 });
  expect(onValueChange).not.toHaveBeenCalled();
  await setLayout(control, 200);
  await fireEvent(control, 'accessibilityAction', event('increment'));
  expect(onValueChange).toHaveBeenLastCalledWith(2);

  await fireGesture('step-slider', 'onBegin', { x: 0 });
  await fireGesture('step-slider', 'onUpdate', { x: 190 });
  await fireGesture('step-slider', 'onFinalize', { x: 190 });
  expect(onValueChange).toHaveBeenLastCalledWith(3);
  await fireGesture('step-slider-tap', 'onEnd', { x: 11 });
  expect(onValueChange).toHaveBeenLastCalledWith(0);
  const action = jest.fn();
  await view.rerender(
    <KinetikProvider scheme="light" reduceMotion="always" haptics={false}>
      <StepSlider value={2} steps={4} labels={['Fast', 'Balanced', 'Careful', 'Maximum quality']}
        label="Generation speed" onValueChange={onValueChange}
        action={{ label: 'Reset speed', icon: <Text>↺</Text>, onPress: action }} haptics={false} />
    </KinetikProvider>,
  );
  await userEvent.press(screen.getByRole('button', { name: 'Reset speed' }));
  expect(action).toHaveBeenCalledTimes(1);
  await view.rerender(
    <KinetikProvider scheme="light" reduceMotion="always" haptics={false}>
      <StepSlider value={0} steps={4} labels={['Fast', 'Balanced', 'Careful', 'Maximum quality']}
        label="Generation speed" onValueChange={onValueChange} haptics={false} />
    </KinetikProvider>,
  );
  const atMinimum = screen.getByRole('adjustable', { name: 'Generation speed' });
  await fireEvent(atMinimum, 'accessibilityAction', event('decrement'));
  expect(onValueChange).toHaveBeenCalledTimes(3);
});

test('StepSlider keeps its action available with motion enabled and exposes the selected label', async () => {
  const onValueChange = jest.fn();
  const onAction = jest.fn();
  await renderKinetik(
    <StepSlider value={2} steps={4} labels={['Fast', 'Balanced', 'Careful', 'Maximum quality']}
      label="Generation speed" onValueChange={onValueChange}
      action={{ label: 'Apply speed', icon: <Text>↗</Text>, onPress: onAction }} haptics={false} />,
    'never',
  );
  const control = screen.getByRole('adjustable', { name: 'Generation speed' });
  expect(control.props.accessibilityValue).toEqual({ min: 0, max: 3, now: 2, text: 'Careful' });
  await userEvent.press(screen.getByRole('button', { name: 'Apply speed' }));
  expect(onAction).toHaveBeenCalledTimes(1);
  expect(onValueChange).not.toHaveBeenCalled();
});

test('StepSlider keeps the in-progress stop when a parent value update arrives during a drag', async () => {
  const onValueChange = jest.fn();
  const view = await renderKinetik(
    <StepSlider value={1} steps={4} labels={['Fast', 'Balanced', 'Careful', 'Maximum quality']}
      label="Generation speed" onValueChange={onValueChange} haptics={false} />,
    'always',
  );
  const control = screen.getByRole('adjustable', { name: 'Generation speed' });
  await setLayout(control, 200);
  await fireGesture('step-slider', 'onBegin', { x: 190 });
  await fireGesture('step-slider', 'onUpdate', { x: 190 });
  expect(onValueChange).toHaveBeenLastCalledWith(3);

  await view.rerender(
    <KinetikProvider scheme="light" reduceMotion="always" haptics={false}>
      <StepSlider value={2} steps={4} labels={['Fast', 'Balanced', 'Careful', 'Maximum quality']}
        label="Generation speed" onValueChange={onValueChange} haptics={false} />
    </KinetikProvider>,
  );
  await fireGesture('step-slider', 'onUpdate', { x: 190 });
  expect(onValueChange).toHaveBeenCalledTimes(1);
  await fireGesture('step-slider', 'onFinalize', { x: 190 });
  expect(onValueChange).toHaveBeenCalledTimes(1);
});

test('StepSlider default scale and untranslated accessibility fallback stay bounded', async () => {
  const onValueChange = jest.fn();
  const view = await renderKinetik(
    <StepSlider value={0} label="Default step scale" onValueChange={onValueChange} haptics={false} />,
    'always',
  );
  const control = screen.getByRole('adjustable', { name: 'Default step scale' });
  expect(control.props.accessibilityValue).toEqual({ min: 0, max: 3, now: 0, text: 'Step 1 of 4' });

  await fireEvent(control, 'accessibilityAction', event('decrement'));
  expect(onValueChange).not.toHaveBeenCalled();
  await fireEvent(control, 'accessibilityAction', event('increment'));
  expect(onValueChange).toHaveBeenCalledWith(1);
  await view.rerender(
    <KinetikProvider scheme="light" reduceMotion="always" haptics={false}>
      <StepSlider value={3} label="Default step scale" onValueChange={onValueChange} haptics={false} />
    </KinetikProvider>,
  );
  expect(screen.getByRole('adjustable', { name: 'Default step scale' }).props.accessibilityValue)
    .toEqual({ min: 0, max: 3, now: 3, text: 'Step 4 of 4' });
  await fireEvent(screen.getByRole('adjustable', { name: 'Default step scale' }), 'accessibilityAction', event('increment'));
  expect(onValueChange).toHaveBeenCalledTimes(1);
});

test('PressJelly preserves the child label and ignores a gesture cancelled before activation', async () => {
  const onPress = jest.fn();
  await renderKinetik(<PressJelly onPress={onPress}>Open details</PressJelly>);
  expect(screen.getByRole('button', { name: 'Open details' })).toBeOnTheScreen();
  const handler = gesture('press-jelly').handlers.onEnd;
  expect(typeof handler).toBe('function');
  await act(async () => (handler as (event: unknown, success: boolean) => unknown)({ x: 8, y: 8 }, false));
  expect(onPress).not.toHaveBeenCalled();
  await act(async () => (handler as (event: unknown, success: boolean) => unknown)({ x: 8, y: 8 }, true));
  expect(onPress).toHaveBeenCalledTimes(1);
  await renderKinetik(
    <PressJelly accessibilityLabel="Image options" onPress={onPress}><Text>•••</Text></PressJelly>,
  );
  expect(screen.getByRole('button', { name: 'Image options' })).toBeOnTheScreen();
});

test('MorphSelect searches case-insensitively, ignores disabled choices, selects, dismisses, and handles empty results', async () => {
  const onValueChange = jest.fn();
  const user = userEvent.setup();
  const options = [
    { value: 'en', label: 'English' },
    { value: 'ru', label: 'Russian' },
    { value: 'de', label: 'German' },
    { value: 'fr', label: 'French' },
    { value: 'es', label: 'Spanish' },
    { value: 'it', label: 'Italian' },
    { value: 'pt', label: 'Portuguese' },
    { value: 'sv', label: 'Swedish', disabled: true },
    { value: 'hu', label: 'Magyar' },
    { value: 'ar', label: 'العربية' },
  ] as const;
  const view = await renderKinetik(
    <MorphSelect options={options} value="en" onValueChange={onValueChange} label="Language"
      placeholder="Choose language" searchPlaceholder="Search languages" closeLabel="Dismiss language list"
      maxVisible={5} haptics={false} />,
    'never',
  );

  await user.press(screen.getByRole('button', { name: 'Language, English' }));
  const optionsScroll = view.container.queryAll(node => node.props.scrollEnabled !== undefined)[0];
  expect(optionsScroll?.props.keyboardShouldPersistTaps).toBe('handled');
  const search = screen.getByLabelText('Search languages');
  await user.type(search, '   ');
  expect(screen.getAllByRole('menuitem')).toHaveLength(options.length);
  await user.clear(search);
  await user.type(search, 'sWe');
  expect(screen.getByRole('menuitem', { name: 'Swedish' })).toBeOnTheScreen();
  expect(screen.queryByRole('menuitem', { name: 'Spanish' })).toBeNull();
  const disabled = screen.getByRole('menuitem', { name: 'Swedish' });
  expect(disabled.props.accessibilityState.disabled).toBe(true);
  await user.press(disabled);
  expect(onValueChange).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Search languages')).toHaveDisplayValue('sWe');

  await user.clear(screen.getByLabelText('Search languages'));
  await user.type(screen.getByLabelText('Search languages'), 'ar');
  expect(screen.getByRole('menuitem', { name: 'Magyar' })).toBeOnTheScreen();
  expect(screen.getByRole('menuitem', { name: 'العربية' })).toBeOnTheScreen();
  await user.press(screen.getByRole('menuitem', { name: 'العربية' }));
  expect(onValueChange).toHaveBeenNthCalledWith(1, 'ar');
  expect(screen.queryByLabelText('Search languages')).toBeNull();

  await user.press(screen.getByRole('button', { name: 'Language, English' }));
  await user.clear(screen.getByLabelText('Search languages'));
  await user.type(screen.getByLabelText('Search languages'), 'zzzz');
  expect(screen.queryAllByRole('menuitem')).toHaveLength(0);
  const closeButtons = screen.getAllByRole('button', { name: 'Dismiss language list' });
  await user.press(closeButtons[0]);
  expect(screen.queryByLabelText('Search languages')).toBeNull();

  await user.press(screen.getByRole('button', { name: 'Language, English' }));
  await user.press(screen.getByRole('menuitem', { name: 'Russian' }));
  expect(onValueChange).toHaveBeenCalledWith('ru');
  expect(screen.queryByRole('menuitem', { name: 'Russian' })).toBeNull();
});

test('MorphSelect supports reduced-motion selection and native modal dismissal', async () => {
  const onValueChange = jest.fn();
  const user = userEvent.setup();
  await renderKinetik(
    <MorphSelect options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]}
      value="dark" onValueChange={onValueChange} label="Theme" closeLabel="Close theme list" haptics={false} />,
    'always',
  );
  await user.press(screen.getByRole('button', { name: 'Theme, Dark' }));
  await user.press(screen.getByRole('button', { name: 'Close theme list' }));
  expect(screen.queryByRole('menuitem', { name: 'Light' })).toBeNull();

  await user.press(screen.getByRole('button', { name: 'Theme, Dark' }));
  await user.press(screen.getByRole('menuitem', { name: 'Light' }));
  expect(onValueChange).toHaveBeenCalledWith('light');
  expect(screen.queryByRole('menuitem', { name: 'Light' })).toBeNull();
});

test('MorphSelect renders a placeholder, descriptions and leading content for an unselected value', async () => {
  const onValueChange = jest.fn();
  const view = await renderKinetik(
    <MorphSelect
      options={[
        { value: 'dark', label: 'Dark', description: 'Best in low light', leading: <Text>●</Text> },
        { value: 'light', label: 'Light', description: 'Bright surfaces' },
      ]}
      value={null} onValueChange={onValueChange} label="Theme" placeholder="Pick a theme" haptics={false}
    />,
    'never',
  );
  const trigger = screen.getByRole('button', { name: 'Theme, Pick a theme' });
  await userEvent.press(trigger);
  expect(screen.getByRole('menuitem', { name: 'Dark, Best in low light' })).toBeOnTheScreen();
  expect(screen.getByText('●')).toBeOnTheScreen();
  const escapeBoundary = view.container.queryAll(node => typeof node.props?.onAccessibilityEscape === 'function')[0];
  expect(escapeBoundary).toBeTruthy();
  await fireEvent(escapeBoundary!, 'accessibilityEscape');
  expect(screen.queryByRole('menuitem', { name: 'Dark, Best in low light' })).toBeNull();

  await userEvent.press(screen.getByRole('button', { name: 'Theme, Pick a theme' }));
  const duplicateTriggers = screen.getAllByRole('button', { name: 'Theme, Pick a theme' });
  expect(duplicateTriggers).toHaveLength(2);
  await fireEvent.press(duplicateTriggers[1]);
  expect(screen.queryByRole('menuitem', { name: 'Dark, Best in low light' })).toBeNull();

  await userEvent.press(screen.getByRole('button', { name: 'Theme, Pick a theme' }));
  const modal = view.container.queryAll(node => typeof node.props?.onRequestClose === 'function')[0];
  expect(modal).toBeTruthy();
  await fireEvent(modal!, 'requestClose');
  expect(screen.queryByRole('menuitem', { name: 'Dark, Best in low light' })).toBeNull();

  await userEvent.press(screen.getByRole('button', { name: 'Theme, Pick a theme' }));
  await userEvent.press(screen.getByRole('menuitem', { name: 'Dark, Best in low light' }));
  expect(onValueChange).toHaveBeenCalledWith('dark');
});
