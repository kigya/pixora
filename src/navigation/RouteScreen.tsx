import React from 'react';
import {useNavigation, useRoute} from 'expo-router';
/** Preserve existing screen contracts while Expo Router owns the native stack. */
export function routeScreen<P extends object>(Screen: React.ComponentType<P>) {
  return function RoutedScreen() {
    const navigation = useNavigation();
    const route = useRoute();
    return <Screen {...({navigation,route} as P)}/>;
  };
}
