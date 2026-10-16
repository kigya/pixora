import { formatCopy, type Copy } from './i18n';
import { ltrValue } from './locale';

/** Keep short tasks readable; equal rounded bounds use one value. */
export function formatEta(
  copy: Copy,
  lowMs: number,
  highMs: number,
  number: (value: number) => string,
) {
  const seconds = highMs < 60000;
  const divisor = seconds ? 1000 : 60000;
  const low = Math.max(1, Math.ceil(lowMs / divisor));
  const high = Math.max(low, Math.ceil(highMs / divisor));
  const template = seconds
    ? low === high
      ? copy.etaSecondsSingle
      : copy.etaSeconds
    : low === high
    ? copy.etaMinutesSingle
    : copy.etaRemaining;
  return formatCopy(template, {
    low: ltrValue(number(low)),
    high: ltrValue(number(high)),
    value: ltrValue(number(high)),
  });
}
