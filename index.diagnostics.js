// Local Firebase QA entrypoint, selected only with -PfirebaseDiagnostics.
import './index';
import React, {useEffect} from 'react';
import {AppRegistry, Text} from 'react-native';
import {getCrashlytics} from '@react-native-firebase/crashlytics';
function FirebaseJavaScriptDiagnostics() {
  useEffect(() => {
    getCrashlytics();
    const timeout = setTimeout(() => {
      throw new Error('Pixora QA controlled JavaScript fatal');
    }, 5000);
    return () => clearTimeout(timeout);
  }, []);
  return <Text>Pixora Firebase QA: controlled JavaScript error in 5 seconds</Text>;
}
AppRegistry.registerComponent('PixoraDiagnostics', () => FirebaseJavaScriptDiagnostics);
