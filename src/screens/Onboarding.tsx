import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import type { Routes } from '../navigation/routes';
import Native from '../specs/NativeUpscale';
import { useApp } from '../application/AppProvider';
import { useTheme } from '../ui/theme';
import { useReduceMotion } from '../lib/kinetik/hooks/use-reduce-motion';
import { Onboarding as KinetikOnboarding } from '../components/kinetik/screens/onboarding';
import type { OnboardingSlide } from '../components/kinetik/screens/onboarding';

const bridgeBefore = require('../../assets/presets/standard-before.jpg');
const bridgeAfter = require('../../assets/presets/standard-after.jpg');
const catBefore = require('../../assets/recreate/before.png');
const catAfter = require('../../assets/recreate/after.png');

export function Onboarding({
  navigation,
  route,
}: NativeStackScreenProps<Routes, 'Onboarding'>) {
  const { t, settings, setSettings } = useApp();
  const { colors } = useTheme();
  const replay = route.params?.replay === true;

  const finish = async () => {
    if (!replay && settings.onboardingVersion === 0)
      setSettings(await Native.completeOnboarding());
    if (replay) navigation.goBack();
    else navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
  };

  const slides: readonly OnboardingSlide[] = [
    {
      key: 'details',
      title: t.onboarding.detailsTitle,
      visual: active => (
        <CompareReveal
          active={active}
          before={bridgeBefore}
          after={bridgeAfter}
          beforeLabel={t.before}
          afterLabel={t.after}
        />
      ),
    },
    {
      key: 'recreate',
      title: t.onboarding.recreateTitle,
      visual: active => (
        <CompareReveal
          active={active}
          before={catBefore}
          after={catAfter}
          beforeLabel={t.before}
          afterLabel={t.after}
        />
      ),
    },
    {
      key: 'privacy',
      title: t.onboarding.privacyTitle,
      visual: active => <PrivatePhone image={bridgeAfter} active={active} />,
    },
  ];

  return (
    <View style={[styles.fill, { backgroundColor: colors.bg }]}>
      <KinetikOnboarding
        slides={slides}
        onFinish={finish}
        onSkip={finish}
        nextLabel={t.onboarding.next}
        finishLabel={t.onboarding.start}
        skipLabel={t.onboarding.skip}
        stepLabel={(current, total) =>
          t.onboarding.step.replace('{current}', String(current)).replace('{total}', String(total))
        }
      />
    </View>
  );
}

/** Auto-reveals the result once; the image cannot capture taps or swipes. */
function CompareReveal({
  active,
  before,
  after,
  beforeLabel,
  afterLabel,
}: {
  active: boolean;
  before: number;
  after: number;
  beforeLabel: string;
  afterLabel: string;
}) {
  const reduced = useReduceMotion();
  const { colors } = useTheme();
  const progress = useSharedValue(0);
  const [frameWidth, setFrameWidth] = useState(0);
  useEffect(() => {
    cancelAnimation(progress);
    progress.set(reduced ? (active ? 1 : 0) : 0);
    if (active && !reduced) progress.set(withTiming(1, { duration: 1250 }));
    return () => cancelAnimation(progress);
  }, [active, progress, reduced]);
  const reveal = useAnimatedStyle(() => ({ width: `${progress.get() * 100}%` }));
  const onLayout = (event: LayoutChangeEvent) =>
    setFrameWidth(event.nativeEvent.layout.width);
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      onLayout={onLayout}
      style={[styles.demoFrame, { backgroundColor: colors.surface }]}
    >
      <Image source={before} resizeMode="cover" style={StyleSheet.absoluteFill} />
      <Animated.View style={[styles.reveal, reveal]}>
        <Image
          source={after}
          resizeMode="cover"
          style={[styles.resultImage, { width: frameWidth }]}
        />
      </Animated.View>
      <View style={styles.beforeBadge}>
        <Text style={[styles.badgeText, { color: colors.text }]}>{beforeLabel}</Text>
      </View>
      <View style={styles.afterBadge}>
        <Text style={[styles.badgeText, { color: colors.text }]}>{afterLabel}</Text>
      </View>
    </View>
  );
}

function PrivatePhone({ image, active }: { image: number; active: boolean }) {
  const { colors } = useTheme();
  const reduced = useReduceMotion();
  const progress = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    cancelAnimation(progress);
    progress.set(reduced ? (active ? 1 : 0) : 0);
    if (active && !reduced) progress.set(withTiming(1, { duration: 950 }));
    return () => cancelAnimation(progress);
  }, [active, progress, reduced]);
  const motion = useAnimatedStyle(() => ({
    opacity: 0.8 + progress.get() * 0.2,
    transform: [{ translateY: (1 - progress.get()) * 14 }, { scale: 0.94 + progress.get() * 0.06 }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      style={[styles.phone, { borderColor: colors.border }, motion]}
    >
      <View style={[styles.phoneSpeaker, { backgroundColor: colors.border }]} />
      <Image source={image} resizeMode="cover" style={styles.phoneImage} />
      <View style={[styles.phoneHome, { backgroundColor: colors.border }]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  demoFrame: {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    borderRadius: 20,
    backgroundColor: '#17151d',
  },
  reveal: { height: '100%', overflow: 'hidden', position: 'absolute', left: 0, top: 0 },
  resultImage: { height: '100%' },
  beforeBadge: { position: 'absolute', bottom: 14, left: 14, padding: 7, borderRadius: 8, backgroundColor: '#17151dcc' },
  afterBadge: { position: 'absolute', bottom: 14, right: 14, padding: 7, borderRadius: 8, backgroundColor: '#17151dcc' },
  badgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  phone: {
    width: 190,
    maxWidth: '72%',
    height: 260,
    maxHeight: '88%',
    borderWidth: 2,
    borderRadius: 30,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  phoneSpeaker: { width: 42, height: 4, borderRadius: 2, marginBottom: 9 },
  phoneImage: { flex: 1, width: '100%', borderRadius: 18 },
  phoneHome: { width: 30, height: 4, borderRadius: 2, marginTop: 8 },
});
