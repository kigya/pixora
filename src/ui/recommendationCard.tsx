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
        gap: 12,
        padding: 16,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
      }}
      accessibilityLabel={copy.recommendationTitle}
    >
      <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>
        {copy.recommendationTitle}
      </Text>
      <Text style={{ color: colors.muted, lineHeight: 21 }}>
        {copy.recommendationReason[value.reasonId]} ·{' '}
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
