import React, { useEffect, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocale } from './locale';
import { paneBounds, twoColumns } from '../domain/layout';
import Native, { type LayoutInfo } from '../specs/NativeUpscale';
export function usePane() {
  const window = useWindowDimensions(),
    insets = useSafeAreaInsets();
  const [hinge, setHinge] = useState<LayoutInfo>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    separating: false,
  });
  useEffect(() => {
    const sub = Native.onWindowLayoutChanged(setHinge);
    Native.getWindowLayout()
      .then(setHinge)
      .catch(() => {});
    return () => sub.remove();
  }, []);
  return paneBounds(
    window.width - insets.left - insets.right,
    window.height - insets.top - insets.bottom,
    {
      ...hinge,
      x: Math.max(0, hinge.x - insets.left),
      y: Math.max(0, hinge.y - insets.top),
    },
  );
}
export function Workbench({
  preview,
  children,
}: {
  preview: React.ReactNode;
  children: React.ReactNode;
}) {
  const window = useWindowDimensions();
  const pane = usePane();
  const wide = twoColumns(pane.width, window.fontScale);
  const { rtl } = useLocale();
  return (
    <View
      style={{
        flexDirection: wide ? (rtl ? 'row-reverse' : 'row') : 'column',
        gap: 20,
      }}
    >
      <View style={{ flex: wide ? 1 : undefined, gap: 20 }}>{preview}</View>
      <View style={{ flex: wide ? 1 : undefined, gap: 20 }}>{children}</View>
    </View>
  );
}
