import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useRouter } from 'expo-router';
import type { NativeStackScreenProps } from 'expo-router/native-stack';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  G,
  LinearGradient,
  Path,
  Rect,
  Stop,
  type SvgProps,
} from 'react-native-svg';
import type { Routes } from '../navigation/routes';
import Native from '../specs/NativeUpscale';
import { useApp } from '../application/AppProvider';
import { useTheme } from '../ui/theme';
import { useReduceMotion } from '../lib/kinetik/hooks/use-reduce-motion';
import { Onboarding as KinetikOnboarding } from '../components/kinetik/screens/onboarding';
import type { OnboardingSlide } from '../components/kinetik/screens/onboarding';

type SceneColors = { bg: string; surface: string; ink: string; accent: string; cyan: string; muted: string; border: string };
type SceneProps = SvgProps & { colors: SceneColors; detailed: boolean };

export function Onboarding({
  route,
}: NativeStackScreenProps<Routes, 'Onboarding'>) {
  const router = useRouter();
  const { t, settings, setSettings } = useApp();
  const { colors } = useTheme();
  const replay = String(route.params?.replay) === 'true';
  const [finishError, setFinishError] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const finishingRef = useRef(false);
  const sceneColors: SceneColors = {
    bg: colors.bg,
    surface: colors.surface,
    ink: colors.text,
    accent: colors.accent,
    cyan: colors.cyan,
    muted: colors.muted,
    border: colors.border,
  };

  const finish = async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setFinishing(true);
    try {
      if (!replay && settings.onboardingVersion === 0)
        setSettings(await Native.completeOnboarding());
      if (replay && router.canGoBack()) router.back();
      else if (replay) router.replace('/Settings');
      else router.replace('/Home');
    } catch {
      setFinishError(true);
    } finally {
      finishingRef.current = false;
      setFinishing(false);
    }
  };

  const slides: readonly OnboardingSlide[] = [
    {
      key: 'details',
      title: t.onboarding.detailsTitle,
      visual: active => <RevealScene active={active} colors={sceneColors} type="bridge" />,
    },
    {
      key: 'recreate',
      title: t.onboarding.recreateTitle,
      visual: active => <RevealScene active={active} colors={sceneColors} type="mountains" />,
    },
    {
      key: 'privacy',
      title: t.onboarding.privacyTitle,
      visual: active => <PrivatePhone active={active} colors={sceneColors} />,
    },
  ];

  return (
    <View style={[styles.fill, { backgroundColor: colors.bg }]}>
      {finishError ? <Text accessibilityRole="alert" testID="onboarding-error" style={[styles.error, { color: colors.muted }]}>{t.error}</Text> : null}
      <KinetikOnboarding
        slides={slides}
        onFinish={finish}
        onSkip={finish}
        busy={finishing}
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

/** A passive vector before/after wipe. The same composition remains registered. */
function RevealScene({
  active,
  colors,
  type,
}: {
  active: boolean;
  colors: SceneColors;
  type: 'bridge' | 'mountains';
}) {
  const reduced = useReduceMotion();
  const progress = useSharedValue(0);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    cancelAnimation(progress);
    progress.set(reduced ? (active ? 1 : 0) : 0);
    if (active && !reduced) progress.set(withTiming(1, { duration: 1450 }));
    return () => cancelAnimation(progress);
  }, [active, progress, reduced]);

  const reveal = useAnimatedStyle(() => ({ width: `${progress.get() * 100}%` }));
  const onLayout = (event: LayoutChangeEvent) => setSize(event.nativeEvent.layout);
  const Scene = type === 'bridge' ? BridgeArt : MountainArt;

  return (
    <View
      testID={`onboarding-visual-${type}-${active ? 'active' : 'inactive'}`}
      pointerEvents="none"
      accessible={false}
      onLayout={onLayout}
      style={styles.scene}
    >
      {size.width > 0 && size.height > 0 ? (
        <>
          <Scene width={size.width} height={size.height} colors={colors} detailed={false} />
          <Animated.View style={[styles.reveal, reveal]}>
            <Scene width={size.width} height={size.height} colors={colors} detailed />
          </Animated.View>
        </>
      ) : null}
    </View>
  );
}

