/* global jest */
// Mock the native animation boundary; application handlers still execute.
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: {
    View: require('react-native').View,
    Text: require('react-native').Text,
    createAnimatedComponent: component => component,
  },
  ReduceMotion: { System: 'system' },
  useSharedValue: value => require('react').useRef({ value }).current,
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
  Easing: { linear: value => value },
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
