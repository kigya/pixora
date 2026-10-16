import en from '../locales/en.json';
import ru from '../locales/ru.json';
import zh from '../locales/zh-Hans.json';
import es from '../locales/es.json';
import hi from '../locales/hi.json';
import ar from '../locales/ar.json';
import fr from '../locales/fr.json';
import de from '../locales/de.json';
import ja from '../locales/ja.json';
import it from '../locales/it.json';
import id from '../locales/id.json';
import tr from '../locales/tr.json';
import nl from '../locales/nl.json';
import ro from '../locales/ro.json';
import pl from '../locales/pl.json';
import uk from '../locales/uk.json';
import cs from '../locales/cs.json';
import sv from '../locales/sv.json';
import hu from '../locales/hu.json';
import vi from '../locales/vi.json';
import el from '../locales/el.json';
import ko from '../locales/ko.json';
import fa from '../locales/fa.json';
import bn from '../locales/bn.json';
import ur from '../locales/ur.json';
import th from '../locales/th.json';
import ta from '../locales/ta.json';
import te from '../locales/te.json';
import mr from '../locales/mr.json';
import pa from '../locales/pa.json';
import jv from '../locales/jv.json';
import gu from '../locales/gu.json';
import he from '../locales/he.json';
import ptBR from '../locales/pt-BR.json';
export type Copy = typeof en;
export const strings = {
  en,
  ru,
  'zh-Hans': zh,
  es,
  hi,
  ar,
  'pt-BR': ptBR,
  fr,
  de,
  ja,
  it,
  id,
  tr,
  nl,
  ro,
  pl,
  uk,
  cs,
  sv,
  hu,
  vi,
  el,
  ko,
  fa,
  bn,
  ur,
  th,
  ta,
  te,
  mr,
  pa,
  jv,
  gu,
  he,
} satisfies Record<string, Copy>;
export type LocaleCode = keyof typeof strings;
export function formatCopy(text: string, values: Record<string, string>) {
  return text.replace(
    /\{(\w+)\}/g,
    (_, key: string) => values[key] ?? `{${key}}`,
  );
}
