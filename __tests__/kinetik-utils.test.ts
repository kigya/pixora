import { Skia } from '@shopify/react-native-skia';
import { Platform } from 'react-native';
import { gradient } from '../src/lib/kinetik/tokens/gradient';
import { glow, withAlpha } from '../src/lib/kinetik/tokens/tokens';
import { colorUniform, runtimeEffect } from '../src/lib/kinetik/shaders/sksl';

test('runtimeEffect caches a compiled shader and reports a compiler rejection clearly', () => {
  const make = jest.spyOn(Skia.RuntimeEffect, 'Make');
  const compiled = { shader: 'compiled' } as never;
  make.mockReturnValueOnce(compiled);
  const source = `test shader ${Date.now()}`;
  expect(runtimeEffect(source)).toBe(compiled);
  expect(runtimeEffect(source)).toBe(compiled);
  expect(make).toHaveBeenCalledTimes(1);

  make.mockReturnValueOnce(null);
  expect(() => runtimeEffect(`${source} invalid`)).toThrow('Kinetik: shader failed to compile');
});

test('color uniforms default missing channels safely and preserve explicit alpha', () => {
  const color = jest.spyOn(Skia, 'Color').mockReturnValueOnce([undefined, 0.25, 0.75, undefined] as never);
  expect(colorUniform('not-a-color')).toEqual([0, 0.25, 0.75, 1]);
  color.mockReturnValueOnce([0.1, 0.2, 0.3, 0.4] as never);
  expect(colorUniform('#102030')).toEqual([0.1, 0.2, 0.3, 0.4]);
});

test('token helpers clamp alpha, leave unsupported colour formats alone, and expose both glow strengths', () => {
  expect(withAlpha('#123456', 2)).toBe('rgba(18, 52, 86, 1)');
  expect(withAlpha('#123456', -1)).toBe('rgba(18, 52, 86, 0)');
  expect(withAlpha('var(--accent)', 0.5)).toBe('var(--accent)');
  expect(glow('#abcdef')).toContain('rgba(171, 205, 239, 0.35)');
  expect(glow('#abcdef', 'strong')).toContain('rgba(171, 205, 239, 0.55)');
});

test('gradient uses the web background property only on web', () => {
  const original = Platform.OS;
  try {
    jest.replaceProperty(Platform, 'OS', 'web');
    expect(gradient('linear-gradient(red, blue)')).toEqual({ backgroundImage: 'linear-gradient(red, blue)' });
    jest.replaceProperty(Platform, 'OS', 'android');
    expect(gradient('linear-gradient(red, blue)')).toEqual({ experimental_backgroundImage: 'linear-gradient(red, blue)' });
  } finally {
    jest.replaceProperty(Platform, 'OS', original);
  }
});
