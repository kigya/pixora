import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LanguagePicker } from '../ui/information';
import { useApp } from '../application/AppProvider';
import { useOperation } from '../application/useOperation';
import { useTheme } from '../ui/theme';
import { useLocale } from '../ui/locale';
import { createStyles } from '../ui/components';
import Native from '../specs/NativeUpscale';
import { errorText } from '../application/errors';

export function LanguageOnboarding() {
  const { settings, setSettings, t, lang } = useApp();
  const { colors } = useTheme();
  const { rtl } = useLocale();
  const s = createStyles(colors, rtl);
  const { operation, error, run } = useOperation();
  return (
    <SafeAreaView style={s.screen} edges={['top', 'bottom', 'left', 'right']}>
      <View style={[s.content, { flex: 1, justifyContent: 'center' }]}>
        <Text style={s.brand}>{t.title}</Text>
        <Text accessibilityRole="header" style={s.heading}>
          {t.language}
        </Text>
        <Text style={s.body}>{t.system}</Text>
        <View style={s.card}>
          <LanguagePicker
            value={settings.language}
            onChange={id =>
              run(async () => {
                const next = await Native.updateSettings(
                  id,
                  settings.format,
                  settings.theme,
                );
                setSettings(next);
              })
            }
          />
        </View>
        {!!operation && <ActivityIndicator color={colors.accent} />}
        {!!error && <Text style={s.errorText}>{errorText(error, lang)}</Text>}
      </View>
    </SafeAreaView>
  );
}
