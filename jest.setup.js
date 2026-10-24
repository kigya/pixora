/* global jest */
// Mock the native animation boundary; application handlers still execute.
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: {
    View: require('react-native').View,
    Text: require('react-native').Text,
    ScrollView: require('react-native').ScrollView,
    createAnimatedComponent: component => component,
  },
  ReduceMotion: { System: 'system', Always: 'always', Never: 'never' },
  useSharedValue: value => require('react').useRef({value, get() {return this.value;}, set(next) {this.value = typeof next === 'function' ? next(this.value) : next;}, modify(fn) {this.value = fn(this.value);}}).current,
  useDerivedValue: fn => ({get:fn, value:fn()}),
  useFrameCallback: (callback, autostart = true) => {
    const React = require('react');
    const latest = React.useRef(callback);latest.current = callback;
    const handle = React.useRef(null);
    if(!handle.current)handle.current={active:autostart,started:null,previous:null,setActive(value){this.active=value;},frame(timestamp){
      if(!this.active)return;
      if(this.started===null)this.started=timestamp;
      latest.current({timestamp,timeSinceFirstFrame:timestamp-this.started,timeSincePreviousFrame:this.previous===null?null:timestamp-this.previous});
      this.previous=timestamp;
    }};
    React.useEffect(()=>{
      const frames=global.__pixoraFrameCallbacks ??= new Set();
      frames.add(handle.current);return()=>frames.delete(handle.current);
    },[]);
    return handle.current;
  },
  useAnimatedRef: () => require('react').useRef(null),
  runOnJS: fn => fn,
  withSpring: (value, _config, callback) => {callback?.(true);return value;},
  withSequence: (...values) => values[values.length - 1],
  withDelay: (_delay,value) => value,
  interpolate: (value,input,output) => output[0] + (output[output.length-1]-output[0]) * (value-input[0])/(input[input.length-1]-input[0]),
  Extrapolation: {CLAMP:'clamp'},
  useAnimatedStyle: callback => {
    const React = require('react');
    const [, redraw] = React.useReducer(n => n + 1, 0);
    React.useEffect(() => {redraw();}, []);
    return callback();
  },
  useAnimatedProps: callback => callback(),
  useAnimatedScrollHandler: handlers => event => handlers.onScroll?.(event.nativeEvent ?? event),
  interpolateColor: (_value, _input, output) => output[0],
  withTiming: (value, _config, callback) => {
    callback?.(true);
    return value;
  },
  useAnimatedReaction: (prepare, react) => {
    require('react').useEffect(() => {
      react(prepare(), null);
    }, []);
  },
  FadeInDown: { duration: () => ({ easing: () => undefined, reduceMotion: () => undefined }) },
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
      'maxDuration', 'withTestId', 'maxDistance', 'enabled', 'runOnJS', 'hitSlop', 'minDistance',
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
    GestureDetector: ({ gesture: value, children }) => {
      const items = Array.isArray(value) ? value.flat() : [value];
      const tap = items.find(item => item.handlers.withTestId?.includes('tap')) ?? items[0];
      const child = React.Children.only(children);
      return React.createElement(View, {testID:'gesture-boundary', gesture:value}, React.cloneElement(child, {
        onPress: child.props.onPress ?? (() => {
          if (tap.handlers.enabled === false) return;
          tap.handlers.onBegin?.({x:0,y:0});
          tap.handlers.onEnd?.({x:0,y:0}, true);
          tap.handlers.onFinalize?.({x:0,y:0}, true);
        }),
      }));
    },
    Gesture: { Pan: gesture, Tap: gesture, Exclusive: (...items) => items, Race: (...items) => items, Simultaneous: (...items) => items },
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

// Use Skia's real CPU mock; the texture hook itself requires a native surface.
jest.mock('@shopify/react-native-skia', () => ({
  ...require('@shopify/react-native-skia/lib/module/mock').Mock(global.CanvasKit),
  useTexture: () => ({value:null,get:()=>null}),
}));
// Expo Router's helper otherwise replaces the project's complete animation mocks.
jest.mock('./node_modules/expo-router/build/testing-library/mocks.js', () => ({}));
jest.mock('expo-linking', () => ({
  ...jest.requireActual('expo-linking'),
  createURL: path => 'yourscheme://' + path,
  resolveScheme: () => 'yourscheme',
  addEventListener: () => ({remove() {}}),
}));
