import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Keyboard, type KeyboardEvent } from 'react-native';
import type { ComponentType, RefAttributes } from 'react';
import type { TextInputProps } from 'react-native';
import { AppProvider } from '../src/application/AppProvider';
import { Home } from '../src/screens/Home';
import Native, { seed } from '../tests/nativeMock';
import { strings } from '../src/ui/i18n';

type InputHandle = {
  isFocused: () => boolean;
  measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => void;
};
type InputControl = ComponentType<TextInputProps & RefAttributes<InputHandle>> & {
  setMeasurement: InputHandle['measureInWindow'];
};
type ScrollOptions = { y: number; animated?: boolean };
type ScrollHandle = { scrollTo: (options: ScrollOptions) => void };
type ScrollControl = ComponentType<React.PropsWithChildren<Record<string, unknown>> & RefAttributes<ScrollHandle>> & {
  calls: ScrollOptions[];
};

jest.mock('react-native/Libraries/Components/TextInput/TextInput', () => {
  const ReactModule = jest.requireActual('react') as typeof React;
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  const measurement = { run: (_callback: Parameters<InputHandle['measureInWindow']>[0]) => {} };
  const Input = ReactModule.forwardRef<InputHandle, TextInputProps>((props, ref) => {
    const focused = ReactModule.useRef(false);
    ReactModule.useImperativeHandle(ref, () => ({
      isFocused: () => focused.current,
      measureInWindow: callback => measurement.run(callback),
    }), []);
    return ReactModule.createElement(View, {
      ...props,
      accessible: true,
      onFocus: event => { focused.current = true; props.onFocus?.(event as never); },
      onBlur: event => { focused.current = false; props.onBlur?.(event as never); },
    });
  });
  Object.assign(Input, { setMeasurement: (run: InputHandle['measureInWindow']) => { measurement.run = run; } });
  return { __esModule: true, default: Input };
});

jest.mock('react-native/Libraries/Components/ScrollView/ScrollView', () => {
  const ReactModule = jest.requireActual('react') as typeof React;
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  const calls: ScrollOptions[] = [];
  const Scroll = ReactModule.forwardRef<ScrollHandle, React.ComponentProps<typeof View>>((props, ref) => {
    ReactModule.useImperativeHandle(ref, () => ({ scrollTo: options => calls.push(options) }), []);
    return ReactModule.createElement(View, props);
  });
  Object.assign(Scroll, { calls });
  return { __esModule: true, default: Scroll };
});

const InputModule = require('react-native/Libraries/Components/TextInput/TextInput').default as unknown;
const ScrollModule = require('react-native/Libraries/Components/ScrollView/ScrollView').default as unknown;
const input = InputModule as InputControl;
const scroll = ScrollModule as ScrollControl;
const t = strings.en;
const image = {
  id: 'keyboard-image', mime: 'image/png', size: 200, width: 120, height: 60,
  workWidth: 120, workHeight: 60, hasAlpha: false, previewUri: 'file:///before.png', needsPreparation: false,
};
const navigation = { navigate: jest.fn(), goBack: jest.fn(), isFocused: jest.fn(() => true), addListener: jest.fn(() => jest.fn()) };
const props = { navigation, route: { params: undefined } } as unknown as Parameters<typeof Home>[0];

function keyboardEvent(screenY: number): KeyboardEvent {
  return {
    endCoordinates: { screenX: 0, screenY, width: 400, height: 300 },
    startCoordinates: { screenX: 0, screenY: screenY + 300, width: 400, height: 0 },
    duration: 250,
    easing: 'keyboard',
  } as KeyboardEvent;
}

beforeEach(() => {
  jest.clearAllMocks();
  seed({ state: 'READY', processingKind: 'recreate', image });
  Native.getFeedbackStatus.mockResolvedValue(false);
  Native.getRecreateModelState.mockResolvedValue({ state: 'absent', downloadedBytes: 0, totalBytes: 1_881_812_340, installedBytes: 0, error: '' });
  scroll.calls.length = 0;
});

test('Home remeasures a focused recreation prompt after keyboard resize and scrolls only for overlap', async () => {
  let shown: ((event: KeyboardEvent) => void) | undefined;
  jest.spyOn(Keyboard, 'addListener').mockImplementation((name, listener) => {
    if (name === 'keyboardDidShow') shown = listener as (event: KeyboardEvent) => void;
    return { remove: jest.fn() };
  });
  const measure = jest.fn((callback: Parameters<InputHandle['measureInWindow']>[0]) => callback(0, 940, 320, 100)) as unknown as InputHandle['measureInWindow'] & jest.Mock;
  input.setMeasurement(measure);
  const view = await render(<AppProvider><Home {...props} /></AppProvider>);
  const field = await screen.findByLabelText(t.recreate.prompt);
  const scrollView = view.container.queryAll(node => typeof node.props?.onScroll === 'function')[0];
  expect(scrollView).toBeTruthy();
  await fireEvent(scrollView!, 'scroll', { nativeEvent: { contentOffset: { x: 0, y: 80 } } });
  await act(async () => shown?.(keyboardEvent(1034)));
  expect(measure).not.toHaveBeenCalled();
  await fireEvent(field, 'focus', { nativeEvent: { target: 875 } });
  await act(async () => shown?.(keyboardEvent(1034)));
  expect(measure).toHaveBeenCalledTimes(1);
  expect(scroll.calls).toEqual([{ y: 110, animated: true }]);

  scroll.calls.length = 0;
  measure.mockImplementation(callback => callback(0, 700, 320, 100));
  await act(async () => shown?.(keyboardEvent(1034)));
  expect(measure).toHaveBeenCalledTimes(2);
  expect(scroll.calls).toEqual([]);
});
