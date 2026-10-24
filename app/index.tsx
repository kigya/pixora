import React from 'react';
import {Redirect} from 'expo-router';
import {useApp} from '../src/application/AppProvider';
export default function Index() {
  const {settings} = useApp();
  return <Redirect href={settings.onboardingVersion === 0 ? '/Onboarding' : '/Home'}/>;
}
