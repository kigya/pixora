import { strings, type LocaleCode } from '../ui/i18n';
export function errorText(error: unknown, lang: LocaleCode) {
  const localKey = (error as { localKey?: 'busyClear' })?.localKey;
  if (localKey) return strings[lang][localKey];
  const code = (error as { code?: string })?.code ?? 'INFERENCE_FAILED';
  const dictionary = strings[lang].errors;
  return (
    dictionary[code as keyof typeof dictionary] ?? dictionary.INFERENCE_FAILED
  );
}
