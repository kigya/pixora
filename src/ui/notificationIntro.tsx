import React, { useEffect, useRef, useState } from 'react';
import { AppState, Text } from 'react-native';
import { Panel } from './information';
import { Button, createStyles } from './components';
import { useApp } from '../application/AppProvider';
import { useTheme } from './theme';
import { useLocale } from './locale';

/** Dismissal cancels the pending launch; a button is an explicit decision. */
export function useNotificationIntro() {
  const [visible, setVisible] = useState(false);
  const resolver = useRef<((choice: boolean | null) => void) | null>(null);
  const { t } = useApp();
  const { colors } = useTheme();
  const { rtl } = useLocale();
  const s = createStyles(colors, rtl);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active' && resolver.current) {
        const resolve = resolver.current;
        resolver.current = null;
        setVisible(false);
        resolve(null);
      }
    });
    return () => {
      subscription.remove();
      resolver.current?.(null);
    };
  }, []);
  const finish = (choice: boolean | null) => {
    const resolve = resolver.current;
    resolver.current = null;
    setVisible(false);
    resolve?.(choice);
  };
  return {
    ask: () =>
      new Promise<boolean | null>(resolve => {
        resolver.current?.(null);
        resolver.current = resolve;
        setVisible(true);
      }),
    element: (
      <Panel visible={visible} onClose={() => finish(null)}>
        <Text accessibilityRole="header" style={s.heading}>
          {t.notificationIntroTitle}
        </Text>
        <Text style={s.body}>{t.notificationIntroBody}</Text>
        <Button
          title={t.notificationEnableContinue}
          onPress={() => finish(true)}
        />
        <Button
          secondary
          title={t.notificationWithoutContinue}
          onPress={() => finish(false)}
        />
      </Panel>
    ),
  };
}
