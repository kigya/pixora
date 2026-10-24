import React from 'react';
import { Image, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../application/AppProvider';
import { Button, Icon, createStyles } from '../ui/components';
import { ProcessingPicker } from '../ui/processingPicker';
import { RecreateModelControl } from '../ui/recreateModelControl';
import { CompareSlider } from '../components/kinetik/compare-slider';
import { ExpandCard } from '../components/kinetik/expand-card';
import { PressJelly } from '../components/kinetik/press-jelly';
import { useLocale } from '../ui/locale';
import { useTheme } from '../ui/theme';
import { publicProfile } from '../domain/profiles';
export function Models() {
  const router = useRouter(); const params = useLocalSearchParams<{processingKind?:string;selectedProfile?:string}>();
  const {t} = useApp(); const {colors} = useTheme(); const {rtl} = useLocale();
  const s = createStyles(colors,rtl); const [expanded,setExpanded] = React.useState(false);
  const back = () => router.canGoBack() ? router.back() : router.replace('/Home');
  const recreate = params.processingKind === 'recreate';
  return <SafeAreaView style={s.screen} edges={['top','bottom','left','right']}>
    <View style={[s.header,{paddingHorizontal:20}]}>
      <PressJelly variant="surface" accessibilityLabel={t.back} onPress={back} style={s.iconButton}><Icon name="back" /></PressJelly>
      <Text accessibilityRole="header" style={[s.heading,{flex:1,textAlign:'center'}]}>{t.profileTitle}</Text><View style={{width:48}} />
    </View>
    <ScrollView contentContainerStyle={s.content}>
      {recreate ? <>
        <ExpandCard title="SD 1.5 · LCM" expanded={expanded} onExpandedChange={setExpanded} selectionSlot={<Button title={t.selectModel} onPress={back} />}>
          <CompareSlider accessibilityLabel={t.comparisonHelp} beforeLabel={t.before} afterLabel={t.after} aspectRatio={512/340}
            before={<Image source={require('../../assets/recreate/before.png')} style={{width:'100%',height:'100%'}} resizeMode="cover" />}
            after={<Image source={require('../../assets/recreate/after.png')} style={{width:'100%',height:'100%'}} resizeMode="cover" />} />
        </ExpandCard>
        <RecreateModelControl />
      </> : <ProcessingPicker value={publicProfile(params.selectedProfile || 'standard')} onChange={id => router.dismissTo({pathname:'/Home',params:{selectedProfile:id,selectionToken:String(Date.now())}})} />}
    </ScrollView>
  </SafeAreaView>;
}
