import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Image,
  PanResponder,
  AccessibilityInfo,
  useWindowDimensions,
} from 'react-native';
import { previewSize } from '../domain/presentation';
import Svg, { Defs, LinearGradient, Stop, Rect, Path } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  ReduceMotion,
} from 'react-native-reanimated';
import { track, type EventContext } from '../application/telemetry';
import type { Copy } from './i18n';
import { useTheme } from './theme';
import { useLocale } from './locale';
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
  const { colors } = useTheme();
  const { rtl } = useLocale();
  const styles = createStyles(colors, rtl);
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  return (
    <Animated.View style={animated}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        onPressIn={() => {
          scale.value = withTiming(0.98, {
            duration: 100,
            reduceMotion: ReduceMotion.System,
          });
        }}
        onPressOut={() => {
          scale.value = withTiming(1, {
            duration: 140,
            reduceMotion: ReduceMotion.System,
          });
        }}
        style={({ pressed }) => [
          styles.button,
          secondary ? styles.secondary : styles.primary,
          disabled && { opacity: 0.45 },
          pressed && { opacity: 0.8 },
        ]}
      >
        {icon && (
          <Icon name={icon} color={secondary ? colors.text : '#FFFFFF'} />
        )}
        <Text
          style={[
            styles.buttonText,
            { color: secondary ? colors.text : '#FFFFFF' },
          ]}
        >
          {title}
        </Text>
      </Pressable>
    </Animated.View>
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
  const { colors } = useTheme();
  const { rtl } = useLocale();
  const styles = createStyles(colors, rtl);
  return (
    <View
      style={[
        styles.segments,
        preserveOrder && { flexDirection: 'row', direction: 'ltr' },
      ]}
    >
      {values.map(item => (
        <Pressable
          key={item.id}
          accessibilityRole="radio"
          accessibilityState={{ selected: value === item.id }}
          accessibilityLabel={item.label}
          onPress={() => onChange(item.id)}
          style={[styles.segment, value === item.id && styles.selected]}
        >
          <Text
            style={[
              styles.segmentText,
              value !== item.id && { color: colors.muted },
            ]}
          >
            {item.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
export function UploadArt() {
  const { colors } = useTheme();
  const { rtl } = useLocale();
  const styles = createStyles(colors, rtl);
  return (
    <View style={styles.art}>
      <Svg width="100%" height="100%" viewBox="0 0 320 170">
        <Defs>
          <LinearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#7C3AED" stopOpacity=".35" />
            <Stop offset="1" stopColor="#22D3EE" stopOpacity=".12" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="320" height="170" rx="24" fill="url(#g)" />
        <Rect
          x="99"
          y="27"
          width="122"
          height="116"
          rx="24"
          fill={colors.surface}
          stroke="#7C3AED"
          strokeWidth="1.5"
        />
        <Path
          d="M125 111l21-24 18 17 19-29 18 36 M181 62h1"
          fill="none"
          stroke="#A78BFA"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </Svg>
      <View style={styles.spark}>
        <Icon name="spark" color={colors.cyan} size={25} />
      </View>
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
  const { colors } = useTheme();
  const { rtl } = useLocale();
  const styles = createStyles(colors, rtl);
  const viewport = useWindowDimensions();
  const [width, setWidth] = useState(Math.max(1, viewport.width - 40)),
    [fraction, setFraction] = useState(0.5);
  const pan = PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_event, gesture) =>
      Math.abs(gesture.dx) > 6 &&
      Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.2,
    onPanResponderGrant: e =>
      setFraction(
        Math.max(
          0,
          Math.min(
            1,
            e.nativeEvent.locationX /
              Math.max(
                1,
                previewSize(
                  ratio,
                  1,
                  width,
                  Math.min(390, viewport.height * 0.48),
                ).width,
              ),
          ),
        ),
      ),
    onPanResponderMove: e =>
      setFraction(
        Math.max(
          0,
          Math.min(
            1,
            e.nativeEvent.locationX /
              Math.max(
                1,
                previewSize(
                  ratio,
                  1,
                  width,
                  Math.min(390, viewport.height * 0.48),
                ).width,
              ),
          ),
        ),
      ),
    onPanResponderRelease: () => track('comparison_used', { ...context, action: 'divider' }),
  });
  const bounds = previewSize(
    ratio,
    1,
    width,
    Math.min(390, viewport.height * 0.48),
  );
  const height = bounds.height;
  const imageWidth = bounds.width;
  return (
    <View
      style={{ gap: 12, direction: 'ltr' }}
      onLayout={e => setWidth(e.nativeEvent.layout.width)}
    >
      <View
        testID="comparison"
        style={[
          styles.preview,
          { height, width: imageWidth, alignSelf: 'center' },
        ]}
        {...pan.panHandlers}
        accessible={false}
      >
        <Image
          source={{ uri: after }}
          resizeMethod="scale"
          style={{ width: imageWidth, height }}
          resizeMode="contain"
        />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: imageWidth * fraction,
            height,
            overflow: 'hidden',
          }}
        >
          <Image
            source={{ uri: before }}
            resizeMethod="scale"
            style={{ width: imageWidth, height }}
            resizeMode="contain"
          />
        </View>
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: imageWidth * fraction - 1,
            top: 0,
            bottom: 0,
            width: 2,
            backgroundColor: '#FAFAFA',
          }}
        >
          <View style={styles.handle}>
            <Svg width={22} height={22} viewBox="0 0 24 24">
              <Path
                d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4"
                stroke="#18181B"
                strokeWidth={2}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </View>
        </View>
        <View pointerEvents="none" style={styles.compareLabels}>
          <Text style={styles.imageLabel}>{t.before}</Text>
          <Text style={styles.imageLabel}>{t.after}</Text>
        </View>
      </View>
      <Segments
        preserveOrder
        values={[
          { id: '1', label: t.before },
          { id: '0.5', label: t.compare },
          { id: '0', label: t.after },
        ]}
        value={String(fraction)}
        onChange={id => {
          track('comparison_used', { ...context, action: id === '1' ? 'before' : id === '0' ? 'after' : 'compare' });
          setFraction(Number(id));
          AccessibilityInfo.announceForAccessibility(
            id === '1' ? t.before : id === '0' ? t.after : t.compare,
          );
        }}
      />
      <Text style={styles.caption}>{t.comparisonHelp}</Text>
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
