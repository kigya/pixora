import { strings, type LocaleCode } from '../ui/i18n';
export function errorText(error: unknown, lang: LocaleCode) {
  const localKey = (error as { localKey?: 'busyClear' })?.localKey;
  if (localKey) return strings[lang][localKey];
  const code = (error as { code?: string })?.code ?? 'INFERENCE_FAILED';
  const dictionary = strings[lang].errors;
  if (code === 'TIME_LIMIT' || code === 'RECREATE_TIME_LIMIT') {
    const minutes = new Intl.NumberFormat(lang).format(code === 'RECREATE_TIME_LIMIT' ? 45 : 30);
    return dictionary.TIME_LIMIT.replace('{minutes}', minutes);
  }
  return (
    dictionary[code as keyof typeof dictionary] ?? dictionary.INFERENCE_FAILED
  );
}
