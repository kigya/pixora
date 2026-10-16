import React, { useState } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  ReduceMotion,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Switch, Text, View } from 'react-native';
import Native from '../specs/NativeUpscale';
import { useApp } from '../application/AppProvider';
import { track } from '../application/telemetry';
import { useLocale } from './locale';
import { useTheme } from './theme';
import { createStyles, Button, Icon } from './components';
import { useOperation } from '../application/useOperation';
import { errorText } from '../application/errors';

export function TelemetryNotice() {
  const { t, lang, telemetry, setTelemetry } = useApp();
  const { colors } = useTheme();
  const { rtl } = useLocale();
  const s = createStyles(colors, rtl);
  const { operation, error, run } = useOperation();
  const [closing, setClosing] = useState(false);
  const [choices, setChoices] = useState({ analytics: false, crashes: false });
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
        {(['analytics', 'crashes'] as const).map(key => (
          <View key={key} style={[s.row, { flexWrap: 'nowrap' }]}>
            <Text style={[s.body, { flex: 1 }]}>
              {key === 'analytics' ? t.analyticsTitle : t.crashesTitle}
            </Text>
            <Switch
              accessibilityLabel={key === 'analytics' ? t.analyticsTitle : t.crashesTitle}
              value={choices[key]}
              onValueChange={value => setChoices(current => ({ ...current, [key]: value }))}
            />
          </View>
        ))}
        <Button
          secondary
          title={t.continue}
          disabled={!!operation || closing}
          onPress={() =>
            run(async () => {
              const next = await Native.updateTelemetrySettings(
                choices.analytics,
                choices.crashes,
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
        <Button
          secondary
          title={t.notNow}
          disabled={!!operation || closing}
          onPress={() => run(async () => setTelemetry(await Native.updateTelemetrySettings(false, false, true)))}
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
  const { operation, error, run } = useOperation();
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
          <Switch
            accessibilityLabel={
              key === 'analytics' ? t.analyticsTitle : t.crashesTitle
            }
            value={telemetry[key]}
            disabled={!!operation}
            trackColor={{ true: colors.accent, false: colors.border }}
            onValueChange={value =>
              run(async () => {
                // Record opt-out before collection stops; opt-in after it starts.
                if (!value)
                  track('settings_changed', { setting: key, value: 'off' });
                const next = { ...telemetry, [key]: value };
                setTelemetry(
                  await Native.updateTelemetrySettings(
                    next.analytics,
                    next.crashes,
                    next.noticeSeen,
                  ),
                );
                if (value)
                  track('settings_changed', { setting: key, value: 'on' });
              })
            }
          />
        </View>
      ))}
      {!!error && <Text style={s.errorText}>{errorText(error, lang)}</Text>}
    </View>
  );
}
