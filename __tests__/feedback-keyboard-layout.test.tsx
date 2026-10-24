import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Keyboard, type KeyboardEvent } from 'react-native';
import type { ComponentType, RefAttributes } from 'react';
import type { TextInputProps } from 'react-native';
import { FeedbackScreen } from '../src/screens/Feedback';
import { AppProvider } from '../src/application/AppProvider';
import Native from '../tests/nativeMock';
import { strings } from '../src/ui/i18n';

type InputHandle = {
  isFocused: () => boolean;
  measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => void;
};
type InputMockControl = ComponentType<TextInputProps & RefAttributes<InputHandle>> & {
  setMeasurement: InputHandle['measureInWindow'];
  setFocused: (value: boolean, label?: string) => void;
};
type ScrollOptions = { y: number; animated?: boolean };
type ScrollHandle = {
  scrollTo: (options: ScrollOptions) => void;
  scrollResponderScrollNativeHandleToKeyboard: (target: number, bottomOffset: number, preventNegativeScrollOffset?: boolean) => void;
};
type ScrollMockControl = ComponentType<React.PropsWithChildren<Record<string, unknown>> & RefAttributes<ScrollHandle>> & {
  calls: { scrollTo: ScrollOptions[]; nativeScroll: Array<[number, number, boolean | undefined]> };
  reset: () => void;
};

jest.mock('react-native/Libraries/Components/TextInput/TextInput', () => {
  const ReactModule = jest.requireActual('react') as typeof React;
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  const measurement = { run: (_callback: Parameters<InputHandle['measureInWindow']>[0]) => {} };
  const mockFocusStates = new Map<string, (mockNextFocused: boolean) => void>();
  const Input = ReactModule.forwardRef<InputHandle, TextInputProps>((props, ref) => {
    const focused = ReactModule.useRef(false);
    mockFocusStates.set(String(props.accessibilityLabel ?? ''), mockNextFocused => { focused.current = mockNextFocused; });
    ReactModule.useImperativeHandle(ref, () => ({
      isFocused: () => focused.current,
      measureInWindow: callback => measurement.run(callback),
    }), []);
    return ReactModule.createElement(View, {
      ...props,
      accessible: true,
      onFocus: event => {
        focused.current = true;
        props.onFocus?.(event as never);
      },
      onBlur: event => {
        focused.current = false;
        props.onBlur?.(event as never);
      },
    });
  });
  Object.assign(Input, {
    setMeasurement: (run: InputHandle['measureInWindow']) => { measurement.run = run; },
    setFocused: (mockNextFocused: boolean, mockLabel = '') => mockFocusStates.get(mockLabel)?.(mockNextFocused),
  });
  return { __esModule: true, default: Input };
});

jest.mock('react-native/Libraries/Components/ScrollView/ScrollView', () => {
  const ReactModule = jest.requireActual('react') as typeof React;
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  const calls: ScrollMockControl['calls'] = { scrollTo: [], nativeScroll: [] };
  const Scroll = ReactModule.forwardRef<ScrollHandle, React.ComponentProps<typeof View>>((props, ref) => {
    ReactModule.useImperativeHandle(ref, () => ({
      scrollTo: options => calls.scrollTo.push(options),
      scrollResponderScrollNativeHandleToKeyboard: (target, offset, prevent) => calls.nativeScroll.push([target, offset, prevent]),
    }), []);
    return ReactModule.createElement(View, props);
  });
  Object.assign(Scroll, { calls, reset: () => { calls.scrollTo.length = 0; calls.nativeScroll.length = 0; } });
  return { __esModule: true, default: Scroll };
});

const TextInputMockModule = require('react-native/Libraries/Components/TextInput/TextInput').default as unknown;
const ScrollViewMockModule = require('react-native/Libraries/Components/ScrollView/ScrollView').default as unknown;

const inputMock = TextInputMockModule as unknown as InputMockControl;
const scrollMock = ScrollViewMockModule as unknown as ScrollMockControl;
const t = strings.en;
const props = { navigation: { navigate: jest.fn(), goBack: jest.fn() }, route: { params: undefined } } as unknown as Parameters<typeof FeedbackScreen>[0];

