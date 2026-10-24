import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from 'expo-router/native-stack';
import type { Routes } from '../navigation/routes';
import Native from '../specs/NativeUpscale';
import { Button, createStyles } from '../ui/components';
import { useTheme } from '../ui/theme';
import { useApp } from '../application/AppProvider';
import { LanguageSelector } from '../ui/languageSelector';
import { useOperation } from '../application/useOperation';
import { errorText } from '../application/errors';

export function LanguageScreen({
  navigation,
}: NativeStackScreenProps<Routes, 'Language'>) {
  const { settings, setSettings, t, lang } = useApp();
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const { error, run } = useOperation();

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Button title={t.back} secondary icon="back" onPress={() => navigation.goBack()} />
          <Text style={styles.heading}>{t.language}</Text>
        </View>
        <LanguageSelector
          testID="language-selector"
          value={settings.language}
          onValueChange={value =>
            run(async () => {
              setSettings(await Native.updateSettings(value, settings.format, settings.theme));
              navigation.goBack();
            })
          }
        />
        {!!error && <Text style={styles.errorText}>{errorText(error, lang)}</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}
