import React from 'react';
import {AccessibilityInfo,AppState,BackHandler,TurboModuleRegistry} from 'react-native';
import {renderRouter,screen,act,fireEvent} from 'expo-router/testing-library';
import {render,screen as componentScreen} from '@testing-library/react-native';
import Root from '../src/navigation/ExpoRoot';
import Index from '../app/index';
import HomeRoute from '../app/Home';
import SettingsRoute from '../app/Settings';
import OnboardingRoute from '../app/Onboarding';
import FeedbackRoute from '../app/Feedback';
import LanguageRoute from '../app/Language';
import ModelsRoute from '../app/Models';
import {AppProvider} from '../src/application/AppProvider';
import {Home} from '../src/screens/Home';
import {strings} from '../src/ui/i18n';
import Native,{capabilities,seed} from '../tests/nativeMock';
import type {Settings} from '../src/specs/NativeUpscale';
const routes={_layout:Root,index:Index,Home:HomeRoute,Settings:SettingsRoute,Onboarding:OnboardingRoute,Feedback:FeedbackRoute,Language:LanguageRoute,Models:ModelsRoute};
async function renderReadyRouter(initialUrl?: string) {
  const route = await renderRouter(routes, initialUrl ? {initialUrl} : undefined);
  await act(async () => { for (let turn = 0; turn < 20; turn++) await Promise.resolve(); });
  return route;
}
async function launch(initialUrl = '/') {
  const result=await renderReadyRouter(initialUrl);
  await fireEvent(screen.getByTestId('startup-brand'),'layout',{nativeEvent:{layout:{width:400,height:800,x:0,y:0}}});
  await act(async()=>{jest.advanceTimersByTime(32);});
  await act(async()=>{jest.advanceTimersByTime(1500);});
  return result;
}
beforeEach(()=>{
  jest.clearAllMocks();jest.useFakeTimers();seed();
  jest.spyOn(AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(true);
  jest.spyOn(AppState,'addEventListener').mockReturnValue({remove:jest.fn()});
  jest.spyOn(AccessibilityInfo,'addEventListener').mockReturnValue({remove:jest.fn()});
  jest.spyOn(BackHandler,'addEventListener').mockReturnValue({remove:jest.fn()});
});
afterEach(()=>{jest.useRealTimers();jest.restoreAllMocks();});
test('native launch gives way to the first Aurora frame; Home waits at least 1500 ms',async()=>{
  let visibleFrameAt = 0;
  Native.finishStartup.mockImplementation(() => {
    visibleFrameAt = Date.now();
  });
  await renderReadyRouter();
  expect(screen.queryByRole('button',{name:strings.en.choose})).not.toBeOnTheScreen();
  await fireEvent(screen.getByTestId('startup-brand'),'layout',{nativeEvent:{layout:{width:400,height:800,x:0,y:0}}});
  expect(Native.finishStartup).not.toHaveBeenCalled();
  await act(async()=>{jest.advanceTimersByTime(32);});
  expect(Native.finishStartup).toHaveBeenCalledTimes(1);
  const elapsed = Date.now() - visibleFrameAt;
  await act(async()=>{jest.advanceTimersByTime(Math.max(0,1499-elapsed));});
  expect(screen.queryByRole('button',{name:strings.en.choose})).not.toBeOnTheScreen();
  await act(async()=>{jest.advanceTimersByTime(1);});
  expect(await screen.findByRole('button',{name:strings.en.choose})).toBeOnTheScreen();
});
test('native launch waits for persisted theme hydration before releasing its first visible frame',async()=>{
 jest.spyOn(require('react-native'),'useColorScheme').mockReturnValue('light');
 seed({},{theme:'dark'});
 const persisted=await Native.getSettings();
 Native.getSettings.mockClear();
 let resolveSettings!:(settings:Settings)=>void;
 Native.getSettings.mockImplementationOnce(()=>new Promise(resolve=>{resolveSettings=resolve;}));

 await renderRouter(routes);
 await fireEvent(screen.getByTestId('startup-brand'),'layout',{nativeEvent:{layout:{width:400,height:800,x:0,y:0}}});
 await act(async()=>{jest.advanceTimersByTime(32);});
 expect(Native.finishStartup).not.toHaveBeenCalled();

 await act(async()=>{resolveSettings(persisted);await Promise.resolve();});
 await act(async()=>{jest.advanceTimersByTime(32);});
 expect(Native.finishStartup).toHaveBeenCalledTimes(1);
 expect(screen.queryByRole('button',{name:strings.en.choose})).not.toBeOnTheScreen();
});
test('splash minimum counts only foreground-visible time',async()=>{
 const changes:Array<(state:string)=>void>=[];
 jest.spyOn(AppState,'addEventListener').mockImplementation((_name,callback)=>{changes.push(callback as (state:string)=>void);return {remove:jest.fn()};});
 await renderReadyRouter();
 await fireEvent(screen.getByTestId('startup-brand'),'layout',{nativeEvent:{layout:{width:400,height:800,x:0,y:0}}});
 await act(async()=>{jest.advanceTimersByTime(32);});
 expect(Native.finishStartup).toHaveBeenCalledTimes(1);
 await act(async()=>{jest.advanceTimersByTime(600);});
 await act(async()=>{changes.forEach(change=>change('background'));});
 await act(async()=>{jest.advanceTimersByTime(5000);});
 expect(screen.queryByRole('button',{name:strings.en.choose})).not.toBeOnTheScreen();
 await act(async()=>{changes.forEach(change=>change('active'));});
 await act(async()=>{jest.advanceTimersByTime(899);});
 expect(screen.queryByRole('button',{name:strings.en.choose})).not.toBeOnTheScreen();
 await act(async()=>{jest.advanceTimersByTime(1);});
 expect(await screen.findByRole('button',{name:strings.en.choose})).toBeOnTheScreen();
});
test('startup cancels the pending first frame on unmount',async()=>{
 const route=await renderReadyRouter();
 await fireEvent(screen.getByTestId('startup-brand'),'layout',{nativeEvent:{layout:{width:400,height:800,x:0,y:0}}});
 await route.unmount();
 expect(Native.finishStartup).not.toHaveBeenCalled();
});
test('startup cancels the second reveal frame when unmounted between frames',async()=>{
 const originalRequest=globalThis.requestAnimationFrame;
 const originalCancel=globalThis.cancelAnimationFrame;
 const pending=new Map<number,FrameRequestCallback>();
 let nextId=1;
 globalThis.requestAnimationFrame=(callback)=>{const id=nextId++;pending.set(id,callback);return id;};
 globalThis.cancelAnimationFrame=(id)=>{if(typeof id==='number')pending.delete(id);};
 try {
  const route=await renderReadyRouter();
  await fireEvent(screen.getByTestId('startup-brand'),'layout',{nativeEvent:{layout:{width:400,height:800,x:0,y:0}}});
  const first=[...pending.entries()][0];
  expect(first).toBeDefined();
  const firstId=first![0] as number;
  const firstCallback=first![1];
  await act(async()=>{pending.delete(firstId);firstCallback(16);});
  expect(pending.size).toBe(1);
  await route.unmount();
  expect(pending.size).toBe(0);
  expect(Native.finishStartup).not.toHaveBeenCalled();
 } finally {
  globalThis.requestAnimationFrame=originalRequest;
  globalThis.cancelAnimationFrame=originalCancel;
 }
});
test('startup uses the animated reveal when Reduce Motion is disabled',async()=>{
 jest.spyOn(AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(false);
 const route=await launch();
 expect(route.getPathname()).toBe('/Home');
 expect(await screen.findByRole('button',{name:strings.en.choose})).toBeOnTheScreen();
});
test('splash reveal resumes after returning from background during its fade',async()=>{
 const appStateChanges:Array<(state:string)=>void>=[];
 jest.spyOn(AppState,'addEventListener').mockImplementation((_name,callback)=>{appStateChanges.push(callback as (state:string)=>void);return {remove:jest.fn()};});
 jest.spyOn(AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(false);
 const reanimated=jest.requireMock('react-native-reanimated') as {withTiming:(value:number,config?:{duration?:number})=>number};
 const originalWithTiming=reanimated.withTiming;
 let revealCalls=0;
 const timingSpy=jest.spyOn(reanimated,'withTiming').mockImplementation((value,config)=>{
  if(config?.duration===360 && revealCalls++===0)return 0.4;
  return value;
 });
 const route=await renderReadyRouter();
 await fireEvent(screen.getByTestId('startup-brand'),'layout',{nativeEvent:{layout:{width:400,height:800,x:0,y:0}}});
 await act(async()=>{jest.advanceTimersByTime(32);});
 expect(screen.getByTestId('startup-aurora-layer')).toHaveStyle({opacity:0.4});
 await act(async()=>{appStateChanges.forEach(change=>change('background'));});
 expect(screen.getByTestId('startup-aurora-layer')).toHaveStyle({opacity:0.4});
 await act(async()=>{appStateChanges.forEach(change=>change('active'));});
 expect(screen.getByTestId('startup-aurora-layer')).toHaveStyle({opacity:1});
 expect(timingSpy).toHaveBeenCalledWith(1,{duration:360});
 await route.unmount();
 timingSpy.mockRestore();
 reanimated.withTiming=originalWithTiming;
});
test('enabling Reduce Motion during the splash reveal makes it fully visible immediately',async()=>{
 const reportMotionChanges:Array<(enabled:boolean)=>void>=[];
 const appStateChanges:Array<(state:string)=>void>=[];
 jest.spyOn(AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(false);
 jest.spyOn(AccessibilityInfo,'addEventListener').mockImplementation((event,listener)=>{
  if(event==='reduceMotionChanged')reportMotionChanges.push(listener as (enabled:boolean)=>void);
  return {remove:jest.fn()};
 });
 jest.spyOn(AppState,'addEventListener').mockImplementation((_name,listener)=>{appStateChanges.push(listener as (state:string)=>void);return {remove:jest.fn()};});
 const reanimated=jest.requireMock('react-native-reanimated') as {withTiming:(value:number,config?:{duration?:number})=>number};
 const originalWithTiming=reanimated.withTiming;
 const timingSpy=jest.spyOn(reanimated,'withTiming').mockImplementation((value,config)=>config?.duration===360?0.4:value);
 const route=await renderReadyRouter();
 await fireEvent(screen.getByTestId('startup-brand'),'layout',{nativeEvent:{layout:{width:400,height:800,x:0,y:0}}});
 await act(async()=>{jest.advanceTimersByTime(32);});
 expect(screen.getByTestId('startup-aurora-layer')).toHaveStyle({opacity:0.4});
 expect(reportMotionChanges.length).toBeGreaterThan(0);
 await act(async()=>{reportMotionChanges.forEach(report=>report(true));});
 await act(async()=>{appStateChanges.forEach(change=>change('background'));});
 await act(async()=>{appStateChanges.forEach(change=>change('active'));});
 expect(timingSpy.mock.calls.filter(([,config])=>config?.duration===360)).toHaveLength(1);
 expect(screen.getByTestId('startup-aurora-layer')).toHaveStyle({opacity:1});
 await route.unmount();
 timingSpy.mockRestore();
 reanimated.withTiming=originalWithTiming;
});
test('a layout frame observed in the background cannot release startup',async()=>{
 const changes:Array<(state:string)=>void>=[];
 jest.spyOn(AppState,'addEventListener').mockImplementation((_name,callback)=>{changes.push(callback as (state:string)=>void);return {remove:jest.fn()};});
 const route=await renderReadyRouter();
 await act(async()=>{changes.forEach(change=>change('background'));});
 await fireEvent(screen.getByTestId('startup-brand'),'layout',{nativeEvent:{layout:{width:400,height:800,x:0,y:0}}});
 expect(Native.finishStartup).not.toHaveBeenCalled();
 await act(async()=>{changes.forEach(change=>change('active'));});
 await act(async()=>{jest.advanceTimersByTime(32);});
 expect(Native.finishStartup).toHaveBeenCalledTimes(1);
 await route.unmount();
});
test('existing installation retains Home and the system language',async()=>{
  seed({},{language:'system',systemLanguage:'ru-RU',languageChosen:false});
  const route=await launch();
  expect(await screen.findByRole('button',{name:strings.ru.choose})).toBeOnTheScreen();
  expect(route.getPathname()).toBe('/Home');
  expect(Native.updateSettings).not.toHaveBeenCalled();
});
test.each(['dark','light','system'])('root retains theme preference %s through routing',async theme=>{
  seed({},{theme});const route=await launch();
  expect(await screen.findByRole('button',{name:strings.en.choose})).toBeOnTheScreen();
  expect(route.getPathname()).toBe('/Home');expect(Native.updateSettings).not.toHaveBeenCalled();
});
test('native module resolves the registered contract',()=>{
 const getter=jest.spyOn(TurboModuleRegistry,'getEnforcing').mockReturnValue(Native as any);
 expect(jest.requireActual('../src/specs/NativeUpscale').default).toBe(Native);
 expect(getter).toHaveBeenCalledWith('NativeUpscale');getter.mockRestore();
});
test('return from background refreshes session and notification state',async()=>{
 const callbacks:Array<(state:string)=>void>=[];
 jest.spyOn(AppState,'addEventListener').mockImplementation((_name,callback)=>{callbacks.push(callback as (s:string)=>void);return {remove:jest.fn()};});
 await render(<AppProvider><Home {...({navigation:{navigate:()=>{}},route:{}} as any)}/></AppProvider>);
 await componentScreen.findByRole('button',{name:strings.en.choose});
 await act(async()=>{callbacks.forEach(callback=>callback('background'));callbacks.forEach(callback=>callback('active'));});
 expect(Native.getCurrentSession).toHaveBeenCalledTimes(2);expect(Native.getNotificationStatus).toHaveBeenCalledTimes(2);
});
test('model route expands comparison without selection, then returns Home only on select', async()=>{
  seed({state:'READY',image:{id:'nav-image',mime:'image/png',size:100,width:64,height:48,workWidth:64,workHeight:48,hasAlpha:false,previewUri:'file:///before.png',needsPreparation:false}});
  const route=await launch();
  capabilities.modes=['quality','lite','natural','details','balanced','sharp','art','pixel'];
  await componentScreen.findByRole('button',{name:strings.en.upscale});
  await componentScreen.findByRole('button',{name:new RegExp(`${strings.en.recreate.model}:`)});
  await fireEvent.press(componentScreen.getByTestId('choose-model'));
  expect(route.getPathname()).toBe('/Models');
  await componentScreen.findByRole('button',{name:strings.en.presets.art.title});
  await fireEvent.press(componentScreen.getByRole('button',{name:strings.en.presets.art.title}));
  expect(componentScreen.getByText(strings.en.presets.art.note)).toBeOnTheScreen();
  expect(componentScreen.getByRole('adjustable',{name:`${strings.en.presets.art.title}: ${strings.en.before} / ${strings.en.after}`})).toBeOnTheScreen();
  expect(route.getPathname()).toBe('/Models');
  expect(Native.startJobWithProfile).not.toHaveBeenCalled();
  await fireEvent.press(componentScreen.getByTestId('select-model-art'));
  expect(route.getPathname()).toBe('/Home');
  expect(await componentScreen.findByRole('button',{name:`${strings.en.recreate.model}: ${strings.en.presets.art.title}`})).toBeOnTheScreen();
  expect(Native.startJobWithProfile).not.toHaveBeenCalled();
 await fireEvent.press(componentScreen.getByTestId('choose-model'));
 await componentScreen.findByText(strings.en.presets.art.title);
 await fireEvent.press(componentScreen.getByRole('button',{name:strings.en.back}));
 expect(route.getPathname()).toBe('/Home');
});
test('model route without a prior choice defaults to Standard',async()=>{
 seed();
 await launch('/Models');
 expect(await componentScreen.findByRole('button',{name:strings.en.done})).toBeOnTheScreen();
 expect(componentScreen.getByRole('button',{name:'Standard'})).toBeOnTheScreen();
 expect(Native.startJobWithProfile).not.toHaveBeenCalled();
});
test('direct Recreate model route shows its comparison and falls back Home from Back',async()=>{
 seed();
 const route=await launch('/Models?processingKind=recreate');
 expect(route.getPathname()).toBe('/Models');
 expect(await componentScreen.findByText('SD 1.5 · LCM')).toBeOnTheScreen();
 await fireEvent.press(componentScreen.getByRole('button',{name:'SD 1.5 · LCM'}));
 expect(componentScreen.getByRole('adjustable',{name:strings.en.comparisonHelp})).toBeOnTheScreen();
 expect(Native.startRecreateJob).not.toHaveBeenCalled();
 await fireEvent.press(componentScreen.getByRole('button',{name:strings.en.back}));
 expect(route.getPathname()).toBe('/Home');
});
test('startup failure has a retry action and does not open a partially initialized Home',async()=>{
 Native.getCapabilities.mockRejectedValueOnce(new Error('unavailable'));
 await launch();expect(await screen.findByRole('alert')).toHaveTextContent(strings.en.error);
 expect(screen.queryByRole('button',{name:strings.en.choose})).not.toBeOnTheScreen();
 await fireEvent.press(screen.getByRole('button',{name:strings.en.retry}));
 expect(await screen.findByRole('button',{name:strings.en.choose})).toBeOnTheScreen();
});
test('fresh installation opens the three-page skippable introduction',async()=>{
 seed({},{language:'system',systemLanguage:'ru-RU',onboardingVersion:0});const route=await launch();
 expect(await screen.findByRole('button',{name:strings.ru.onboarding.skip})).toBeOnTheScreen();
 expect(screen.getByText(strings.ru.onboarding.detailsTitle)).toBeOnTheScreen();
 expect(route.getPathname()).toBe('/Onboarding');expect(Native.completeOnboarding).not.toHaveBeenCalled();
});
