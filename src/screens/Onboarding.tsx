import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  AppState,
  BackHandler,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Animated, {
  cancelAnimation,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useIsFocused } from '@react-navigation/native';
import type { Routes } from '../navigation/routes';
import { useApp } from '../application/AppProvider';
import Native from '../specs/NativeUpscale';
import { Button, createStyles, Segments } from '../ui/components';
import { useTheme } from '../ui/theme';
import { useLocale } from '../ui/locale';
import { usePane } from '../ui/layout';

const samples = [
  [
    require('../../assets/presets/standard-before.jpg'),
    require('../../assets/presets/standard-after.jpg'),
  ],
  [
    require('../../assets/presets/art-before.jpg'),
    require('../../assets/presets/art-after.jpg'),
  ],
  [
    require('../../assets/presets/pixel-before.png'),
    require('../../assets/presets/pixel-after.png'),
  ],
];
const profileNames = ['standard', 'art', 'pixel'] as const;

function Fragment({
  index,
  size,
  progress,
}: {
  index: number;
  size: number;
  progress: SharedValue<number>;
}) {
  const col = index % 3,
    row = Math.floor(index / 3),
    cell = size / 3;
  const motion = useAnimatedStyle(() => {
    const remaining = 1 - Math.min(1, progress.value / 0.45);
    return {
      opacity: 1 - remaining * 0.55,
      transform: [
        { translateX: (col - 1) * 34 * remaining },
        { translateY: (row - 1) * 34 * remaining },
        { rotate: `${(index % 2 ? -1 : 1) * 8 * remaining}deg` },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: cell,
          height: cell,
          left: col * cell,
          top: row * cell,
          overflow: 'hidden',
        },
        motion,
      ]}
    >
      <Image
        source={samples[0][0]}
        resizeMode="cover"
        style={{
          position: 'absolute',
          width: size,
          height: size,
          left: -col * cell,
          top: -row * cell,
        }}
      />
    </Animated.View>
  );
}

