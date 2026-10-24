import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKinetikTheme } from '../../../lib/kinetik/tokens/theme';

export type ProfileProps = {
  children: ReactNode;
  header?: ReactNode;
  overlay?: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
};
/** Pixora's adaptation of Kinetik Profile: settings only, without account UI. */
export function Profile({children,header,overlay,contentStyle}:ProfileProps) {
  const {colors,space}=useKinetikTheme();
  const insets=useSafeAreaInsets();
  return <>
    <ScrollView
      style={[styles.fill,{backgroundColor:colors.background}]}
      keyboardShouldPersistTaps="always"
      contentContainerStyle={[{
        paddingTop:insets.top+space[8],paddingBottom:insets.bottom+space[8],
        paddingHorizontal:space[5],gap:space[6],
      },contentStyle]}
      showsVerticalScrollIndicator={false}
    >
      {header}{children}
    </ScrollView>
    {overlay}
  </>;
}
const styles=StyleSheet.create({fill:{flex:1}});