function BridgeArt({ colors, detailed, ...props }: SceneProps) {
  return (
    <Svg testID="onboarding-art-bridge" viewBox="0 0 360 560" preserveAspectRatio="xMidYMid meet" {...props}>
      <Defs>
        <LinearGradient id="bridgeSky" x1="0" y1="0" x2="0.1" y2="1">
          <Stop offset="0" stopColor={colors.cyan} stopOpacity={0.48} />
          <Stop offset="1" stopColor={colors.bg} stopOpacity={0.08} />
        </LinearGradient>
        <LinearGradient id="bridgeWater" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.cyan} stopOpacity={0.34} />
          <Stop offset="1" stopColor={colors.bg} stopOpacity={0.86} />
        </LinearGradient>
        <LinearGradient id="bridgeDeck" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.surface} />
          <Stop offset="1" stopColor={colors.muted} stopOpacity={0.5} />
        </LinearGradient>
      </Defs>
      <Rect width="360" height="560" fill={colors.bg} />
      <Rect width="360" height="372" fill="url(#bridgeSky)" />
      <Circle cx="282" cy="116" r="30" fill={colors.ink} opacity="0.08" />
      <Circle cx="282" cy="116" r="22" fill={colors.cyan} opacity="0.42" />
      <Path d="M0 322Q58 275 119 312T242 303T360 294V382H0Z" fill={colors.surface} opacity="0.7" />
      <Path d="M0 358L69 317L113 359H0ZM360 350L284 309L246 360H360Z" fill={colors.muted} opacity="0.44" />
      <Rect y="365" width="360" height="195" fill="url(#bridgeWater)" />
      <Path d="M0 369H360" stroke={colors.ink} strokeOpacity="0.2" strokeWidth="3" />
      <Path d="M0 356H360V379H0Z" fill="url(#bridgeDeck)" />
      <Path d="M0 349Q55 336 105 259Q180 305 255 259Q305 336 360 349" fill="none" stroke={colors.accent} strokeWidth="9" strokeLinecap="round" />
      <Path d="M0 352Q55 337 105 263Q180 309 255 263Q305 337 360 352" fill="none" stroke={colors.ink} strokeOpacity="0.32" strokeWidth="2" />
      <Path d="M98 365V240H112V365 M248 365V240H262V365" fill={colors.accent} stroke={colors.ink} strokeOpacity="0.22" strokeWidth="2" />
      <Path d="M96 246H114 M246 246H264 M98 274H112 M248 274H262" stroke={colors.ink} strokeOpacity="0.46" strokeWidth="5" />
      <Path d="M50 345H310" stroke={colors.accent} strokeWidth="7" strokeLinecap="round" />
      {detailed ? (
        <G fill="none" stroke={colors.ink} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M56 337Q81 295 105 259Q180 305 255 259Q279 296 304 337" strokeWidth="2" opacity="0.84" />
          <Path d="M34 345V338 M70 345V318 M139 345V281 M180 345V273 M221 345V281 M290 345V318 M326 345V338" strokeWidth="2" />
          <Path d="M100 290L110 297 M100 320L110 326 M250 297L260 290 M250 326L260 320 M56 359H83 M124 359H154 M206 359H236 M277 359H304" strokeWidth="1.6" opacity="0.74" />
          <Path d="M0 412Q47 403 94 413T188 412T282 413T360 412 M0 454Q51 446 102 455T204 454T306 455T360 454 M18 500H86 M270 500H337 M72 530H153 M214 530H292" stroke={colors.cyan} strokeWidth="2.4" opacity="0.72" />
          <Path d="M18 132Q37 124 56 132 M55 166Q72 159 89 166 M134 112Q151 106 168 112" stroke={colors.ink} strokeOpacity="0.19" strokeWidth="3" />
        </G>
      ) : (
        <G fill={colors.muted} opacity={0.3}>
          <Rect x="127" y="406" width="48" height="15" rx="7" />
          <Rect x="216" y="468" width="70" height="11" rx="5" />
          <Rect x="31" y="484" width="58" height="13" rx="6" />
          <Rect x="56" y="143" width="33" height="8" rx="4" />
        </G>
      )}
    </Svg>
  );
}

