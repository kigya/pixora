import {
  emptySession,
  sessionReducer,
  workSize,
  languageFor,
  storageReserve,
  isActive,
} from '../src/domain/session';
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