function keyboardEvent(screenY: number): KeyboardEvent {
  return {
    endCoordinates: { screenX: 0, screenY, width: 400, height: 300 },
    startCoordinates: { screenX: 0, screenY: screenY + 300, width: 400, height: 0 },
    duration: 250,
    easing: 'keyboard',
  } as KeyboardEvent;
}

function controlledFrames() {
  const oldRequest = globalThis.requestAnimationFrame;
  const oldCancel = globalThis.cancelAnimationFrame;
  const pending = new Map<number, FrameRequestCallback>();
  const cancelled: number[] = [];
  let nextId = 1;
  globalThis.requestAnimationFrame = callback => {
    const id = nextId++;
    pending.set(id, callback);
    return id;
  };
  globalThis.cancelAnimationFrame = id => {
    if (typeof id === 'number') {
      cancelled.push(id);
      pending.delete(id);
    }
  };
  return {
    pending,
    cancelled,
    flush: async () => {
      const entry = [...pending.entries()][0];
      if (!entry) throw new Error('Expected a pending animation frame');
      pending.delete(entry[0]);
      await act(async () => entry[1](16));
    },
    restore: () => {
      globalThis.requestAnimationFrame = oldRequest;
      globalThis.cancelAnimationFrame = oldCancel;
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  Native.getFeedbackStatus.mockResolvedValue(true);
  scrollMock.reset();
});

test('after keyboard layout, only a covered focused field scrolls by its measured overlap', async () => {
  const frames = controlledFrames();
  let shown: ((event: KeyboardEvent) => void) | undefined;
  jest.spyOn(Keyboard, 'addListener').mockImplementation((_name, listener) => {
    shown = listener as (event: KeyboardEvent) => void;
    return { remove: jest.fn() };
  });
  const measurement = jest.fn((callback: Parameters<InputHandle['measureInWindow']>[0]) => callback(0, 940, 320, 100)) as unknown as InputHandle['measureInWindow'] & jest.Mock;
  inputMock.setMeasurement(measurement);
  try {
    await render(<AppProvider><FeedbackScreen {...props} /></AppProvider>);
    const scroll = await screen.findByTestId('feedback-scroll');
    await fireEvent(scroll, 'scroll', { nativeEvent: { contentOffset: { x: 0, y: 80 } } });
    const field = screen.getByLabelText(t.message);
    await fireEvent(field, 'focus', { nativeEvent: { target: 731 } });
    expect(scrollMock.calls.nativeScroll).toContainEqual([731, 28, true]);

    await act(async () => shown?.(keyboardEvent(1034)));
    expect(measurement).not.toHaveBeenCalled();
    await frames.flush();
    expect(measurement).not.toHaveBeenCalled();
    await frames.flush();
    expect(measurement).toHaveBeenCalledTimes(1);
    // 940 + 100 + 24 - 1034 = 30px; preserve the scroll offset captured before resize.
    expect(scrollMock.calls.scrollTo).toEqual([{ y: 110, animated: true }]);

    scrollMock.reset();
    measurement.mockImplementation(callback => callback(0, 700, 320, 100));
    await act(async () => shown?.(keyboardEvent(1034)));
    await frames.flush();
    await frames.flush();
    expect(scrollMock.calls.scrollTo).toEqual([]);
  } finally {
    frames.restore();
  }
});

test('keyboard resize is ignored without focus and queued measurement is cancelled on unmount', async () => {
  const frames = controlledFrames();
  const remove = jest.fn();
  let removeKeyboardDidShow: jest.Mock | undefined;
  let shown: ((event: KeyboardEvent) => void) | undefined;
  jest.spyOn(Keyboard, 'addListener').mockImplementation((name, listener) => {
    shown = listener as (event: KeyboardEvent) => void;
    if (name === 'keyboardDidShow') {
      removeKeyboardDidShow = remove;
      return { remove };
    }
    return { remove: jest.fn() };
  });
  const measurement = jest.fn() as unknown as InputHandle['measureInWindow'] & jest.Mock;
  inputMock.setMeasurement(measurement);
  try {
    const view = await render(<AppProvider><FeedbackScreen {...props} /></AppProvider>);
    await act(async () => shown?.(keyboardEvent(1034)));
    expect(frames.pending.size).toBe(0);
    await fireEvent(screen.getByLabelText(t.message), 'focus', { nativeEvent: { target: 732 } });
    await act(async () => shown?.(keyboardEvent(1034)));
    expect(frames.pending.size).toBe(1);
    await frames.flush();
    expect(frames.pending.size).toBe(1);
    await act(async () => shown?.(keyboardEvent(1034)));
    expect(frames.cancelled).toHaveLength(1); // Replacing the event cancels the queued second frame.
    await act(async () => shown?.(keyboardEvent(1034)));
    await frames.flush();
    inputMock.setFocused(false, t.message); // Native focus can disappear before blur reaches JS.
    await frames.flush();
    expect(measurement).not.toHaveBeenCalled();
    inputMock.setFocused(true, t.message);
    await act(async () => shown?.(keyboardEvent(1034)));
    await frames.flush();
    await frames.flush();
    expect(measurement).toHaveBeenCalledTimes(1);
    await view.unmount();
    expect(frames.pending.size).toBe(0);
    expect(frames.cancelled).toHaveLength(2);
    expect(removeKeyboardDidShow).toHaveBeenCalledTimes(1);
    expect(measurement).toHaveBeenCalledTimes(1);
  } finally {
    frames.restore();
  }
});

test('a measurement callback is ignored when a different input took focus meanwhile', async () => {
  const frames = controlledFrames();
  let shown: ((event: KeyboardEvent) => void) | undefined;
  jest.spyOn(Keyboard, 'addListener').mockImplementation((_name, listener) => {
    shown = listener as (event: KeyboardEvent) => void;
    return { remove: jest.fn() };
  });
  let finishMeasurement: Parameters<InputHandle['measureInWindow']>[0] | undefined;
  const measurement = jest.fn((callback: Parameters<InputHandle['measureInWindow']>[0]) => {
    finishMeasurement = callback;
  }) as unknown as InputHandle['measureInWindow'] & jest.Mock;
  inputMock.setMeasurement(measurement);
  try {
    await render(<AppProvider><FeedbackScreen {...props} /></AppProvider>);
    await fireEvent(screen.getByLabelText(t.message), 'focus', { nativeEvent: { target: 733 } });
    await act(async () => shown?.(keyboardEvent(1034)));
    await frames.flush();
    await frames.flush();
    expect(measurement).toHaveBeenCalledTimes(1);
    await fireEvent(screen.getByLabelText(t.email), 'focus', { nativeEvent: { target: 734 } });
    finishMeasurement?.(0, 940, 320, 100);
    expect(scrollMock.calls.scrollTo).toEqual([]);
  } finally {
    frames.restore();
  }
});

test('blur on an old input preserves the new focus, while blur on the focused input stops keyboard scrolling', async () => {
  const frames = controlledFrames();
  let shown: ((event: KeyboardEvent) => void) | undefined;
  jest.spyOn(Keyboard, 'addListener').mockImplementation((_name, listener) => {
    shown = listener as (event: KeyboardEvent) => void;
    return { remove: jest.fn() };
  });
  const measurement = jest.fn((callback: Parameters<InputHandle['measureInWindow']>[0]) => callback(0, 940, 320, 100)) as unknown as InputHandle['measureInWindow'] & jest.Mock;
  inputMock.setMeasurement(measurement);
  try {
    await render(<AppProvider><FeedbackScreen {...props} /></AppProvider>);
    const email = screen.getByLabelText(t.email);
    const message = screen.getByLabelText(t.message);
    await fireEvent(email, 'focus', { nativeEvent: { target: 801 } });
    await fireEvent(message, 'focus', { nativeEvent: { target: 802 } });
    await fireEvent(email, 'blur'); // A delayed blur from the previous field must not clear the current target.
    await act(async () => shown?.(keyboardEvent(1034)));
    await frames.flush();
    await frames.flush();
    expect(measurement).toHaveBeenCalledTimes(1);
    expect(scrollMock.calls.scrollTo).toEqual([{ y: 30, animated: true }]);

    await fireEvent(message, 'blur');
    await act(async () => shown?.(keyboardEvent(1034)));
    expect(frames.pending.size).toBe(0);
    expect(measurement).toHaveBeenCalledTimes(1);
  } finally {
    frames.restore();
  }
});
