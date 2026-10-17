import React from 'react';
import {AccessibilityInfo, AppState, TurboModuleRegistry} from 'react-native';
import {render, screen, act} from '@testing-library/react-native';
import App from '../App';
import {strings} from '../src/ui/i18n';
import {AppProvider} from '../src/application/AppProvider';
import {Home} from '../src/screens/Home';
import {ThemeContext,darkColors,lightColors} from '../src/ui/theme';
import {AppNavigation} from '../src/navigation/AppNavigation';
import Native,{seed} from '../tests/nativeMock';
jest.mock('@react-navigation/native',()=>{
 const ReactRuntime=require('react');
 const {View}=require('react-native');
 return {
  NavigationContainer:({children,onReady}:any)=>{
   const called=ReactRuntime.useRef(false);
   ReactRuntime.useEffect(()=>{if(!called.current){called.current=true;onReady?.()}},[onReady]);
   return ReactRuntime.createElement(View,null,children);
  },
  DarkTheme:{colors:{}},DefaultTheme:{colors:{}}
 };
});
jest.mock('@react-navigation/native-stack',()=>{
 const ReactRuntime=require('react');
 return {createNativeStackNavigator:()=>({
  Navigator:({children,initialRouteName}:any)=>ReactRuntime.Children.toArray(children).find((child:any)=>child.props.name===initialRouteName)??null,
  Screen:({component:Component}:any)=><Component navigation={{navigate:()=>{}}}/>,
 })};
});
beforeEach(()=>{jest.clearAllMocks();seed();});
test('root mounts providers and finishes native startup after navigation is ready',async()=>{await render(<App/>);expect(await screen.findByRole('button',{name:'Choose image'})).toBeOnTheScreen();expect(Native.finishStartup).toHaveBeenCalledTimes(1)});
test('fresh install starts on Home with the system language',async()=>{
 seed({}, {language:'system',systemLanguage:'ru-RU',languageChosen:false});
 await render(<App/>);
 expect(await screen.findByRole('button',{name:strings.ru.choose})).toBeOnTheScreen();
 expect(Native.updateSettings).not.toHaveBeenCalled();
});
test.each([false,true])('navigation honors theme and reduced motion %s',async dark=>{
 jest.spyOn(AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(dark);
 await render(<AppProvider><ThemeContext.Provider value={{dark,colors:dark?darkColors:lightColors}}><AppNavigation/></ThemeContext.Provider></AppProvider>);
 expect(await screen.findByRole('button',{name:'Choose image'})).toBeOnTheScreen();
 expect(Native.finishStartup).toHaveBeenCalledTimes(1);
});
test('native module resolves the registered contract',()=>{
 const getter=jest.spyOn(TurboModuleRegistry,'getEnforcing').mockReturnValue(Native as any);
 expect(jest.requireActual('../src/specs/NativeUpscale').default).toBe(Native);expect(getter).toHaveBeenCalledWith('NativeUpscale');getter.mockRestore();
});
test('return from background refreshes the session and notification state',async()=>{
 const callbacks:Array<(state:string)=>void>=[];
 const sub=jest.spyOn(AppState,'addEventListener').mockImplementation((_name,callback)=>{callbacks.push(callback as (s:string)=>void);return {remove:jest.fn()}});
 await render(<AppProvider><Home {...({navigation:{navigate:()=>{}},route:{}} as any)}/></AppProvider>);
 await screen.findByRole('button',{name:'Choose image'});
 await act(async()=>{callbacks.forEach(callback=>callback('background'));callbacks.forEach(callback=>callback('active'))});
 expect(Native.getCurrentSession).toHaveBeenCalledTimes(2);expect(Native.getNotificationStatus).toHaveBeenCalledTimes(2);sub.mockRestore();
});
test('initial failure is visible and later background refresh failure is contained',async()=>{
 Native.getCapabilities.mockRejectedValueOnce(new Error('missing model'));
 const callbacks:Array<(state:string)=>void>=[];
 const sub=jest.spyOn(AppState,'addEventListener').mockImplementation((_name,callback)=>{callbacks.push(callback as (s:string)=>void);return {remove:jest.fn()}});
 await render(<App/>);expect((await screen.findAllByText(strings.en.modelInvalid)).length).toBeGreaterThan(0);expect(Native.finishStartup).toHaveBeenCalledTimes(1);
 Native.getCurrentSession.mockRejectedValueOnce(new Error('unavailable'));Native.getNotificationStatus.mockRejectedValueOnce(new Error('unavailable'));
 await act(async()=>{callbacks.forEach(callback=>callback('active'))});sub.mockRestore();
});
