import 'react-native-gesture-handler';
import React, {useCallback, useEffect, useRef, useState} from 'react';
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

function StartupSplash({active, onShown}: {active: boolean; onShown: () => void}) {
  const {colors} = useTheme();
  const reduced = useReduceMotion();
  const scale = useSharedValue(1);
  const reveal = useSharedValue(0);
  const shown = useRef(false);
  const laidOut = useRef(false);
  const firstFrame = useRef<number | null>(null);
  const secondFrame = useRef<number | null>(null);
  const releaseAtVisibleFrame = useCallback(() => {
    if (!active || !laidOut.current || shown.current || firstFrame.current !== null || secondFrame.current !== null) return;
    firstFrame.current = requestAnimationFrame(() => {
      firstFrame.current = null;
      secondFrame.current = requestAnimationFrame(() => {
        secondFrame.current = null;
        if (!active || shown.current) return;
        shown.current = true;
        onShown();
      });
    });
  }, [active, onShown]);
  useEffect(() => {
    if (active) {
      reveal.set(reduced ? 1 : withTiming(1, {duration:260}));
      releaseAtVisibleFrame();
    }
    else cancelAnimation(reveal);
    return () => {
      cancelAnimation(reveal);
      if (firstFrame.current !== null) cancelAnimationFrame(firstFrame.current);
      if (secondFrame.current !== null) cancelAnimationFrame(secondFrame.current);
      firstFrame.current = null;
      secondFrame.current = null;
    };
  }, [active,reduced,reveal,releaseAtVisibleFrame]);
  useEffect(() => {
    if (active && !reduced) scale.set(withRepeat(withSequence(withTiming(1.055,{duration:700}),withTiming(1,{duration:700})), -1, false));
    else {cancelAnimation(scale);scale.set(1);}
    return () => cancelAnimation(scale);
  }, [active,reduced,scale]);
  const gradient = useAnimatedStyle(() => ({opacity:reveal.get()}));
  const animated = useAnimatedStyle(() => ({opacity:reveal.get(),transform:[{scale:scale.get()}]}));
  useEffect(() => () => {
    if (firstFrame.current !== null) cancelAnimationFrame(firstFrame.current);
    if (secondFrame.current !== null) cancelAnimationFrame(secondFrame.current);
  }, []);
  return <View style={[StyleSheet.absoluteFill,{backgroundColor:colors.bg}]}>
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill,gradient]}>
      <AuroraVeil active={active} intensity={1} speed={3} baseColor={colors.bg} colors={[colors.accent,colors.cyan,colors.accent]} style={StyleSheet.absoluteFill}/>
    </Animated.View>
    <View testID="startup-brand" style={styles.brand} onLayout={() => {laidOut.current=true;releaseAtVisibleFrame();}}>
      <Animated.View style={animated} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Svg width={108} height={108} viewBox="0 0 108 108"><Rect width={108} height={108} rx={24} fill={colors.accent}/><Path d="M40 30H30V40 M30 30L43 43 M68 78H78V68 M78 78L65 65 M48 35H69Q73 35 73 39V57 M35 48V69Q35 73 39 73H57 M42 63L50 52L57 58L64 46" fill="none" stroke="white" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round"/></Svg>
      </Animated.View>
    </View>
  </View>;
}

function Navigator() {
  const {loading,startupError,refresh,t,settings} = useApp();
  const {colors,dark} = useTheme();
  const reduced = useReduceMotion();
  const [minimumElapsed,setMinimumElapsed] = useState(false);
  const [foreground,setForeground] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  const [retrying,setRetrying] = useState(false);
  const splashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSplashShown = useCallback(() => {
    if (splashTimer.current !== null) return;
    // The first Aurora layout releases Android's plain launch window. Its own
    // minimum starts here, not while React is still preparing the first frame.
    Native.finishStartup();
    splashTimer.current = setTimeout(() => setMinimumElapsed(true),1500);
  }, []);
  useEffect(() => {
    const listener = AppState.addEventListener('change',state => setForeground(state === 'active'));
    return () => {if(splashTimer.current !== null)clearTimeout(splashTimer.current);listener.remove();};
  },[]);
  const startup = loading || !minimumElapsed || startupError;
  return <View style={[styles.root,{backgroundColor:colors.bg}]}>
    <StatusBar barStyle={dark ? 'light-content' : 'dark-content'}/>
    <ThemeProvider value={{...(dark ? DarkTheme : DefaultTheme),colors:{...(dark ? DarkTheme : DefaultTheme).colors,background:colors.bg,card:colors.surface,text:colors.text,primary:colors.accent,border:colors.border}}}>
      {!loading && !startupError && (settings.onboardingVersion>0 || !startup) && <View style={styles.root} pointerEvents={startup?'none':'auto'} accessibilityElementsHidden={!!startup} importantForAccessibility={startup?'no-hide-descendants':'auto'}><Stack screenOptions={{headerShown:false,animation:reduced ? 'none' : 'fade',contentStyle:{backgroundColor:colors.bg}}}>
        <Stack.Screen name="index"/>
        <Stack.Screen name="Home"/>
        <Stack.Screen name="Settings"/>
        <Stack.Screen name="Onboarding"/>
        <Stack.Screen name="Feedback"/>
        <Stack.Screen name="Language"/>
      </Stack></View>}
    </ThemeProvider>
    {startup && <StartupSplash active={foreground} onShown={onSplashShown}/>}
    {startupError && <View style={styles.retry}><Text accessibilityRole="alert" style={{color:colors.text}}>{t.error}</Text><PressJelly loading={retrying} onPress={() => {setRetrying(true);refresh().catch(() => {}).finally(() => setRetrying(false));}}>{t.retry}</PressJelly></View>}
  </View>;
}

export default function ExpoRoot() {
  return <GestureHandlerRootView style={styles.root}><SafeAreaProvider><AppProvider><Navigator/></AppProvider></SafeAreaProvider></GestureHandlerRootView>;
}
const styles = StyleSheet.create({root:{flex:1},brand:{flex:1,alignItems:'center',justifyContent:'center'},retry:{position:'absolute',bottom:56,left:24,right:24}});
