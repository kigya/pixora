import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { KinetikProvider } from '../lib/kinetik/tokens/theme';
export const darkColors = {
  bg: '#09090B',
  surface: '#18181B',
  raised: '#27272A',
  text: '#FAFAFA',
  muted: '#A1A1AA',
  accent: '#7C3AED',
  cyan: '#22D3EE',
  green: '#4ADE80',
  red: '#F87171',
  border: '#27272A',
  badge: '#24133C',
  badgeText: '#C4B5FD',
  error: '#32151E',
  errorText: '#FDA4AF',
};
export const lightColors = {
  bg: '#FAFAFC',
  surface: '#FFFFFF',
  raised: '#F1F1F5',
  text: '#18181B',
  muted: '#52525B',
  accent: '#6D28D9',
  cyan: '#0E7490',
  green: '#15803D',
  red: '#B91C1C',
  border: '#E4E4E7',
  badge: '#EDE9FE',
  badgeText: '#6D28D9',
  error: '#FFF1F2',
  errorText: '#B91C1C',
};
export const ThemeContext = createContext({ colors: darkColors, dark: true });
export const useTheme = () => useContext(ThemeContext);

type Colors = typeof darkColors;
function blend(from: string, to: string, amount: number): string {
  const a = parseInt(from.slice(1), 16), b = parseInt(to.slice(1), 16);
  const channel = (shift: number) => Math.round(((a >> shift) & 255) * (1 - amount) + ((b >> shift) & 255) * amount);
  return `#${[channel(16),channel(8),channel(0)].map(value => value.toString(16).padStart(2, '0')).join('')}`;
}

/** One palette transition drives app-owned and copied Kinetik controls together. */
export function PixoraThemeProvider({dark, children}: {dark: boolean; children: React.ReactNode}) {
  const target = dark ? darkColors : lightColors;
  const [colors, setColors] = useState<Colors>(target);
  const previous = useRef<Colors>(target);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => {if (mounted) setReduced(value);}).catch(() => {});
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {mounted = false; listener.remove();};
  }, []);
  useEffect(() => {
    if (reduced) {previous.current = target; setColors(target); return;}
    if (previous.current === target) return;
    const from = previous.current;
    let frame = 0;
    const started = Date.now();
    const tick = () => {
      const p = Math.min(1, (Date.now() - started) / 260);
      const next = Object.fromEntries(Object.keys(target).map(key => {
        const k = key as keyof Colors;
        // Keep intermediate tokens in hex for Kinetik alpha and shader helpers.
        return [k, blend(from[k], target[k], p)];
      })) as Colors;
      previous.current = p === 1 ? target : next;
      setColors(previous.current);
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, reduced]);
  return <ThemeContext.Provider value={{colors, dark}}>
    <KinetikProvider scheme={dark ? 'dark' : 'light'} colors={{
      background: colors.bg, surface: colors.surface, surfaceRaised: colors.raised,
      surfaceSunken: colors.bg, text: colors.text, textMuted: colors.muted,
      textSubtle: colors.muted, border: colors.border, borderStrong: colors.accent,
      ember: colors.accent, emberSoft: colors.badge, onEmber: '#FFFFFF',
      ice: colors.cyan, iceSoft: colors.badge, azure: colors.accent,
      azureSoft: colors.badge, onAzure: '#FFFFFF', sky: colors.cyan,
      success: colors.green, danger: colors.red,
    }}>{children}</KinetikProvider>
  </ThemeContext.Provider>;
}
