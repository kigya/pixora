import { Canvas, Circle, Group, Path, Skia } from '@shopify/react-native-skia';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { useHaptic } from '../../lib/kinetik/hooks/use-haptic';
import { useReduceMotion } from '../../lib/kinetik/hooks/use-reduce-motion';
import { spring } from '../../lib/kinetik/motion/motion';
import { useKinetikTheme } from '../../lib/kinetik/tokens/theme';

export type ThemeMode = 'system' | 'light' | 'dark';

export type ThemeSwitchProps = {
  value: ThemeMode;
  /** Current operating-system appearance, used to keep the sun/moon truthful in System mode. */
  systemDark?: boolean;
  onValueChange: (value: ThemeMode) => void;
  /** Visible heading above the three direct theme choices. */
  label?: string;
  /** Direct-choice labels; each remains visible and may wrap in narrow layouts. */
  optionLabels?: Readonly<Record<ThemeMode, string>>;
  /** Read by screen readers when there is no visible label. */
  accessibilityLabel?: string;
  /** A tap as it switches. Defaults to true. */
  haptics?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

const BOX = 48;
const ICON = 28;
const C = ICON / 2;

/**
 * A three-choice theme control with an animated sun/moon indicator. The icon
 * follows the effective appearance while each mode can be selected directly.
 */
export function ThemeSwitch({
  value,
  systemDark = false,
  onValueChange,
  label,
  optionLabels = { system: 'System', light: 'Light', dark: 'Dark' },
  accessibilityLabel = 'Theme',
  haptics = true,
  testID,
  style,
}: ThemeSwitchProps) {
  const { colors, font, radius } = useKinetikTheme();
  const reduced = useReduceMotion();
  const haptic = useHaptic(haptics);
  const dark = value === 'dark' || (value === 'system' && systemDark);
  const p = useSharedValue(dark ? 1 : 0);
  const press = useSharedValue(0);

  useEffect(() => {
    p.set(withSpring(dark ? 1 : 0, spring('smooth', reduced)));
  }, [dark, reduced, p]);

  const ink = useDerivedValue(() =>
    interpolateColor(Math.min(1, Math.max(0, p.get())), [0, 1], [colors.warning, colors.sky]),
  );
  const core = useDerivedValue(() => 5.5 + p.get() * 3.5);
  const biteX = useDerivedValue(() => C + 14 - p.get() * 9.5);
  const biteY = useDerivedValue(() => C - 14 + p.get() * 10);
  const rays = useDerivedValue(() => {
    const t = Math.min(1, Math.max(0, p.get()));
    const b = Skia.PathBuilder.Make();
    const inner = 9;
    const outer = 12.5 - t * 3.5;
    if (outer - inner < 0.2) return b.detach();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + t * (Math.PI / 2);
      b.moveTo(C + Math.cos(a) * inner, C + Math.sin(a) * inner);
      b.lineTo(C + Math.cos(a) * outer, C + Math.sin(a) * outer);
    }
    return b.detach();
  });

  const shell = useAnimatedStyle(() => ({ transform: [{ scale: 1 - press.get() * 0.08 }] }));

  return (
    <View testID={testID} style={[styles.container, style]}>
      <View style={styles.headingRow}>
        <Animated.View
          style={[
            styles.box,
            {
              backgroundColor: colors.surfaceRaised,
              borderColor: colors.border,
              borderRadius: radius.pill,
            },
            shell,
          ]}
        >
          <Canvas style={styles.icon}>
            <Group layer>
              <Circle cx={C} cy={C} r={core} color={ink} />
              <Circle cx={biteX} cy={biteY} r={7.5} color={ink} blendMode="dstOut" />
            </Group>
            <Path path={rays} style="stroke" strokeWidth={2} strokeCap="round" color={ink} />
          </Canvas>
        </Animated.View>
        {label ? <Text style={{ color: colors.text, fontSize: font.size.md, fontWeight: font.weight.medium, flexShrink: 1 }}>{label}</Text> : null}
      </View>
      <View accessible accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel} style={styles.options}>
        {(['system', 'light', 'dark'] as const).map(mode => {
          const selected = mode === value;
          return (
            <Pressable
              key={mode}
              testID={testID ? `${testID}-option-${mode}` : undefined}
              onPress={() => {
                if (selected) return;
                haptic('tick');
                onValueChange(mode);
              }}
              accessibilityRole="radio"
              accessibilityLabel={optionLabels[mode]}
              accessibilityState={{ checked: selected, disabled: false }}
              style={[
                styles.option,
                {
                  backgroundColor: selected ? colors.surfaceRaised : colors.background,
                  borderColor: selected ? colors.azure : colors.border,
                  borderRadius: radius.md,
                },
              ]}
            >
              <Text style={{ color: colors.text, fontSize: font.size.sm, fontWeight: selected ? font.weight.semibold : font.weight.medium, textAlign: 'center' }}>
                {optionLabels[mode]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', gap: 12 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  options: { flexDirection: 'row', gap: 8 },
  option: { flex: 1, minWidth: 0, minHeight: BOX, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 8, alignItems: 'center', justifyContent: 'center' },
  box: { width: BOX, height: BOX, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  icon: { width: ICON, height: ICON },
});
