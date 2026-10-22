import 'react-native-gesture-handler';
import React, {useEffect, useState} from 'react';
import {AppState, StatusBar, StyleSheet, Text, View} from 'react-native';
import {Stack, ThemeProvider, DarkTheme, DefaultTheme} from 'expo-router';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import Animated, {useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming, cancelAnimation} from 'react-native-reanimated';
import Svg, {Path, Rect} from 'react-native-svg';
import {AppProvider, useApp} from '../application/AppProvider';
import Native from '../specs/NativeUpscale';
import {useTheme} from '../ui/theme';
import {AuroraVeil} from '../components/kinetik/aurora-veil';
import {PressJelly} from '../components/kinetik/press-jelly';
import {useReduceMotion} from '../lib/kinetik/hooks/use-reduce-motion';

function StartupSplash({active}: {active: boolean}) {
  const {colors} = useTheme();
  const reduced = useReduceMotion();
  const scale = useSharedValue(1);
  useEffect(() => {
    if (active && !reduced) scale.set(withRepeat(withSequence(withTiming(1.055,{duration:700}),withTiming(1,{duration:700})), -1, false));
    else {cancelAnimation(scale);scale.set(1);}
    return () => cancelAnimation(scale);
  }, [active,reduced,scale]);
  const animated = useAnimatedStyle(() => ({transform:[{scale:scale.get()}]}));
  return <AuroraVeil active={active} intensity={1} speed={3} colors={[colors.accent,colors.cyan,colors.accent]} style={StyleSheet.absoluteFill}>
    <View testID="startup-brand" style={styles.brand} onLayout={() => Native.finishStartup()}>
      <Animated.View style={animated} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Svg width={108} height={108} viewBox="0 0 108 108"><Rect width={108} height={108} rx={24} fill={colors.accent}/><Path d="M40 30H30V40 M30 30L43 43 M68 78H78V68 M78 78L65 65 M48 35H69Q73 35 73 39V57 M35 48V69Q35 73 39 73H57 M42 63L50 52L57 58L64 46" fill="none" stroke="white" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round"/></Svg>
      </Animated.View>
      <Text style={[styles.title,{color:colors.text}]}>Pixora</Text>
    </View>
  </AuroraVeil>;
}

function Navigator() {
  const {loading,startupError,refresh,t} = useApp();
  const {colors,dark} = useTheme();
  const reduced = useReduceMotion();
  const [minimumElapsed,setMinimumElapsed] = useState(false);
  const [foreground,setForeground] = useState(AppState.currentState === 'active');
  const [retrying,setRetrying] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setMinimumElapsed(true),1500);
    const listener = AppState.addEventListener('change',state => setForeground(state === 'active'));
    return () => {clearTimeout(timer);listener.remove();};
  },[]);
  const startup = loading || !minimumElapsed || startupError;
  return <View style={[styles.root,{backgroundColor:colors.bg}]}>
    <StatusBar barStyle={dark ? 'light-content' : 'dark-content'}/>
    <ThemeProvider value={{...(dark ? DarkTheme : DefaultTheme),colors:{...(dark ? DarkTheme : DefaultTheme).colors,background:colors.bg,card:colors.surface,text:colors.text,primary:colors.accent,border:colors.border}}}>
      {!startup && <Stack screenOptions={{headerShown:false,animation:reduced ? 'none' : 'fade',contentStyle:{backgroundColor:colors.bg}}}>
        <Stack.Screen name="index"/>
        <Stack.Screen name="Home"/>
        <Stack.Screen name="Settings"/>
        <Stack.Screen name="Onboarding"/>
        <Stack.Screen name="Feedback"/>
        <Stack.Screen name="Language"/>
      </Stack>}
    </ThemeProvider>
    {startup && <StartupSplash active={foreground}/>}
    {startupError && <View style={styles.retry}><Text accessibilityRole="alert" style={{color:colors.text}}>{t.error}</Text><PressJelly loading={retrying} onPress={() => {setRetrying(true);refresh().catch(() => {}).finally(() => setRetrying(false));}}>{t.retry}</PressJelly></View>}
  </View>;
}

export default function ExpoRoot() {
  return <GestureHandlerRootView style={styles.root}><SafeAreaProvider><AppProvider><Navigator/></AppProvider></SafeAreaProvider></GestureHandlerRootView>;
}
const styles = StyleSheet.create({root:{flex:1},brand:{flex:1,alignItems:'center',justifyContent:'center',gap:18},title:{fontSize:28,fontWeight:'600'},retry:{position:'absolute',bottom:56,left:24,right:24}});
