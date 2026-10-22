/* global jest */
// Mock the native animation boundary; application handlers still execute.
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: {
    View: require('react-native').View,
    Text: require('react-native').Text,
    createAnimatedComponent: component => component,
  },
  ReduceMotion: { System: 'system', Always: 'always', Never: 'never' },
  useSharedValue: value => require('react').useRef({value, get() {return this.value;}, set(next) {this.value = typeof next === 'function' ? next(this.value) : next;}, modify(fn) {this.value = fn(this.value);}}).current,
  useDerivedValue: fn => ({get:fn, value:fn()}),
  useFrameCallback: () => ({setActive: jest.fn()}),
  useAnimatedRef: () => require('react').useRef(null),
  runOnJS: fn => fn,
  withSpring: (value, _config, callback) => {callback?.(true);return value;},
  withSequence: (...values) => values[values.length - 1],
  withDelay: (_delay,value) => value,
  interpolate: (value,input,output) => output[0] + (output[output.length-1]-output[0]) * (value-input[0])/(input[input.length-1]-input[0]),
  Extrapolation: {CLAMP:'clamp'},
  useAnimatedStyle: callback => callback(),
  useAnimatedProps: callback => callback(),
  withTiming: (value, _config, callback) => {
    callback?.(true);
    return value;
  },
  useAnimatedReaction: (prepare, react) => {
    require('react').useEffect(() => {
      react(prepare(), null);
    }, []);
  },
  FadeInDown: { duration: () => ({ reduceMotion: () => undefined }) },
  FadeOutUp: { duration: () => ({ reduceMotion: () => undefined }) },
  withRepeat: value => value,
  cancelAnimation: jest.fn(),
  Easing: { linear: value => value, bezier: () => value => value, sin: value => value, inOut: fn => fn, quad: value => value, out: fn => fn },
}));
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('react-native-worklets', () => ({
  scheduleOnRN: (fn, ...args) => fn(...args),
}));
jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const View = require('react-native').View;
  function gesture() {
    const result = { handlers: {} };
    for (const method of [
      'activeOffsetX',
      'failOffsetY',
      'onUpdate',
      'onEnd',
      'onFinalize',
      'onBegin', 'onStart', 'onTouchesDown', 'onTouchesUp', 'onTouchesCancelled',
      'withTestId', 'maxDistance', 'enabled', 'runOnJS', 'hitSlop', 'minDistance',
      'shouldCancelWhenOutside', 'simultaneousWithExternalGesture', 'requireExternalGestureToFail',
    ]) {
      result[method] = value => {
        result.handlers[method] = value;
        return result;
      };
    }
    return result;
  }
  return {
    GestureHandlerRootView: View,
    GestureDetector: ({ gesture: value, children }) =>
      React.createElement(
        View,
        { testID: 'gesture-boundary', gesture: value },
        children,
      ),
    Gesture: { Pan: gesture, Tap: gesture, Exclusive: (...items) => items },
  };
});
jest.mock('./src/specs/NativeUpscale', () => require('./tests/nativeMock'));

jest.mock('@react-native-firebase/crashlytics', () => ({
  getCrashlytics: jest.fn(),
}));
// Virtualization relies on native viewport measurements. Component tests render
// rows at this boundary; real scrolling/visibility is verified on Android.
jest.mock('react-native/Libraries/Lists/FlatList', () => {
  const React = require('react');
  const { ScrollView, View } = require('react-native');
  return {
    __esModule: true,
    default: ({ data, renderItem, keyExtractor, ...props }) =>
      React.createElement(
        ScrollView,
        props,
        data.map((item, index) =>
          React.createElement(
            View,
            { key: keyExtractor(item, index) },
            renderItem({ item, index }),
          ),
        ),
      ),
  };
});
