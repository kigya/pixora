import { createContext, useContext } from 'react';
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
