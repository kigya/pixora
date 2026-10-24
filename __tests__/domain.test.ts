import {
  emptySession,
  sessionReducer,
  workSize,
  languageFor,
  storageReserve,
  isActive,
} from '../src/domain/session';
import { originalSizeAllowed, processingDimensions } from '../src/domain/resolution';
import { formatStorage, storageAmount } from '../src/domain/storage';
import type { ImageInfo } from '../src/specs/NativeUpscale';
test('large inputs preserve ratio, small inputs never grow', () => {
  expect(workSize(4000, 3000)).toEqual({ width: 1024, height: 768 });
  expect(workSize(1, 20000)).toEqual({ width: 1, height: 1024 });
  expect(workSize(73, 89)).toEqual({ width: 73, height: 89 });
});
test('late bridge snapshot cannot roll state back', () => {
  const running = { ...emptySession, sequence: 10, state: 'RUNNING' };
  expect(sessionReducer(running, { ...emptySession, sequence: 9 })).toBe(
    running,
  );
  expect(isActive(running)).toBe(true);
  expect(isActive({ ...running, state: 'SUCCEEDED' })).toBe(false);
});
test('manual language overrides system, unsupported locale falls back to English', () => {
  expect(languageFor('en', 'ru-RU')).toBe('en');
  expect(languageFor('system', 'ru-RU')).toBe('ru');
  expect(languageFor('system', 'fi-FI')).toBe('en');
});
test('storage budget covers 4x output and enforces minimum reserve', () => {
  expect(storageReserve(1024, 1024, 4)).toBe(268435456);
  expect(storageReserve(20, 20, 2)).toBe(268435456);
});

test('supported languages resolve regional system tags and manual preferences', () => {
  for (const [tag, code] of [
    ['en-US', 'en'],
    ['ru-RU', 'ru'],
    ['zh-TW', 'zh-Hans'],
    ['zh-Hans-CN', 'zh-Hans'],
    ['es-MX', 'es'],
    ['hi-IN', 'hi'],
    ['ar-SA', 'ar'],
    ['pt-PT', 'pt-BR'],
    ['fr-FR', 'fr'],
    ['de-DE', 'de'],
    ['ja-JP', 'ja'],
  ]) {
    expect(languageFor('system', tag)).toBe(code);
    expect(languageFor(code, 'it-IT')).toBe(code);
  }
  expect(languageFor('ru', 'en-US')).toBe('ru');
});
test('legacy Portuguese preference migrates to Brazilian Portuguese', () => {
  expect(languageFor('pt', 'en-US')).toBe('pt-BR');
  expect(languageFor('pt-BR', 'en-US')).toBe('pt-BR');
});

test('storage display sanitizes invalid bytes and switches decimal units at one GB', () => {
  expect(storageAmount(-1)).toEqual({ value: 0, unit: 'MB' });
  expect(storageAmount(Number.NaN)).toEqual({ value: 0, unit: 'MB' });
  expect(storageAmount(Number.POSITIVE_INFINITY)).toEqual({ value: 0, unit: 'MB' });
  expect(storageAmount(999_999_999).unit).toBe('MB');
  expect(storageAmount(1_000_000_000)).toEqual({ value: 1, unit: 'GB' });
  expect(formatStorage(1_234_000_000, 'en')).toBe('1.23 GB');
  expect(formatStorage(4_000, 'en')).toBe('<0.01 MB');
  expect(formatStorage(0, 'en')).toBe('0 MB');
});

test('resolution helpers preserve prepared dimensions and validate legacy original-size limits', () => {
  const image: ImageInfo = {
    id: 'image', mime: 'image/jpeg', size: 1000, width: 4000, height: 3000,
    workWidth: 1024, workHeight: 768, hasAlpha: false, previewUri: 'file:///preview.jpg',
    needsPreparation: true,
  };
  expect(processingDimensions(image, 'prepared')).toEqual({ width: 1024, height: 768 });
  expect(processingDimensions(image, 'original')).toEqual({ width: 4000, height: 3000 });

  expect(originalSizeAllowed(4096, 976, 4)).toBe(true);
  expect(originalSizeAllowed(4096, 977, 4)).toBe(false); // 64 MP output limit
  expect(originalSizeAllowed(4097, 1, 4)).toBe(false); // output side limit
  expect(originalSizeAllowed(8192, 1, 2)).toBe(true); // inclusive output side limit
  expect(originalSizeAllowed(8193, 1, 2)).toBe(false);
  expect(originalSizeAllowed(1.5, 100, 2)).toBe(false);
  expect(originalSizeAllowed(0, 100, 2)).toBe(false);
  expect(originalSizeAllowed(100, -1, 2)).toBe(false);
  expect(originalSizeAllowed(100, 100, 3)).toBe(false);
});
