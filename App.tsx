import 'react-native-gesture-handler';
import React from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AppProvider } from './src/application/AppProvider';
import { AppNavigation } from './src/navigation/AppNavigation';

const styles = StyleSheet.create({ root: { flex: 1 } });
export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <AppProvider>
          <AppNavigation />
        </AppProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
