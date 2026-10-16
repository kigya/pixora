import React, { useEffect, useState } from 'react';
import {
  AppState,
  Text,
  View,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  ReduceMotion,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import type { Session } from '../specs/NativeUpscale';
import { useLocale, ltrValue } from './locale';
import { useTheme } from './theme';
import { strings } from './i18n';
import { createStyles, Icon } from './components';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** The clock lives here: its ticks do not render the rest of the workbench. */
export function ProcessingCard({ session: v }: { session: Session }) {
  const { locale, rtl, number } = useLocale();
  const { colors } = useTheme();
  const t = strings[locale];
  const s = createStyles(colors, rtl);
  const window = useWindowDimensions();
  const [clock, setClock] = useState(Date.now());
  const [foreground, setForeground] = useState(
    AppState.currentState === 'active',
  );
  useEffect(() => {
    const listener = AppState.addEventListener('change', state =>
      setForeground(state === 'active'),
    );
    return () => listener.remove();
  }, []);
  useEffect(() => {
    if (!foreground) return;
    setClock(Date.now());
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [foreground, v.startedAt]);
  const elapsed = Math.max(v.elapsedMs, clock - v.startedAt);
  const seconds = new Intl.NumberFormat(locale, {
    minimumIntegerDigits: 2,
    useGrouping: false,
  });
  const time = `${number(Math.floor(elapsed / 60000))}:${seconds.format(
    Math.floor(elapsed / 1000) % 60,
  )}`;
  const step =
    v.state === 'FINALIZING' ||
    ['building_result', 'writing_result'].includes(v.phase)
      ? 2
      : v.phase === 'upscaling'
      ? 1
      : 0;
  const headings = [t.preparing, t.processing, t.finalizing];
  const icons = ['image', 'spark', 'save'] as const;
  const percent = Math.max(0, Math.min(100, Math.floor(v.progress)));
  const displayedProgress = useSharedValue(percent);
  useEffect(() => {
    displayedProgress.value = withTiming(percent, {
      duration: foreground ? 180 : 0,
      reduceMotion: ReduceMotion.System,
    });
  }, [displayedProgress, foreground, percent]);
  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: 239 * (1 - displayedProgress.value / 100),
  }));
  const compact = window.width < 360 || window.fontScale >= 1.5;
  return (
    <View style={s.card}>
      <View style={[s.row, { flexWrap: compact ? 'wrap' : 'nowrap', gap: 16 }]}>
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={t.processing}
          accessibilityValue={
            v.progress >= 0
              ? { min: 0, max: 100, now: percent }
              : { text: headings[step] }
          }
          style={styles.ring}
        >
          <Svg width={88} height={88} viewBox="0 0 88 88" accessible={false}>
            <Circle
              cx={44}
              cy={44}
              r={38}
              fill="none"
              stroke={colors.border}
              strokeWidth={6}
            />
            <AnimatedCircle
              cx={44}
              cy={44}
              r={38}
              fill="none"
              stroke={colors.accent}
              strokeWidth={6}
              strokeLinecap="round"
              strokeDasharray={239}
              animatedProps={ringProps}
              rotation={-90}
              origin="44, 44"
            />
          </Svg>
          <View pointerEvents="none" style={styles.ringText}>
            <Text style={[s.value, { fontSize: 18 }]}>
              {v.progress >= 0 ? ltrValue(`${number(percent)}%`) : '…'}
            </Text>
          </View>
        </View>
        <View style={[styles.heading, { alignItems: 'flex-end' }]}>
          <Text style={s.caption}>{t.elapsedLabel}</Text>
          <Text style={s.value}>{ltrValue(time)}</Text>
        </View>
      </View>
      <View style={[styles.steps, { flexDirection: 'column' }]}>
        {headings.map((title, index) => (
          <View
            key={title}
            style={[
              styles.step,
              { flexDirection: rtl ? 'row-reverse' : 'row' },
            ]}
          >
            <View
              style={[
                styles.stepIcon,
                {
                  backgroundColor:
                    index === step ? colors.badge : colors.raised,
                },
              ]}
            >
              <Icon
                name={index < step ? 'check' : icons[index]}
                color={index <= step ? colors.badgeText : colors.muted}
                size={18}
              />
            </View>
            <Text
              style={[
                s.caption,
                { flex: 1, color: index === step ? colors.text : colors.muted },
              ]}
            >
              {title}
            </Text>
          </View>
        ))}
      </View>
      <Text style={s.body}>
        {t.stages[v.phase as keyof typeof t.stages] ?? t.stages.upscaling}
      </Text>
      {v.error === 'GPU_FAILED' ? (
        <Text style={s.caption}>{t.fallback}</Text>
      ) : elapsed > 300000 ? (
        <Text style={s.caption}>{t.long}</Text>
      ) : v.backend === 'CPU' ? (
        <Text style={s.caption}>{t.cpu}</Text>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  ring: { width: 88, height: 88, direction: 'ltr' },
  ringText: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heading: { flex: 1, minWidth: 120, gap: 8 },
  steps: { gap: 12 },
  step: { alignItems: 'center', gap: 12 },
  stepIcon: { padding: 8, borderRadius: 10 },
});
