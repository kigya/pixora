import React, { useMemo } from 'react';
import { SvgXml } from 'react-native-svg';
import { MorphSelect, type MorphSelectOption } from '../components/kinetik/morph-select';
import { flagXml } from './flags';
import { languages } from './locale';
import { useApp } from '../application/AppProvider';
import { useTheme } from './theme';
import { Icon } from './components';

const hebrewFlag = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36"><path fill="#fff" d="M0 0h36v36H0z"/><path fill="#0038b8" d="M0 6h36v3H0zm0 21h36v3H0z"/><path fill="none" stroke="#0038b8" stroke-width="1.5" d="M18 11 24 22H12z M18 25 12 14h12z"/></svg>';

export type LanguageSelectorProps = {
  value: string;
  onValueChange: (value: string) => void;
  testID?: string;
};

/** Shared Kinetik selector used inline in Settings and by the legacy route. */
export function LanguageSelector({ value, onValueChange, testID }: LanguageSelectorProps) {
  const { t, lang } = useApp();
  const { colors } = useTheme();
  const options = useMemo<readonly MorphSelectOption[]>(() => {
    const collator = new Intl.Collator(lang);
    return [
      { value: 'system', label: t.system, leading: <Icon name="globe" color={colors.muted} /> },
      ...[...languages]
        .sort((a, b) => collator.compare(a.name, b.name))
        .map(language => {
          const flag = language.flag ? flagXml[language.flag] : language.id === 'he' ? hebrewFlag : undefined;
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
            ) : <Icon name="globe" color={colors.muted} />,
          };
        }),
    ];
  }, [colors.muted, lang, t.system]);

  return (
    <MorphSelect
      testID={testID}
      label={t.language}
      closeLabel={t.back}
      value={value}
      options={options}
      searchPlaceholder={t.recreate.languageSearch}
      maxVisible={6}
      onValueChange={onValueChange}
    />
  );
}
