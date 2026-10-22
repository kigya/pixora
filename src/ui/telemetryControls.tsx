import React, { useEffect, useRef, useState } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  ReduceMotion,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Text, View } from 'react-native';
import Native, { type TelemetrySettings } from '../specs/NativeUpscale';
import { useApp } from '../application/AppProvider';
import { track } from '../application/telemetry';
import { useLocale } from './locale';
import { useTheme } from './theme';
import { createStyles, Button, Icon } from './components';
import { useOperation } from '../application/useOperation';
import { errorText } from '../application/errors';
import { PulseToggle } from '../components/kinetik/pulse-toggle';

export function TelemetryNotice() {
  const { t, lang, telemetry, setTelemetry } = useApp();
  const { colors } = useTheme();
  const { rtl } = useLocale();
  const s = createStyles(colors, rtl);
  const { operation, error, run } = useOperation();
  const [closing, setClosing] = useState(false);
  const height = useSharedValue(-1);
  const measuredHeight = useSharedValue(0);
  const opacity = useSharedValue(1);
  const offset = useSharedValue(0);
  const shellStyle = useAnimatedStyle(() => ({
    height: height.value < 0 ? undefined : height.value,
    overflow: 'hidden',
  }));
  const contentStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: offset.value }],
  }));
  if (telemetry.consentVersion === 2) return null;
  return (
    <Animated.View
      onLayout={e => {
        measuredHeight.value = e.nativeEvent.layout.height;
      }}
      style={shellStyle}
    >
      <Animated.View style={[s.card, contentStyle]}>
        <View style={s.row}>
          <Icon name="phone" color={colors.accent} />
          <Text style={[s.value, { flex: 1 }]}>{t.telemetryTitle}</Text>
        </View>
        <Text style={s.caption}>{t.telemetryIntro}</Text>
        <Button
          secondary
          title={t.continue}
          disabled={!!operation || closing}
          onPress={() =>
            run(async () => {
              const next = await Native.updateTelemetrySettings(
                telemetry.analytics,
                telemetry.crashes,
                true,
              );
              setClosing(true);
              offset.value = withTiming(-8, {
                duration: 180,
                reduceMotion: ReduceMotion.System,
              });
              opacity.value = withTiming(
                0,
                { duration: 180, reduceMotion: ReduceMotion.System },
                () => {
                  height.value = measuredHeight.value;
                  height.value = withTiming(
                    0,
                    { duration: 160, reduceMotion: ReduceMotion.System },
                    () => {
                      scheduleOnRN(setTelemetry, next);
                    },
                  );
                },
              );
            })
          }
        />
        {!!error && <Text style={s.errorText}>{errorText(error, lang)}</Text>}
      </Animated.View>
    </Animated.View>
  );
}
export function TelemetryControls() {
  const { t, lang, telemetry, setTelemetry } = useApp();
  const { colors } = useTheme();
  const { rtl } = useLocale();
  const s = createStyles(colors, rtl);
  const [displayed, setDisplayed] = useState(telemetry);
  const [error, setError] = useState<unknown>(null);
  const desired = useRef(telemetry);
  const confirmed = useRef(telemetry);
  const revision = useRef(0);
  const settled = useRef(0);
  const writes = useRef(Promise.resolve());
  useEffect(() => {
    if (settled.current !== revision.current) return;
    desired.current = telemetry;
    confirmed.current = telemetry;
    setDisplayed(telemetry);
  }, [telemetry]);
  const change = (key: 'analytics' | 'crashes', value: boolean) => {
    if (!value) track('settings_changed', { setting: key, value: 'off' });
    const next: TelemetrySettings = { ...desired.current, [key]: value };
    desired.current = next;
    const request = ++revision.current;
    setError(null);
    setDisplayed(next);
    setTelemetry(next);
    // Keep the native thumb responsive while persisting rapid changes in order.
    writes.current = writes.current.then(async () => {
      try {
        const saved = await Native.updateTelemetrySettings(
          next.analytics,
          next.crashes,
          next.noticeSeen,
        );
        confirmed.current = saved;
        if (value) track('settings_changed', { setting: key, value: 'on' });
        if (request === revision.current) {
          settled.current = request;
          desired.current = saved;
          setDisplayed(saved);
          setTelemetry(saved);
        }
      } catch (failure) {
        if (request === revision.current) {
          settled.current = request;
          desired.current = confirmed.current;
          setDisplayed(confirmed.current);
          setTelemetry(confirmed.current);
          setError(failure);
        }
      }
    });
  };
  return (
    <View style={s.card}>
      <Text style={s.label}>{t.telemetryTitle}</Text>
      {(['analytics', 'crashes'] as const).map(key => (
        <View key={key} style={[s.row, { flexWrap: 'nowrap' }]}>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={s.value}>
              {key === 'analytics' ? t.analyticsTitle : t.crashesTitle}
            </Text>
            <Text style={s.caption}>
              {key === 'analytics' ? t.analyticsBody : t.crashesBody}
            </Text>
          </View>
          <PulseToggle
            label={key === 'analytics' ? t.analyticsTitle : t.crashesTitle}
            value={displayed[key]}
            onValueChange={value => change(key, value)}
          />
        </View>
      ))}
      {!!error && <Text style={s.errorText}>{errorText(error, lang)}</Text>}
    </View>
  );
}