/** All motion is local presentation: this screen never starts inference or reads a photo. */
export function Onboarding({
  navigation,
  route,
}: NativeStackScreenProps<Routes, 'Onboarding'>) {
  const { t, settings, setSettings } = useApp();
  const { colors } = useTheme();
  const { rtl } = useLocale();
  const pane = usePane();
  const focused = useIsFocused();
  const s = createStyles(colors, rtl);
  const [page, setPage] = useState(0);
  const [sample, setSample] = useState(0);
  const [comparison, setComparison] = useState('compare');
  const [reduced, setReduced] = useState(true);
  const [foreground, setForeground] = useState(
    AppState.currentState === 'active',
  );
  const exiting = useRef(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const progress = useSharedValue(1);
  const fraction = useSharedValue(0.5);
  const transition = useSharedValue(1);
  const size = Math.max(120, Math.min(380, pane.width - 64));
  const running = focused && foreground && !reduced;
  const titles = [
    t.onboarding.detailTitle,
    t.onboarding.modesTitle,
    t.onboarding.offlineTitle,
  ];
  const bodies = [
    t.onboarding.detailBody,
    t.onboarding.modesBody,
    t.onboarding.offlineBody,
  ];
  const copy = t.onboarding;
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(value => {
        if (mounted) setReduced(value);
      })
      .catch(() => {});
    const motion = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduced,
    );
    const state = AppState.addEventListener('change', value =>
      setForeground(value === 'active'),
    );
    return () => {
      mounted = false;
      motion.remove();
      state.remove();
    };
  }, []);
  useEffect(() => {
    setComparison('compare');
    if (running) {
      transition.value = 0;
      transition.value = withTiming(1, {
        duration: 250,
        reduceMotion: ReduceMotion.System,
      });
      progress.value = 0;
      progress.value = withTiming(1, {
        duration: 1200,
        reduceMotion: ReduceMotion.System,
      });
      fraction.value = 1;
      fraction.value = withTiming(0.35, {
        duration: 1400,
        reduceMotion: ReduceMotion.System,
      });
    } else {
      cancelAnimation(transition);
      transition.value = 1;
      cancelAnimation(progress);
      cancelAnimation(fraction);
      progress.value = 1;
      fraction.value = 0.5;
    }
    return () => {
      cancelAnimation(transition);
      cancelAnimation(progress);
      cancelAnimation(fraction);
    };
  }, [page, sample, running, progress, fraction, transition]);
  useEffect(() => {
    if (page !== 1 || !running || sample === 2) return;
    const timer = setTimeout(() => setSample(value => value + 1), 2600);
    return () => clearTimeout(timer);
  }, [page, running, sample]);
  const finish = async () => {
    if (exiting.current) return;
    exiting.current = true;
    setSaving(true);
    setFailed(false);
    try {
      if (settings.onboardingVersion === 0)
        setSettings(await Native.completeOnboarding());
      navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
    } catch {
      exiting.current = false;
      setFailed(true);
      setSaving(false);
    }
  };
  useEffect(() => {
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!focused) return false;
      if (page > 0) setPage(value => value - 1);
      else if (route.params.replay) navigation.goBack();
      else return false;
      return true;
    });
    return () => back.remove();
  }, [focused, navigation, page, route.params.replay]);
  const entrance = useAnimatedStyle(() => ({
    opacity: transition.value,
    transform: [
      {
        translateY:
          page === 2 ? (1 - progress.value) * -36 : (1 - progress.value) * 16,
      },
      { scale: page === 2 ? 0.8 + progress.value * 0.2 : 1 },
    ],
  }));
  const clip = useAnimatedStyle(() => ({
    transform: [{ translateX: -(1 - fraction.value) * size }],
  }));
  const counter = useAnimatedStyle(() => ({
    transform: [{ translateX: (1 - fraction.value) * size }],
  }));
  const divider = useAnimatedStyle(() => ({
    transform: [{ translateX: fraction.value * size }],
  }));
  const fragments = useAnimatedStyle(() => ({
    opacity: progress.value < 0.45 ? 1 : 0,
  }));
  const gesture = Gesture.Pan()
    .activeOffsetX([-8, 8])
    .failOffsetY([-12, 12])
    .onUpdate(e => {
      cancelAnimation(fraction);
      fraction.value = Math.max(0, Math.min(1, e.x / size));
    });
  const selected = page === 1 ? sample : 0;
  return (
    <SafeAreaView style={s.screen} edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={[s.content, styles.content]}>
        <View style={s.header}>
          <Text style={[s.heading, { flex: 1 }]}>Pixora</Text>
          <Button
            title={copy.skip}
            secondary
            disabled={saving}
            onPress={finish}
          />
        </View>
        <View style={[styles.stage, { minHeight: size + 56 }]}>
          {page === 2 && (
            <View
              pointerEvents="none"
              style={[
                styles.phone,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                  width: size + 24,
                  height: size + 56,
                },
              ]}
            />
          )}
          <Animated.View style={[{ width: size, gap: 12 }, entrance]}>
            <GestureDetector gesture={gesture}>
              <View
                style={{
                  width: size,
                  height: size,
                  overflow: 'hidden',
                  borderRadius: 24,
                  direction: 'ltr',
                }}
                accessible
                accessibilityLabel={`${t.before} / ${t.after}. ${t.comparisonHelp}`}
              >
                <Image
                  source={samples[selected][1]}
                  resizeMode="cover"
                  style={{ width: size, height: size }}
                />
                <Animated.View
                  pointerEvents="none"
                  style={[
                    StyleSheet.absoluteFill,
                    { overflow: 'hidden' },
                    clip,
                  ]}
                >
                  <Animated.View style={counter}>
                    <Image
                      source={samples[selected][0]}
                      resizeMode="cover"
                      style={{ width: size, height: size }}
                    />
                  </Animated.View>
                </Animated.View>
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.divider,
                    { height: size, backgroundColor: colors.cyan },
                    divider,
                  ]}
                />
                {page === 0 && (
                  <Animated.View
                    pointerEvents="none"
                    style={[StyleSheet.absoluteFill, fragments]}
                  >
                    {Array.from({ length: 9 }, (_, index) => (
                      <Fragment
                        key={index}
                        index={index}
                        size={size}
                        progress={progress}
                      />
                    ))}
                  </Animated.View>
                )}
              </View>
            </GestureDetector>
            <Segments
              preserveOrder
              values={[
                { id: 'before', label: t.before },
                { id: 'compare', label: t.compare },
                { id: 'after', label: t.after },
              ]}
              value={comparison}
              onChange={value => {
                setComparison(value);
                cancelAnimation(fraction);
                fraction.value =
                  value === 'before' ? 1 : value === 'after' ? 0 : 0.5;
              }}
            />
          </Animated.View>
        </View>
        {page === 1 && (
          <Segments
            values={profileNames.map((id, index) => ({
              id: String(index),
              label: t.presets[id].title,
            }))}
            value={String(sample)}
            onChange={id => setSample(Number(id))}
          />
        )}
        <View style={{ gap: 12 }} accessibilityLiveRegion="polite">
          <Text
            accessibilityRole="header"
            style={[s.title, { textAlign: 'center' }]}
          >
            {titles[page]}
          </Text>
          <Text style={[s.body, { textAlign: 'center' }]}>{bodies[page]}</Text>
        </View>
        <View
          style={[s.row, { justifyContent: 'center', gap: 8 }]}
          accessible
          accessibilityLabel={`${page + 1} / 3`}
        >
          {[0, 1, 2].map(index => (
            <View
              key={index}
              style={{
                width: index === page ? 24 : 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: index === page ? colors.accent : colors.border,
              }}
            />
          ))}
        </View>
        {failed && (
          <Text style={s.errorText} accessibilityLiveRegion="polite">
            {t.error}
          </Text>
        )}
        <Button
          title={page === 2 ? copy.start : copy.next}
          disabled={saving}
          onPress={page === 2 ? finish : () => setPage(value => value + 1)}
        />
        {page > 0 && (
          <Button
            title={t.back}
            secondary
            disabled={saving}
            onPress={() => setPage(value => value - 1)}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'space-between', gap: 24 },
  stage: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
  },
  phone: { position: 'absolute', borderWidth: 2, borderRadius: 36 },
  divider: { position: 'absolute', top: 0, left: 0, width: 2 },
});
