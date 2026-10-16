import { createContext, useContext, useMemo } from 'react';
import type { LocaleCode } from './i18n';
import registry from '../locales/registry.json';
export const languages = registry;
export const LocaleContext = createContext<LocaleCode>('en');
export function useLocale() {
  const locale = useContext(LocaleContext);
  const formatter = useMemo(
    () => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }),
    [locale],
  );
  return {
    locale,
    rtl: registry.find(language => language.id === locale)?.direction === 'rtl',
    number: (value: number) => formatter.format(value),
  };
}
// Arabic digits have weak RTL bidi classes. Mark separators as LTR as well.
export const ltrValue = (value: string) =>
  `\u2066\u200E${value.replace(/([×·:/%])/g, '\u200E$1\u200E')}\u200E\u2069`;
