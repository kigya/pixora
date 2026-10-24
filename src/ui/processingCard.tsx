import React, { useEffect, useState } from 'react';
import {
  AppState,
  Text,
  View,
} from 'react-native';
import type { Session } from '../specs/NativeUpscale';
import { useLocale, ltrValue } from './locale';
import { useTheme } from './theme';
import { strings } from './i18n';
import { createStyles } from './components';

/** The clock lives here: its ticks do not render the rest of the workbench. */
export function ProcessingCard({ session: v }: { session: Session }) {
  const { locale, rtl, number } = useLocale();
  const { colors } = useTheme();
  const t = strings[locale];
  const s = createStyles(colors, rtl);
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
  return (
    <View style={s.row} testID="processing-time">
      <Text style={s.caption}>{t.elapsedLabel}</Text>
      <Text style={s.value}>{ltrValue(time)}</Text>
      {v.error === 'GPU_FAILED' && <Text style={s.caption}>{t.fallback}</Text>}
    </View>
  );
}
