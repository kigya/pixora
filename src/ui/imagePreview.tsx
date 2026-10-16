import React, { useState } from 'react';
import { View, Image } from 'react-native';
import { previewSize } from '../domain/presentation';
import { ProcessingOverlay } from './processingOverlay';
import { useTheme } from './theme';
export function ImagePreview({
  uri,
  width,
  height,
  maxHeight,
  label,
  processing = false,
  restricted = false,
}: {
  uri: string;
  width: number;
  height: number;
  maxHeight: number;
  label: string;
  processing?: boolean;
  restricted?: boolean;
}) {
  const [available, setAvailable] = useState(300);
  const { colors } = useTheme();
  const bounds = previewSize(width, height, available, maxHeight);
  return (
    <View
      onLayout={e => setAvailable(e.nativeEvent.layout.width)}
      style={{ alignItems: 'center' }}
    >
      <View
        style={{
          width: bounds.width,
          height: bounds.height,
          borderRadius: 24,
          overflow: 'hidden',
        }}
      >
        <Image
          accessibilityLabel={label}
          source={{ uri }}
          resizeMode="contain"
          style={{
            width: bounds.width,
            height: bounds.height,
            borderRadius: 24,
            backgroundColor: colors.surface,
          }}
        />
        <ProcessingOverlay
          height={bounds.height}
          active={processing}
          restricted={restricted}
        />
      </View>
    </View>
  );
}
