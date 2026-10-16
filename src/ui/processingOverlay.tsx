import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, AppState, StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { useTheme } from './theme';
export function ProcessingOverlay({
  height,
  active,
  restricted = false,
}: {
  height: number;
  active: boolean;
  restricted?: boolean;
}) {
  const { colors } = useTheme();
  const offset = useSharedValue(-80);
  const [foreground, setForeground] = useState(
    AppState.currentState === 'active',
  );
  const [reduce, setReduce] = useState(true);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(value => {
        if (alive) setReduce(value);
      })
      .catch(() => {});
    const motion = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduce,
    );
    const state = AppState.addEventListener('change', value =>
      setForeground(value === 'active'),
    );
    return () => {
      alive = false;
      motion.remove();
      state.remove();
    };
  }, []);
  useEffect(() => {
    cancelAnimation(offset);
    if (active && foreground && !reduce && !restricted) {
      offset.value = -80;
      offset.value = withRepeat(
        withTiming(height, { duration: 3000, easing: Easing.linear }),
        -1,
        false,
      );
    }
    return () => cancelAnimation(offset);
  }, [active, foreground, reduce, restricted, height, offset]);
  const animated = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.value }],
  }));
  const moving = active && foreground && !reduce && !restricted;
  return (
    <View
      testID="processing-overlay"
      collapsable={false}
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[
        StyleSheet.absoluteFill,
        {
          opacity: active ? 1 : 0,
          borderWidth: 1,
          borderColor: colors.accent,
          borderRadius: 24,
          overflow: 'hidden',
        },
      ]}
    >
      {
        <Animated.View
          testID="processing-scan"
          collapsable={false}
          style={[
            {
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 80,
              opacity: moving ? 0.22 : 0,
            },
            animated,
          ]}
        >
          <Svg
            width="100%"
            height="100%"
            viewBox="0 0 1 80"
            preserveAspectRatio="none"
          >
            <Defs>
              <LinearGradient
                id="scan"
                x1="0"
                y1="0"
                x2="0"
                y2="80"
                gradientUnits="userSpaceOnUse"
              >
                <Stop offset="0" stopColor="#7C3AED" stopOpacity="0" />
                <Stop offset={0.6} stopColor="#7C3AED" />
                <Stop offset="1" stopColor="#22D3EE" />
              </LinearGradient>
            </Defs>
            <Rect width={1} height={80} fill="url(#scan)" />
          </Svg>
        </Animated.View>
      }
    </View>
  );
}
