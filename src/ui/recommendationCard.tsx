import React from 'react';
import { Text, View } from 'react-native';
import type { ImageRecommendation } from '../specs/NativeUpscale';
import { Button } from './components';
import type { Copy } from './i18n';
import { useTheme } from './theme';

export function RecommendationCard({
  value,
  copy,
  onApply,
}: {
  value: ImageRecommendation;
  copy: Copy;
  onApply: (value: ImageRecommendation) => void;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        gap: 8,
        paddingVertical: 8,
        borderColor: colors.border,
      }}
    >
      <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }} accessibilityRole="header">
        {copy.presets[value.profileId].title}
      </Text>
      <Button
        title={copy.recommendationApply}
        icon="check"
        onPress={() => onApply(value)}
        testID="apply-recommendation"
      />
    </View>
  );
}
