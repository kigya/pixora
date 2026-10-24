import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AppState,
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type TextStyle,
} from 'react-native';
import Animated, {
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressJelly } from '../press-jelly';
import { useReduceMotion } from '../../../lib/kinetik/hooks/use-reduce-motion';
import { useKinetikTheme } from '../../../lib/kinetik/tokens/theme';

export type OnboardingSlide = {
  key: string;
  title: string;
  /** Passive illustration; callers should set pointerEvents="none". */
  visual?: (active: boolean) => ReactNode;
};

export type OnboardingProps = {
  onFinish: () => void;
  onSkip?: () => void;
  slides: readonly OnboardingSlide[];
  nextLabel: string;
  finishLabel: string;
  skipLabel?: string;
  stepLabel: (current: number, total: number) => string;
};

/** A fixed footer with a horizontal-only pager and passive Kinetik visuals. */
export function Onboarding({
  onFinish,
  onSkip,
  slides,
  nextLabel,
  finishLabel,
  skipLabel,
  stepLabel,
}: OnboardingProps) {
  const { colors, space, font } = useKinetikTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const reduced = useReduceMotion();
  const scroller = useAnimatedRef<Animated.ScrollView>();
  const offset = useSharedValue(0);
  const widthRef = useRef(window.width);
  const [width, setWidth] = useState(window.width);
  const [height, setHeight] = useState(0);
  const [index, setIndex] = useState(0);
  const [foreground, setForeground] = useState(
    AppState.currentState !== 'background' && AppState.currentState !== 'inactive',
  );
  const count = slides.length;
  const last = index >= count - 1;
  const compact = window.height < 620 || window.fontScale >= 1.5;
  const pad = space[5];
  const titleSize = font.size['2xl'];

  const onScroll = useAnimatedScrollHandler(event => {
    offset.set(event.contentOffset.x);
  });
  const onLayout = (event: LayoutChangeEvent) => {
    widthRef.current = event.nativeEvent.layout.width;
    setWidth(event.nativeEvent.layout.width);
    setHeight(event.nativeEvent.layout.height);
  };
  const settle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const pageWidth = widthRef.current;
    if (pageWidth > 0)
      setIndex(Math.max(0, Math.min(count - 1, Math.round(event.nativeEvent.contentOffset.x / pageWidth))));
  };
  const next = () => {
    if (last) return onFinish();
    const to = index + 1;
    scroller.current?.scrollTo({ x: to * widthRef.current, animated: !reduced });
    setIndex(to);
  };

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => sub.remove();
  }, []);

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top + space[3],
          paddingBottom: insets.bottom + space[3],
        },
      ]}
      testID="onboarding"
    >
      <Animated.ScrollView
        ref={scroller}
        testID="onboarding-pager"
        horizontal
        pagingEnabled
        scrollEnabled={foreground}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        bounces={false}
        scrollEventThrottle={16}
        onScroll={onScroll}
        onMomentumScrollEnd={settle}
        onScrollEndDrag={settle}
        onLayout={onLayout}
        style={[styles.pager, { direction: 'ltr' }]}
      >
        {width > 0 && slides.map((slide, page) => {
          const active = page === index;
          return (
            <View
              key={slide.key}
              style={{
                width,
                height: height || undefined,
                paddingHorizontal: pad,
                paddingBottom: compact ? space[2] : space[4],
                gap: compact ? space[3] : space[4],
              }}
              accessibilityElementsHidden={!active}
              importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
            >
              <View
                style={[
                  styles.illustration,
                  { minHeight: compact ? 72 : 104, backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 24 },
                ]}
              >
                {slide.visual?.(active && foreground)}
              </View>
              <SlideTitle
                text={slide.title}
                active={active && foreground}
                size={titleSize}
                color={colors.text}
                weight={font.weight.bold}
                tracking={font.tracking.tight}
              />
            </View>
          );
        })}
      </Animated.ScrollView>

      <View style={[styles.indicatorSlot, { paddingTop: space[2], paddingBottom: space[6] }]}>
        <ProgressTrack count={count} offset={offset} width={Math.max(0, width - pad * 2)} pageWidth={width} label={stepLabel(index + 1, count)} />
      </View>

      <View style={[styles.footer, { paddingHorizontal: pad, gap: space[2] }]}>
        <PressJelly block size="lg" onPress={next}>
          {last ? finishLabel : nextLabel}
        </PressJelly>
        {onSkip && skipLabel ? (
          <PressJelly variant="surface" block size="md" onPress={onSkip}>
            {skipLabel}
          </PressJelly>
        ) : null}
      </View>
    </View>
  );
}

function SlideTitle({
  text,
  active,
  size,
  color,
  weight,
  tracking,
}: {
  text: string;
  active: boolean;
  size: number;
  color: string;
  weight: TextStyle['fontWeight'];
  tracking: number;
}) {
  const reduced = useReduceMotion();
  const arrive = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    arrive.set(reduced ? (active ? 1 : 0) : 0);
    if (active && !reduced) arrive.set(withTiming(1, { duration: 260 }));
  }, [active, reduced, arrive]);
  const style = useAnimatedStyle(() => ({ opacity: arrive.get(), transform: [{ translateY: (1 - arrive.get()) * 8 }] }));
  return (
    <Animated.Text
      accessibilityRole="header"
      accessibilityLabel={text}
      style={[styles.title, { color, fontSize: size, fontWeight: weight, letterSpacing: tracking }, style]}
    >
      {text}
    </Animated.Text>
  );
}

function ProgressTrack({
  count,
  offset,
  width,
  pageWidth,
  label,
}: {
  count: number;
  offset: SharedValue<number>;
  width: number;
  pageWidth: number;
  label: string;
}) {
  const { colors } = useKinetikTheme();
  const segment = width > 0 ? width / count : 0;
  const progress = useAnimatedStyle(() => ({
    transform: [{ translateX: Math.max(0, Math.min(count - 1, offset.get() / Math.max(1, pageWidth))) * segment }],
  }));
  return (
    <Animated.View
      accessible
      accessibilityRole="text"
      accessibilityLabel={label}
      testID="onboarding-progress"
      style={[styles.track, { width, backgroundColor: colors.track }]}
    >
      <Animated.View style={[styles.progress, { width: segment, backgroundColor: colors.text }, progress]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  pager: { flex: 1 },
  illustration: { flex: 1, minHeight: 0, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  title: { flexShrink: 1, textAlign: 'left', paddingBottom: 1 },
  indicatorSlot: { alignItems: 'center' },
  track: { height: 3, borderRadius: 2, overflow: 'hidden' },
  progress: { height: 3, borderRadius: 2 },
  footer: { gap: 8 },
});
