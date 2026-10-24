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
import {AppProvider} from '../src/application/AppProvider';
import {Home} from '../src/screens/Home';
import {strings} from '../src/ui/i18n';
import Native,{seed} from '../tests/nativeMock';
const routes={_layout:Root,index:Index,Home:HomeRoute,Settings:SettingsRoute,Onboarding:OnboardingRoute,Feedback:FeedbackRoute,Language:LanguageRoute};
async function launch() {
  const result=await renderRouter(routes);
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
  await renderRouter(routes);
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
