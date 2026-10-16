import registry from '../locales/registry.json';
import type { LocaleCode } from '../ui/i18n';
import type { Session } from '../specs/NativeUpscale';
export const emptySession: Session = {
  mode: 'quality',
  modelId: 'realesrgan-x4plus',
  timings: {},
  schemaVersion: 2,
  sequence: 0,
  sessionId: '',
  jobId: '',
  phase: '',
  completedTiles: 0,
  totalTiles: 0,
  state: 'EMPTY',
  scale: 2,
  backend: '',
  progress: -1,
  startedAt: 0,
  elapsedMs: 0,
  image: null,
  resultUri: '',
  resultWidth: 0,
  resultHeight: 0,
  error: '',
  exportState: 'EXPORT_IDLE',
  exports: [],
};
export const activeStates = [
  'PREPARING',
  'RUNNING',
  'FINALIZING',
  'CANCELLING',
];
export function isActive(s: Session) {
  return activeStates.includes(s.state);
}
export function sessionReducer(current: Session, next: Session): Session {
  return next.sequence > current.sequence ? next : current;
}
export function workSize(width: number, height: number) {
  const factor = Math.min(1, 1024 / Math.max(width, height));
  return {
    width: Math.max(1, Math.floor(width * factor)),
    height: Math.max(1, Math.floor(height * factor)),
  };
}
export function languageFor(setting: string, system: string): LocaleCode {
  if (setting === 'pt') return 'pt-BR';
  if (registry.some(item => item.id === setting)) return setting as LocaleCode;
  const base = system.toLowerCase().replace('_', '-').split('-')[0];
  if (base === 'zh') return 'zh-Hans';
  if (base === 'pt') return 'pt-BR';
  return registry.some(item => item.id === base) ? (base as LocaleCode) : 'en';
}
export function storageReserve(width: number, height: number, scale: number) {
  return Math.max(256 * 1024 * 1024, width * height * scale * scale * 16);
}
