/** Decimal presentation only; durable cache limits remain binary MiB. */
export function storageAmount(bytes: number) {
  const safe = Number.isFinite(bytes) ? Math.max(0, bytes) : 0;
  const unit = safe >= 1_000_000_000 ? 'GB' : 'MB';
  return { value: safe / (unit === 'GB' ? 1_000_000_000 : 1_000_000), unit };
}
export function formatStorage(bytes: number, locale: string) {
  const { value, unit } = storageAmount(bytes);
  const format = new Intl.NumberFormat(locale, { maximumFractionDigits: value < 10 ? 2 : 1 });
  return `${value > 0 && value < 0.01 ? '<0.01' : format.format(value)} ${unit}`;
}