function MountainArt({ colors, detailed, ...props }: SceneProps) {
  const farRidge = 'M0 342L42 296L75 323L126 242L160 287L207 205L251 276L288 228L360 330V430H0Z';
  const nearRidge = 'M0 386L56 339L93 366L154 278L194 326L246 261L297 337L330 308L360 352V455H0Z';
  return (
    <Svg testID="onboarding-art-mountains" viewBox="0 0 360 560" preserveAspectRatio="xMidYMid meet" {...props}>
      <Defs>
        <LinearGradient id="mountainSky" x1="0" y1="0" x2="0.2" y2="1">
          <Stop offset="0" stopColor={colors.cyan} stopOpacity="0.36" />
          <Stop offset="1" stopColor={colors.bg} stopOpacity="0.08" />
        </LinearGradient>
        <LinearGradient id="mountainLake" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.cyan} stopOpacity="0.4" />
          <Stop offset="1" stopColor={colors.accent} stopOpacity="0.1" />
        </LinearGradient>
        <ClipPath id="mountainWater"><Rect x="0" y="390" width="360" height="170" /></ClipPath>
      </Defs>
      <Rect width="360" height="560" fill={colors.bg} />
      <Rect width="360" height="390" fill="url(#mountainSky)" />
      <Circle cx="277" cy="119" r="49" fill={colors.cyan} opacity="0.16" />
      <Circle cx="277" cy="119" r="33" fill={colors.cyan} opacity="0.4" />
      <Path d={farRidge} fill={colors.muted} opacity="0.54" />
      <Path d={nearRidge} fill={colors.surface} stroke={colors.accent} strokeWidth="3" />
      <Path d="M0 386Q58 376 113 388T225 386T360 390V410H0Z" fill={colors.accent} opacity="0.62" />
      <Rect y="404" width="360" height="156" fill="url(#mountainLake)" />
      <G clipPath="url(#mountainWater)">
        <Path d="M0 425Q50 415 100 425T200 425T300 425T400 425 M0 456Q43 449 86 456T172 456T258 456T344 456T400 456 M20 495H102 M242 492H340 M73 529H164 M219 529H297" stroke={colors.cyan} strokeWidth="3" strokeLinecap="round" opacity={detailed ? 0.72 : 0.2} />
      </G>
      {detailed ? (
        <G fill="none" stroke={colors.ink} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M42 296L75 323L126 242L160 287L207 205L251 276L288 228" strokeWidth="2.5" opacity="0.85" />
          <Path d="M112 264L126 242L143 270L130 263L123 269Z M190 235L207 205L231 247L213 231L204 237Z M273 247L288 228L308 260L290 247L283 253Z" fill={colors.ink} strokeWidth="1.4" />
          <Path d="M57 339L93 366L154 278L194 326L246 261L297 337L330 308" strokeWidth="2.4" opacity="0.9" />
          <Path d="M8 377H26 M44 374H65 M304 378H324 M332 381H351" strokeWidth="3" opacity="0.56" />
          <Path d="M24 140Q42 134 60 140 M92 175Q110 168 128 175 M174 119Q190 113 206 119" stroke={colors.muted} strokeWidth="2" opacity="0.45" />
        </G>
      ) : (
        <G fill={colors.muted} opacity={0.35}>
          <Rect x="41" y="142" width="55" height="10" rx="5" />
          <Rect x="121" y="178" width="72" height="12" rx="6" />
          <Rect x="250" y="468" width="67" height="14" rx="7" />
          <Rect x="32" y="510" width="83" height="12" rx="6" />
        </G>
      )}
    </Svg>
  );
}

