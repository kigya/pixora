import React, { useState } from 'react';
import { Image, View, Text, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from './theme';
import { useLocale } from './locale';
import { Segments, createStyles } from './components';
import { strings } from './i18n';
import { track } from '../application/telemetry';
import { scheduleOnRN } from 'react-native-worklets';
import type { ProfileId } from '../specs/NativeUpscale';

const examples = {
  standard: [
    require('../../assets/presets/standard-before.jpg'),
    require('../../assets/presets/standard-after.jpg'),
  ],
  lite: [
    require('../../assets/presets/lite-before.jpg'),
    require('../../assets/presets/lite-after.jpg'),
  ],
  natural: [
    require('../../assets/presets/natural-before.jpg'),
    require('../../assets/presets/natural-after.jpg'),
  ],
  details: [
    require('../../assets/presets/details-before.jpg'),
    require('../../assets/presets/details-after.jpg'),
  ],
  balanced: [
    require('../../assets/presets/balanced-before.jpg'),
    require('../../assets/presets/balanced-after.jpg'),
  ],
  sharp: [
    require('../../assets/presets/sharp-before.jpg'),
    require('../../assets/presets/sharp-after.jpg'),
  ],
  art: [
    require('../../assets/presets/art-before.jpg'),
    require('../../assets/presets/art-after.jpg'),
  ],
  pixel: [
    require('../../assets/presets/pixel-before.png'),
    require('../../assets/presets/pixel-after.png'),
  ],
} as const;
// Keep these dimensions in sync with assets/presets/manifest.json.
const exampleDimensions: Record<ProfileId, readonly [number, number]> = {
  standard: [1280, 960],
  lite: [1280, 960],
  natural: [1280, 960],
  details: [1280, 857],
  balanced: [1280, 575],
  sharp: [1280, 960],
  art: [1280, 1114],
  pixel: [981, 1280],
};
/** User-provided examples, not claims about results from the bundled models. */
export function ProfilePreview({ id }: { id: ProfileId }) {
  const { colors } = useTheme();
  const { locale, rtl } = useLocale();
  const t = strings[locale];
  const s = createStyles(colors, rtl);
  const [width, setWidth] = useState(280);
  const [choice, setChoice] = useState('compare');
  const fraction = useSharedValue(0.5);
  const [before, after] = examples[id];
  const imageWidth = width;
  const [sourceWidth, sourceHeight] = exampleDimensions[id];
  const height = Math.round(imageWidth * sourceHeight / sourceWidth);
  const interacted = () =>
    track('profile_preview_interacted', { profile_id: id, action: 'divider' });
  const gesture = Gesture.Pan()
    .activeOffsetX([-8, 8])
    .failOffsetY([-12, 12])
    .onUpdate(e => {
      fraction.value = Math.max(0, Math.min(1, e.x / imageWidth));
    })
    .onEnd(() => {
      scheduleOnRN(interacted);
    });
  const clip = useAnimatedStyle(() => ({
    transform: [{ translateX: -(1 - fraction.value) * imageWidth }],
  }));
  const image = useAnimatedStyle(() => ({
    transform: [{ translateX: (1 - fraction.value) * imageWidth }],
  }));
  const divider = useAnimatedStyle(() => ({
    transform: [{ translateX: fraction.value * imageWidth }],
  }));
  return (
    <View
      style={styles.group}
      onLayout={e => setWidth(e.nativeEvent.layout.width)}
    >
      <GestureDetector gesture={gesture}>
        <View
          style={[
            styles.preview,
            { width: imageWidth, height },
          ]}
          accessible
          accessibilityLabel={`${t.before} / ${t.after}. ${t.comparisonHelp}`}
        >
          <Image
            testID="profile-after-image"
            source={after}
            resizeMode="contain"
            style={{ position: 'absolute', left: 0, top: 0, width: imageWidth, height }}
            accessible={false}
          />
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, styles.clip, clip]}
          >
            <Animated.View style={[StyleSheet.absoluteFill, image]}>
              <Image
                testID="profile-before-image"
                source={before}
                resizeMode="contain"
                style={{ position: 'absolute', left: 0, top: 0, width: imageWidth, height }}
                accessible={false}
              />
            </Animated.View>
          </Animated.View>
          <Animated.View
            pointerEvents="none"
            style={[styles.divider, { height }, divider]}
          >
            <View style={[styles.handle, { backgroundColor: colors.accent }]}>
              <Text style={styles.arrows}>↔</Text>
            </View>
          </Animated.View>
          <Text style={[styles.tag, styles.before]}>{t.before}</Text>
          <Text style={[styles.tag, styles.after]}>{t.after}</Text>
        </View>
      </GestureDetector>
      <Segments
        preserveOrder
        values={[
          { id: 'before', label: t.before },
          { id: 'compare', label: t.compare },
          { id: 'after', label: t.after },
        ]}
        value={choice}
        onChange={value => {
          track('profile_preview_interacted', {
            profile_id: id,
            action: value,
          });
          setChoice(value);
          fraction.value = withTiming(
            value === 'before' ? 1 : value === 'after' ? 0 : 0.5,
            { duration: 180 },
          );
        }}
      />
      <Text style={s.caption}>{t.processingExample}</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  group: { gap: 12 },
  preview: {
    alignSelf: 'center',
    overflow: 'hidden',
    borderRadius: 16,
    direction: 'ltr',
  },
  clip: { overflow: 'hidden' },
  divider: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 2,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  handle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrows: {
    color: '#FFFFFF',
    fontSize: 18,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  tag: {
    position: 'absolute',
    bottom: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    color: '#FFFFFF',
    backgroundColor: '#000000AA',
    fontSize: 12,
  },
  before: { left: 8 },
  after: { right: 8 },
});
