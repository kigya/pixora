import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  Image,
  AccessibilityInfo,
} from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect, Path } from 'react-native-svg';
import Animated, {cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming, Easing} from 'react-native-reanimated';
import {useReduceMotion} from '../lib/kinetik/hooks/use-reduce-motion';
import { track, type EventContext } from '../application/telemetry';
import type { Copy } from './i18n';
import { useTheme } from './theme';
import { useLocale } from './locale';
import { PressJelly } from '../components/kinetik/press-jelly';
import { SegmentBar } from '../components/kinetik/segment-bar';
import { CompareSlider } from '../components/kinetik/compare-slider';
import { useKinetikTheme } from '../lib/kinetik/tokens/theme';
export function Icon({
  name,
  size = 22,
  color,
}: {
  name:
    | 'image'
    | 'spark'
    | 'settings'
    | 'back'
    | 'check'
    | 'share'
    | 'save'
    | 'phone'
    | 'globe'
    | 'chevron';
  size?: number;
  color?: string;
}) {
  const { colors } = useTheme();
  const { rtl } = useLocale();
  const paths = {
    phone: 'M7 3h10v18H7z M10 18h4 M14 6h6v5h-6z',
    globe:
      'M3 12h18 M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18 M12 3c-5 5-5 13 0 18c5-5 5-13 0-18',
    chevron: 'M9 5l7 7-7 7',
    image: 'M4 4h16v16H4z M4 16l5-5 4 4 3-3 4 4 M8 8h.01',
    spark: 'M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z',
    settings:
      'M21.85 10.26 L21.85 13.74 L19.52 14.74 L18.13 17.14 L18.43 19.66 L15.42 21.40 L13.39 19.88 L10.61 19.88 L8.58 21.40 L5.57 19.66 L5.87 17.14 L4.48 14.74 L2.15 13.74 L2.15 10.26 L4.48 9.26 L5.87 6.86 L5.57 4.34 L8.58 2.60 L10.61 4.12 L13.39 4.12 L15.42 2.60 L18.43 4.34 L18.13 6.86 L19.52 9.26 Z M12 8.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7',
    back: 'M15 5l-7 7 7 7',
    check: 'M5 12l4 4L19 6',
    share: 'M12 16V3 M7 8l5-5 5 5 M5 13v7h14v-7',
    save: 'M12 3v12 M7 10l5 5 5-5 M5 17v4h14v-4',
  };
  return (
    <Svg
      style={{
        transform: [
          { scaleX: rtl && (name === 'back' || name === 'chevron') ? -1 : 1 },
        ],
      }}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      accessibilityElementsHidden
    >
      <Path
        d={paths[name]}
        stroke={color ?? colors.text}
        strokeWidth={1.7}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
export function Button({
  title,
  onPress,
  secondary = false,
  disabled = false,
  icon,
  testID,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  icon?: React.ComponentProps<typeof Icon>['name'];
  testID?: string;
}) {
  const { colors } = useKinetikTheme();
  return (
    <PressJelly
        testID={testID}
        accessibilityLabel={title}
        disabled={disabled}
        onPress={onPress}
        variant={secondary ? 'surface' : 'ember'}
        leading={icon ? <Icon name={icon} color={secondary ? colors.text : colors.onEmber} /> : undefined}
        block
      >
      {title}
    </PressJelly>
  );
}
export function Segments({
  values,
  value,
  onChange,
  preserveOrder = false,
}: {
  preserveOrder?: boolean;
  values: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <SegmentBar
      label={values.map(item => item.label).join(', ')}
      options={values.map(item => ({ value: item.id, label: item.label }))}
      value={value}
      onChange={onChange}
      style={preserveOrder ? { direction: 'ltr' } : undefined}
    />
  );
}
export function UploadArt({active = true}: {active?: boolean}) {
  const { colors } = useTheme();
  const { rtl } = useLocale();
  const styles = createStyles(colors, rtl);
  const reduced = useReduceMotion();
  const float = useSharedValue(0);
  useEffect(() => {
    if (active && !reduced) float.set(withRepeat(withSequence(withTiming(1,{duration:2200,easing:Easing.inOut(Easing.sin)}),withTiming(0,{duration:2200,easing:Easing.inOut(Easing.sin)})),-1,false));
    else {cancelAnimation(float);float.set(0);}
    return () => cancelAnimation(float);
  },[active,reduced,float]);
  const motion = useAnimatedStyle(() => ({transform:[{translateY:-5*float.get()},{rotate:`${-1+2*float.get()}deg`}]}));
  const sparkle = useAnimatedStyle(() => ({transform:[{translateY:3*float.get()},{scale:1+0.07*float.get()}]}));
  return (
    <View style={styles.art} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width="100%" height="100%" viewBox="0 0 320 170">
        <Defs><LinearGradient id="g" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#7C3AED" stopOpacity=".35"/><Stop offset="1" stopColor="#22D3EE" stopOpacity=".12"/></LinearGradient></Defs>
        <Rect x="0" y="0" width="320" height="170" rx="24" fill="url(#g)"/>
      </Svg>
      <Animated.View style={[StyleSheet.absoluteFill,motion]}>
        <Svg width="100%" height="100%" viewBox="0 0 320 170">
          <Rect x="99" y="27" width="122" height="116" rx="24" fill={colors.surface} stroke="#7C3AED" strokeWidth="1.5"/>
          <Path d="M125 111l21-24 18 17 19-29 18 36 M181 62h1" fill="none" stroke="#A78BFA" strokeWidth="3" strokeLinecap="round"/>
        </Svg>
      </Animated.View>
      <Animated.View style={[styles.spark,sparkle]}><Icon name="spark" color={colors.cyan} size={25}/></Animated.View>
    </View>
  );
}

export function Comparison({
  before,
  after,
  ratio,
  t,
  context = {},
}: {
  context?: EventContext;
  before: string;
  after: string;
  ratio: number;
  t: Copy;
}) {
  const [choice, setChoice] = useState<'compare' | 'before' | 'after'>('compare');
  const announceChoice = (next: 'compare' | 'before' | 'after') => {
    setChoice(next);
    track('comparison_used', { ...context, action: next });
    AccessibilityInfo.announceForAccessibility(
      next === 'before' ? t.before : next === 'after' ? t.after : t.compare,
    );
  };
  return (
    <View style={{ gap: 12 }}>
      <CompareSlider
        key={choice}
        testID="comparison"
        accessibilityLabel={t.comparisonHelp}
        beforeLabel={t.before}
        afterLabel={t.after}
        before={<Image source={{ uri: before }} resizeMode="contain" style={StyleSheet.absoluteFill} />}
        after={<Image source={{ uri: after }} resizeMode="contain" style={StyleSheet.absoluteFill} />}
        aspectRatio={ratio}
        initial={choice === 'before' ? 1 : choice === 'after' ? 0 : 0.5}
        onPositionChange={() => track('comparison_used', { ...context, action: 'divider' })}
      />
      <Segments
        preserveOrder
        values={[
          { id: 'before', label: t.before },
          { id: 'compare', label: t.compare },
          { id: 'after', label: t.after },
        ]}
        value={choice}
        onChange={id => announceChoice(id as 'before' | 'compare' | 'after')}
      />
    </View>
  );
}
export const createStyles = (
  colors: ReturnType<typeof useTheme>['colors'],
  rtl = false,
) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg, direction: 'ltr' },
    content: {
      paddingHorizontal: 20,
      paddingBottom: 32,
      gap: 20,
      width: '100%',
      maxWidth: 720,
      alignSelf: 'center',
    },
    header: {
      flexDirection: rtl ? 'row-reverse' : 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
    },
    brand: {
      color: colors.text,
      fontSize: 19,
      fontWeight: '700',
      letterSpacing: -0.5,
      flexShrink: 1,
    },
    iconButton: {
      minWidth: 48,
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 16,
      backgroundColor: colors.surface,
    },
    title: {
      textAlign: rtl ? 'right' : 'left',
      color: colors.text,
      fontSize: 28,
      fontWeight: '700',
      letterSpacing: -0.7,
    },
    heading: {
      textAlign: rtl ? 'right' : 'left',
      color: colors.text,
      fontSize: 22,
      fontWeight: '700',
      flexShrink: 1,
    },
    body: {
      textAlign: rtl ? 'right' : 'left',
      color: colors.muted,
      fontSize: 16,
      lineHeight: 24,
    },
    caption: {
      textAlign: rtl ? 'right' : 'left',
      color: colors.muted,
      fontSize: 13,
      lineHeight: 20,
    },
    label: {
      textAlign: rtl ? 'right' : 'left',
      color: colors.muted,
      fontSize: 13,
      fontWeight: '600',
      letterSpacing: 0.7,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 24,
      padding: 20,
      gap: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    button: {
      minHeight: 56,
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderRadius: 16,
      flexDirection: rtl ? 'row-reverse' : 'row',
      gap: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primary: { backgroundColor: colors.accent },
    secondary: { backgroundColor: colors.raised },
    buttonText: {
      color: colors.text,
      fontSize: 16,
      fontWeight: '600',
      flexShrink: 1,
      textAlign: 'center',
    },
    segments: {
      flexDirection: rtl ? 'row-reverse' : 'row',
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 4,
      gap: 4,
      flexWrap: 'wrap',
    },
    segment: {
      minHeight: 48,
      flexGrow: 1,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    selected: { backgroundColor: colors.raised },
    segmentText: { color: colors.text, fontSize: 16, fontWeight: '600' },
    art: { height: 170, width: '100%' },
    spark: {
      position: 'absolute',
      right: '24%',
      top: 15,
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 10,
    },
    preview: {
      overflow: 'hidden',
      borderRadius: 24,
      backgroundColor: '#111116',
      alignItems: 'center',
      justifyContent: 'center',
    },
    handle: {
      position: 'absolute',
      top: '50%',
      left: -19,
      transform: [{ translateY: -20 }],
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: '#FAFAFA',
      alignItems: 'center',
      justifyContent: 'center',
    },
    compareLabels: {
      direction: 'ltr',
      position: 'absolute',
      top: 12,
      left: 12,
      right: 12,
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    imageLabel: {
      color: '#FAFAFA',
      fontSize: 13,
      backgroundColor: '#09090BCC',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 8,
    },
    badge: {
      alignSelf: rtl ? 'flex-end' : 'flex-start',
      flexDirection: rtl ? 'row-reverse' : 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.badge,
      borderRadius: 30,
      paddingVertical: 8,
      paddingHorizontal: 14,
    },
    badgeText: { color: colors.badgeText, fontSize: 13, fontWeight: '600' },
    row: {
      flexDirection: rtl ? 'row-reverse' : 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
    },
    value: {
      writingDirection: 'ltr',
      color: colors.text,
      fontSize: 16,
      fontWeight: '600',
    },
    error: {
      backgroundColor: colors.error,
      borderRadius: 16,
      padding: 16,
      gap: 8,
    },
    errorText: {
      textAlign: rtl ? 'right' : 'left',
      color: colors.errorText,
      fontSize: 15,
      lineHeight: 22,
    },
    progress: {
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.raised,
      overflow: 'hidden',
    },
    progressFill: { height: 8, backgroundColor: colors.accent },
    footer: { alignItems: 'center', paddingVertical: 4 },
    settingRow: { minHeight: 56, justifyContent: 'center', gap: 6 },
    success: { color: colors.green, fontSize: 15 },
  });
