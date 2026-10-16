import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, StatusBar } from 'react-native';
import {
  NavigationContainer,
  DarkTheme,
  DefaultTheme,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../ui/theme';
import { FeedbackScreen } from '../screens/Feedback';
import { Home } from '../screens/Home';
import { SettingsScreen } from '../screens/Settings';
import type { Routes } from './routes';
const Stack = createNativeStackNavigator<Routes>();

export function AppNavigation() {
  const { colors, dark } = useTheme();
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const listener = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    return () => listener.remove();
  }, []);
  return (
    <>
      <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} />
      <NavigationContainer
        theme={{
          ...(dark ? DarkTheme : DefaultTheme),
          colors: {
            ...(dark ? DarkTheme : DefaultTheme).colors,
            background: colors.bg,
            card: colors.surface,
            primary: colors.accent,
            text: colors.text,
          },
        }}
      >
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
            animation: reduceMotion ? 'none' : 'fade',
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="Home" component={Home} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
          <Stack.Screen name="Feedback" component={FeedbackScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </>
  );
}