function PrivatePhone({ active, colors }: { active: boolean; colors: SceneColors }) {
  const reduced = useReduceMotion();
  const progress = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    cancelAnimation(progress);
    progress.set(reduced ? (active ? 1 : 0) : 0);
    if (active && !reduced) progress.set(withTiming(1, { duration: 1000 }));
    return () => cancelAnimation(progress);
  }, [active, progress, reduced]);
  const card = useAnimatedStyle(() => ({
    opacity: 0.35 + progress.get() * 0.65,
    transform: [{ translateX: (1 - progress.get()) * -42 }, { scale: 0.8 + progress.get() * 0.2 }],
  }));
  const shield = useAnimatedStyle(() => ({ opacity: progress.get(), transform: [{ scale: 0.78 + 0.22 * progress.get() }] }));

  return (
    <View testID={`onboarding-visual-privacy-${active ? 'active' : 'inactive'}`} pointerEvents="none" accessible={false} style={styles.phoneScene}>
      <Svg testID="onboarding-art-phone" viewBox="0 0 300 520" preserveAspectRatio="xMidYMid meet" width="100%" height="100%">
        <Defs>
          <LinearGradient id="privacyScreen" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors.accent} stopOpacity={0.36} />
            <Stop offset="1" stopColor={colors.cyan} stopOpacity={0.32} />
          </LinearGradient>
        </Defs>
        <Circle cx="53" cy="137" r="17" fill={colors.cyan} opacity="0.2" />
        <Circle cx="258" cy="374" r="26" fill={colors.accent} opacity="0.16" />
        <Rect x="69" y="51" width="162" height="410" rx="34" fill={colors.bg} stroke={colors.accent} strokeWidth="4" />
        <Rect x="82" y="91" width="136" height="324" rx="20" fill={colors.surface} stroke={colors.border} strokeWidth="2" />
        <Rect x="126" y="65" width="48" height="5" rx="2.5" fill={colors.muted} />
        <Rect x="133" y="433" width="34" height="5" rx="2.5" fill={colors.border} />
        <Path d="M96 343L128 295L151 322L177 271L204 343Z" fill="url(#privacyScreen)" />
        <Circle cx="184" cy="145" r="19" fill={colors.cyan} opacity="0.78" />
        <Path d="M97 369H203" stroke={colors.border} strokeWidth="5" strokeLinecap="round" />
        <Path d="M114 389H162" stroke={colors.border} strokeWidth="4" strokeLinecap="round" opacity="0.7" />
      </Svg>
      <Animated.View style={[styles.privateCard, { backgroundColor: colors.surface, borderColor: colors.border }, card]}>
        <View style={[styles.privateThumb, { backgroundColor: colors.cyan }]} />
        <View style={{ gap: 6 }}>
          <View style={[styles.privateLine, { width: 74, backgroundColor: colors.muted }]} />
          <View style={[styles.privateLine, { width: 48, backgroundColor: colors.border }]} />
        </View>
      </Animated.View>
      <Animated.View style={[styles.shield, { backgroundColor: colors.accent, borderColor: colors.bg }, shield]}>
        <Svg width={34} height={34} viewBox="0 0 34 34">
          <Path d="M17 4L28 8V16Q28 24 17 30Q6 24 6 16V8Z" fill="none" stroke="#FFFFFF" strokeWidth={2.3} strokeLinejoin="round" />
          <Path d="M12 17L16 21L23 13" fill="none" stroke="#FFFFFF" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  error: { position: 'absolute', zIndex: 2, bottom: 94, alignSelf: 'center', paddingHorizontal: 16, textAlign: 'center' },
  scene: { flex: 1, width: '100%', minHeight: 96, borderRadius: 20, overflow: 'hidden' },
  reveal: { position: 'absolute', left: 0, top: 0, bottom: 0, overflow: 'hidden' },
  phoneScene: { flex: 1, width: '100%', minHeight: 96, alignItems: 'center', justifyContent: 'center' },
  privateCard: { position: 'absolute', left: '7%', top: '48%', borderWidth: 1, borderRadius: 16, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, boxShadow: '0px 8px 16px rgba(0,0,0,0.18)' },
  privateThumb: { width: 28, height: 28, borderRadius: 8, opacity: 0.7 },
  privateLine: { height: 5, borderRadius: 4 },
  shield: { position: 'absolute', right: '7%', bottom: '16%', width: 56, height: 56, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderRadius: 28 },
});
