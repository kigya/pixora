import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedReaction,
  FadeInDown,
  FadeOutUp,
  ReduceMotion,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { cacheLimits } from '../domain/presentation';
import { useApp } from '../application/AppProvider';
import { useTheme } from './theme';
import { useLocale } from './locale';
import { createStyles } from './components';

export function StorageSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const { t } = useApp();
  const { colors } = useTheme();
  const { rtl, number } = useLocale();
  const s = createStyles(colors, rtl);
  const { fontScale } = useWindowDimensions();
  const [width, setWidth] = useState(240);
  const found = cacheLimits.findIndex(n => n === value);
  const index = found < 0 ? 4 : found;
  const [previewIndex, setPreviewIndex] = useState(index);
  const position = useSharedValue(index / 4);
  useAnimatedReaction(
    () => Math.round(position.value * 4),
    (next, previous) => {
      if (next !== previous) scheduleOnRN(setPreviewIndex, next);
    },
  );
  useEffect(() => {
    setPreviewIndex(index);
    position.value = withTiming(index / 4, {
      duration: 180,
      reduceMotion: ReduceMotion.System,
    });
  }, [index, position]);
  const label = (n: number) =>
    n === 0 ? t.cacheNo : n === -1 ? t.cacheUnlimited : `${number(n)} MiB`;
  const choose = (step: number) =>
    onChange(cacheLimits[Math.min(4, Math.max(0, step))]);
  const commit = (step: number) => choose(step);
  const travel = Math.max(1, width - 48);
  const pan = Gesture.Pan()
    .activeOffsetX([-8, 8])
    .failOffsetY([-12, 12])
    .onUpdate(e => {
      const fraction = Math.max(0, Math.min(1, (e.x - 24) / travel));
      position.value = rtl ? 1 - fraction : fraction;
    })
    .onEnd(() => {
      const step = Math.round(position.value * 4);
      position.value = withTiming(step / 4, {
        duration: 180,
        reduceMotion: ReduceMotion.System,
      });
      scheduleOnRN(commit, step);
    })
    .onFinalize((_e, success) => {
      if (!success)
        position.value = withTiming(index / 4, {
          duration: 180,
          reduceMotion: ReduceMotion.System,
        });
    });
  const tap = Gesture.Tap().onEnd((e, success) => {
    if (!success) return;
    const fraction = Math.max(0, Math.min(1, (e.x - 24) / travel));
    const step = Math.round((rtl ? 1 - fraction : fraction) * 4);
    position.value = withTiming(step / 4, {
      duration: 180,
      reduceMotion: ReduceMotion.System,
    });
    scheduleOnRN(commit, step);
  });
  const thumb = useAnimatedStyle(() => ({
    transform: [
      { translateX: (rtl ? 1 - position.value : position.value) * travel },
    ],
  }));
  const fill = useAnimatedStyle(() => ({
    transform: [{ scaleX: position.value }],
  }));
  const preview = cacheLimits[previewIndex];
  return (
    <View style={styles.group}>
      <View
        style={[
          styles.value,
          {
            backgroundColor: colors.badge,
            alignSelf: rtl ? 'flex-end' : 'flex-start',
          },
        ]}
      >
        <View
          style={{
            flexDirection: rtl ? 'row-reverse' : 'row',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <View
            style={{
              minHeight: 28 * fontScale,
              minWidth: preview > 0 ? 52 * fontScale : undefined,
            }}
          >
            <Animated.Text
              key={previewIndex}
              entering={FadeInDown.duration(180).reduceMotion(
                ReduceMotion.System,
              )}
              exiting={FadeOutUp.duration(180).reduceMotion(
                ReduceMotion.System,
              )}
              style={[
                s.body,
                {
                  color: colors.badgeText,
                  fontWeight: '600',
                  textAlign: 'center',
                },
              ]}
            >
              {preview > 0 ? number(preview) : label(preview)}
            </Animated.Text>
          </View>
          {preview > 0 && (
            <Text style={[s.body, { color: colors.badgeText }]}>MiB</Text>
          )}
        </View>
      </View>
      <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>
        <View
          accessibilityRole="adjustable"
          accessible
          accessibilityLabel={t.cacheLimit}
          accessibilityValue={{
            min: 0,
            max: 4,
            now: index,
            text: label(cacheLimits[index]),
          }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={e =>
            choose(index + (e.nativeEvent.actionName === 'increment' ? 1 : -1))
          }
          onLayout={e => setWidth(e.nativeEvent.layout.width)}
          style={styles.touch}
        >
          <View style={[styles.track, { backgroundColor: colors.border }]} />
          <Animated.View
            pointerEvents="none"
            style={[
              styles.track,
              {
                backgroundColor: colors.accent,
                transformOrigin: rtl ? 'right' : 'left',
              },
              fill,
            ]}
          />
          {cacheLimits.map((n, i) => (
            <View
              key={n}
              pointerEvents="none"
              testID={`storage-stop-${i}`}
              style={[
                styles.stop,
                {
                  position: 'absolute',
                  left: 21 + ((rtl ? 4 - i : i) / 4) * travel,
                  backgroundColor:
                    i <= previewIndex ? colors.accent : colors.muted,
                },
              ]}
            />
          ))}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.thumb,
              { backgroundColor: colors.surface, borderColor: colors.accent },
              thumb,
            ]}
          />
        </View>
      </GestureDetector>
      <View
        style={{
          minHeight: 48,
          height: Math.max(48, 24 * fontScale),
          direction: 'ltr',
        }}
      >
        {cacheLimits.map((n, i) => (
          <Pressable
            key={n}
            accessibilityRole="button"
            accessibilityLabel={label(n)}
            onPress={() => choose(i)}
            testID={`storage-label-${i}`}
            style={[styles.option, { left: ((rtl ? 4 - i : i) / 4) * travel }]}
          >
            <Text
              style={[
                s.caption,
                {
                  fontSize: 12,
                  textAlign: 'center',
                  color: i === previewIndex ? colors.badgeText : colors.muted,
                },
              ]}
            >
              {n === -1 ? '∞' : number(n)}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={s.caption}>{t.cacheLimitNote}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 8 },
  value: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  touch: { height: 48, justifyContent: 'center', direction: 'ltr' },
  track: {
    position: 'absolute',
    left: 24,
    right: 24,
    height: 6,
    borderRadius: 3,
  },
  stops: {
    position: 'absolute',
    left: 21,
    right: 21,
    justifyContent: 'space-between',
  },
  stop: { width: 6, height: 6, borderRadius: 3 },
  thumb: {
    position: 'absolute',
    left: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 3,
  },
  option: {
    position: 'absolute',
    width: 48,
    minHeight: 48,
    justifyContent: 'center',
  },
});
