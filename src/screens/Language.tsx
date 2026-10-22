import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';
import type { NativeStackScreenProps } from 'expo-router/native-stack';
import type { Routes } from '../navigation/routes';
import Native from '../specs/NativeUpscale';
import { languages } from '../ui/locale';
import { flagXml } from '../ui/flags';
import { Button, Icon, createStyles } from '../ui/components';
import { useTheme } from '../ui/theme';
import { useLocale } from '../ui/locale';
import { useApp } from '../application/AppProvider';
import { MorphSelect } from '../components/kinetik/morph-select';
import { useOperation } from '../application/useOperation';
import { errorText } from '../application/errors';

const hebrewFlag = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36"><path fill="#fff" d="M0 0h36v36H0z"/><path fill="#0038b8" d="M0 6h36v3H0zm0 21h36v3H0z"/><path fill="none" stroke="#0038b8" stroke-width="1.5" d="M18 11 24 22H12z M18 25 12 14h12z"/></svg>';

export function LanguageScreen({
  navigation,
}: NativeStackScreenProps<Routes, 'Language'>) {
  const { settings, setSettings, t, lang } = useApp();
  const { colors } = useTheme();
  const { rtl } = useLocale();
  const styles = createStyles(colors, rtl);
  const { error, run } = useOperation();
  const collator = new Intl.Collator(lang);
  const options = [
    {
      value: 'system',
      label: t.system,
      leading: <Icon name="globe" color={colors.muted} />,
    },
    ...[...languages]
      .sort((a, b) => collator.compare(a.name, b.name))
      .map(language => {
        const flag = language.flag
          ? flagXml[language.flag]
          : language.id === 'he'
            ? hebrewFlag
            : undefined;
        return {
          value: language.id,
          label: language.name,
          leading: flag ? (
            <SvgXml
              xml={flag}
              width={28}
              height={22}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            />
          ) : (
            <Icon name="globe" color={colors.muted} />
          ),
        };
      }),
  ];
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Button title={t.back} secondary icon="back" onPress={() => navigation.goBack()} />
          <Text style={styles.heading}>{t.language}</Text>
        </View>
        <MorphSelect
          label={t.language}
          closeLabel={t.back}
          value={settings.language}
          options={options}
          searchPlaceholder={t.recreate.languageSearch}
          maxVisible={6}
          onValueChange={value =>
            run(async () => {
              setSettings(
                await Native.updateSettings(value, settings.format, settings.theme),
              );
              navigation.goBack();
            })
          }
        />
        {!!error && <Text style={styles.errorText}>{errorText(error, lang)}</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}
