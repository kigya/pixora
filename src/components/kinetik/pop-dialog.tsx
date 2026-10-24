import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Modal,
  AccessibilityInfo,
  findNodeHandle,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';

import { useReduceMotion } from '../../lib/kinetik/hooks/use-reduce-motion';
import { durations, easings, spring } from '../../lib/kinetik/motion/motion';
import { useKinetikTheme } from '../../lib/kinetik/tokens/theme';
import { PressJelly } from './press-jelly';

export type PopDialogAction = {
  label: string;
  onPress: () => void;
  /** "primary" is filled, "danger" is filled in red. Defaults to "default". */
  tone?: 'default' | 'primary' | 'danger';
};

export type PopDialogProps = {
  visible: boolean;
  /** Called for a tap outside, Back on Android and the screen reader escape gesture. */
  onClose: () => void;
  closeLabel?: string;
  title: string;
  message?: string;
  /** Extra content between the message and the actions. */
  children?: ReactNode;
  /** One to three actions; two sit side by side, more are stacked. */
  actions: readonly PopDialogAction[];
  /** A tap outside closes it. Defaults to true. */
  dismissable?: boolean;
  testID?: string;
  backdropTestID?: string;
  style?: StyleProp<ViewStyle>;
  onShow?: () => void;
};

const MAX_W = 360;

/**
 * A dialog that pops up from just below the middle of the screen: the screen
 * dims, the card rises and settles on a soft spring, and it sinks back as it
 * closes. It stays mounted until its exit has finished.
 */
export function PopDialog({
  visible,
  onClose,
  closeLabel = 'Close dialog',
  title,
  message,
  children,
  actions,
  dismissable = true,
  testID,
  backdropTestID,
  style,
  onShow,
}: PopDialogProps) {
  const { colors, font, radius, space, shadow } = useKinetikTheme();
  const reduced = useReduceMotion();
  const window = useWindowDimensions();
  const titleRef = useRef<React.ElementRef<typeof Text>>(null);
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);
  const t = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      t.set(reduced ? 1 : withSpring(1, spring('smooth')));
      return;
    }
    if (reduced) {
      t.set(0);
      const timer = setTimeout(() => setMounted(false), 0);
      return () => clearTimeout(timer);
    }
    t.set(
      withTiming(0, { duration: durations.quick, easing: easings.exit }, (done) => {
        if (done) scheduleOnRN(setMounted, false);
      }),
    );
  }, [visible, reduced, t]);

  const scrim = useAnimatedStyle(() => ({ opacity: Math.min(1, t.get()) }));
  const card = useAnimatedStyle(() => {
    const p = t.get();
    return {
      opacity: Math.min(1, p * 1.6),
      transform: [{ translateY: (1 - p) * 24 }, { scale: 0.94 + p * 0.06 }],
    };
  });

  const stacked = actions.length > 2;

  return (
    <Modal
      testID={testID ? `${testID}-modal` : undefined}
      visible={mounted}
      onShow={() => {
        const node=findNodeHandle(titleRef.current);
        if(node)AccessibilityInfo.setAccessibilityFocus(node);
        onShow?.();
      }}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      {/* The modal is its own window, so focus stays inside; escape closes it. */}
      <GestureHandlerRootView style={styles.root} onAccessibilityEscape={onClose}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }, scrim]}>
          <Pressable
            testID={backdropTestID}
            style={StyleSheet.absoluteFill}
            onPress={dismissable ? onClose : undefined}
            accessible={false}
            accessibilityRole="button"
            accessibilityLabel={closeLabel}
            importantForAccessibility="no-hide-descendants"
          />
        </Animated.View>
        <Animated.View
          testID={testID}
          style={[
            styles.card,
            {
              width: Math.min(MAX_W, window.width - space[6] * 2),
              backgroundColor: colors.surfaceRaised,
              borderColor: colors.border,
              borderRadius: radius.xl,
              boxShadow: shadow.lg,
              padding: space[6],
              gap: space[2],
            },
            style,
            card,
          ]}
        >
          {!!title && <Text
            ref={titleRef}
            accessibilityRole="header"
            style={{ color: colors.text, fontSize: font.size.lg, fontWeight: font.weight.semibold }}
          >
            {title}
          </Text>}
          {message ? (
            <Text style={{ color: colors.textMuted, fontSize: font.size.sm, lineHeight: 20 }}>
              {message}
            </Text>
          ) : null}
          {children}
          {actions.length > 0 && <View style={[stacked ? styles.stack : styles.pair, { marginTop: space[4] }]}>
            {actions.map((a) => (
              <ActionButton key={a.label} action={a} fill={!stacked} />
            ))}
          </View>}
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

function ActionButton({ action, fill }: { action: PopDialogAction; fill: boolean }) {
  const tone = action.tone ?? 'default';
  const {colors,font}=useKinetikTheme();
  return (
    <PressJelly
      onPress={action.onPress}
      accessibilityLabel={action.label}
      variant={tone === 'primary' ? 'ember' : 'surface'}
      size="md"
      block={fill}
      style={[fill ? { flex: 1 } : undefined,tone==='danger'?{backgroundColor:colors.danger}:undefined]}
    >
      {tone==='danger'?<Text style={{color:colors.background,fontSize:font.size.sm,fontWeight:font.weight.semibold}}>{action.label}</Text>:action.label}
    </PressJelly>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { borderWidth: 1 },
  pair: { flexDirection: 'row', gap: 10 },
  stack: { gap: 8 },
});
