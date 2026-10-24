import React from 'react';
import {render, screen, userEvent, act, fireEvent, within, waitFor} from '@testing-library/react-native';
import {AccessibilityInfo, AppState, Platform, StyleSheet, Text} from 'react-native';
import {AppProvider, useApp} from '../src/application/AppProvider';
import {Home} from '../src/screens/Home';
import {SettingsScreen} from '../src/screens/Settings';
import {emptySession} from '../src/domain/session';
import {strings} from '../src/ui/i18n';
import {errorText} from '../src/application/errors';
import {formatStorage} from '../src/domain/storage';
import {LocaleContext} from '../src/ui/locale';
import {Comparison, Icon, Button} from '../src/ui/components';
import {BackgroundNotice, HelpLink, InformationProvider} from '../src/ui/information';
import Native, {seed, emitSession, emitRecreateModel, capabilities, sessionListeners} from '../tests/nativeMock';
import {PixoraThemeProvider, useTheme} from '../src/ui/theme';
const t = strings.en;
const image = {id:'image',mime:'image/png',size:128,width:64,height:48,workWidth:64,workHeight:48,hasAlpha:false,previewUri:'file:///before.png',needsPreparation:false};
const exported = {id:'export',mime:'image/png',format:'png',uri:'content://result',width:128,height:96,size:123,createdAt:1};
const navigation = {navigate:jest.fn(),goBack:jest.fn()};
const props = {navigation,route:{key:'home',name:'Home'}} as any;
const viewHome = () => render(<AppProvider><Home {...props}/></AppProvider>);
beforeEach(() => {jest.clearAllMocks(); seed(); Native.getNotificationStatus.mockResolvedValue(false);});

test('notification status failure falls back to disabled while startup succeeds', async () => {
  Native.getNotificationStatus.mockRejectedValueOnce(new Error('permission status unavailable'));
  function Probe() {
    const {notifications, startupError, loading} = useApp();
    return <Text>{`${loading}:${startupError}:${notifications}`}</Text>;
  }
  await render(<AppProvider><Probe /></AppProvider>);
  expect(await screen.findByText('false:false:false')).toBeOnTheScreen();
});

test('failed startup refresh reports recovery state and a later foreground refresh clears it', async () => {
  const changes: Array<(state: string) => void> = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    changes.push(listener as (state: string) => void);
    return {remove: jest.fn()};
  });
  Native.getSettings.mockRejectedValueOnce(new Error('settings read failed'));
  function Probe() {
    const {loading, startupError, message, settings} = useApp();
    return <Text>{`${loading}:${startupError}:${message}:${settings.language}`}</Text>;
  }
  const view = await render(<AppProvider><Probe /></AppProvider>);
  expect(await screen.findByText('false:true:modelInvalid:system')).toBeOnTheScreen();

  await act(async () => {
    changes.forEach(change => change('active'));
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  expect(view.getByText('false:false:modelInvalid:en')).toBeOnTheScreen();

  Native.getCapabilities.mockRejectedValueOnce(new Error('foreground capability refresh failed'));
  await act(async () => {
    changes.forEach(change => change('active'));
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  expect(view.getByText('false:false:modelInvalid:en')).toBeOnTheScreen();
});

test('first resolved app theme is applied immediately while later theme changes remain animated', async () => {
  function PaletteProbe() {
    const {dark, colors} = useTheme();
    return <Text testID="palette-probe">{`${dark}:${colors.bg}`}</Text>;
  }
  const animationFrame = jest.spyOn(globalThis, 'requestAnimationFrame');
  const view = await render(
    <PixoraThemeProvider dark={false} resolved={false}>
      <PaletteProbe />
    </PixoraThemeProvider>,
  );

  await view.rerender(
    <PixoraThemeProvider dark resolved>
      <PaletteProbe />
    </PixoraThemeProvider>,
  );
  expect(view.getByTestId('palette-probe')).toHaveTextContent('true:#09090B');
  expect(animationFrame).not.toHaveBeenCalled();

  await view.rerender(
    <PixoraThemeProvider dark={false} resolved>
      <PaletteProbe />
    </PixoraThemeProvider>,
  );
  expect(animationFrame).toHaveBeenCalled();
  expect(view.getByTestId('palette-probe').props.children.toLowerCase()).toBe('false:#09090b');

  await view.unmount();
  animationFrame.mockClear();
  const reverse = await render(
    <PixoraThemeProvider dark resolved={false}>
      <PaletteProbe />
    </PixoraThemeProvider>,
  );
  await reverse.rerender(
    <PixoraThemeProvider dark={false} resolved>
      <PaletteProbe />
    </PixoraThemeProvider>,
  );
  expect(reverse.getByTestId('palette-probe')).toHaveTextContent('false:#FAFAFC');
  expect(animationFrame).not.toHaveBeenCalled();
});

test('theme initialization remains usable when the accessibility motion query fails', async () => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockRejectedValueOnce(new Error('accessibility service unavailable'));
  function PaletteProbe() {
    const {dark, colors} = useTheme();
    return <Text testID="palette-after-motion-query-error">{`${dark}:${colors.bg}`}</Text>;
  }

  await render(<PixoraThemeProvider dark resolved><PaletteProbe /></PixoraThemeProvider>);
  expect(await screen.findByTestId('palette-after-motion-query-error')).toHaveTextContent('true:#09090B');
});

test('resolving the already displayed theme again does not restart its palette animation', async () => {
  function PaletteProbe() {
    const {colors} = useTheme();
    return <Text testID="unchanged-theme-palette">{colors.bg}</Text>;
  }
  const animationFrame = jest.spyOn(globalThis, 'requestAnimationFrame');
  const view = await render(
    <PixoraThemeProvider dark>
      <PaletteProbe />
    </PixoraThemeProvider>,
  );
  await view.rerender(
    <PixoraThemeProvider dark resolved={false}>
      <PaletteProbe />
    </PixoraThemeProvider>,
  );
  animationFrame.mockClear();
  await view.rerender(
    <PixoraThemeProvider dark resolved>
      <PaletteProbe />
    </PixoraThemeProvider>,
  );

  expect(view.getByTestId('unchanged-theme-palette')).toHaveTextContent('#09090B');
  expect(animationFrame).not.toHaveBeenCalled();
});

test.each(['READY','CANCELLED','FAILED','INTERRUPTED'])('input state %s can retry', async state => {
 seed({state,image,error:state==='FAILED'?'DECODE_FAILED':state==='INTERRUPTED'?'INTERRUPTED':''});
 await viewHome();
 await userEvent.press(await screen.findByRole('radio',{name:'4×'}));
 await userEvent.press(screen.getByRole('button',{name:state==='READY'?t.upscale:t.retry}));
 expect(Native.startJobWithProfile).toHaveBeenCalledWith(image.id,4,'standard','quality',true);
});
test('large source requires confirmation and cancel does not start', async () => {
 seed({state:'READY',image:{...image,width:4000,height:3000,workWidth:1024,workHeight:768,needsPreparation:true}});
 await viewHome();await userEvent.press(await screen.findByRole('button',{name:t.upscale}));
 expect(screen.getByText(t.prepareTitle)).toBeOnTheScreen();
 await userEvent.press(screen.getByRole('button',{name:t.cancel}));expect(Native.startJobWithProfile).not.toHaveBeenCalled();
 await userEvent.press(screen.getByRole('button',{name:t.upscale}));await userEvent.press(screen.getByRole('button',{name:t.prepare}));
 expect(Native.startJobWithProfile).toHaveBeenCalledTimes(1);
});
test.each(['PREPARING','RUNNING','FINALIZING','CANCELLING'])('active state %s explains work', async state => {
 seed({state,image,jobId:'job',phase:state==='RUNNING'?'upscaling':'loading_model',backend:'CPU',progress:state==='RUNNING'?25:-1,completedTiles:1,totalTiles:4,startedAt:Date.now()});
 await viewHome();expect(await screen.findByText(t.returnTitle)).toBeOnTheScreen();
 const button=screen.getByRole('button',{name:state==='CANCELLING'?t.cancelling:t.cancelJob});
 if(state==='CANCELLING')expect(button).toBeDisabled();else {await userEvent.press(button);expect(Native.cancelJob).toHaveBeenCalledWith('job');}
});
test.each([{backend:'GPU',error:'GPU_FAILED',elapsedMs:1000},{backend:'CPU',error:'',elapsedMs:301000},{backend:'CPU',error:'',elapsedMs:1000}])('processing explanation is specific %#', async item => {
 seed({state:'RUNNING',image,jobId:'job',phase:'unknown',progress:10,startedAt:Date.now(),...item});
 Native.getNotificationStatus.mockResolvedValue(true);await viewHome();
 expect(await screen.findByText(Platform.OS==='ios'?t.notificationIntroTitleIos:t.backgroundTitle)).toBeOnTheScreen();
 expect(screen.queryByRole('button',{name:t.enableNotifications})).not.toBeOnTheScreen();
});
test('active jobs do not repeat the permission prompt', async () => {
 seed({state:'RUNNING',image,sessionId:'session',jobId:'job',progress:-1,startedAt:Date.now()},{notificationIntroSeen:false});
 await viewHome();expect(await screen.findByText(t.returnTitle)).toBeOnTheScreen();
 expect(screen.queryByRole('button',{name:t.notificationEnableContinue})).not.toBeOnTheScreen();
 expect(Native.markNotificationHint).not.toHaveBeenCalled();
});
test.each([false,true])('first launch permits explicit notification choice=%s', async enable => {
 seed({state:'READY',image},{notificationIntroSeen:false});
 await viewHome();await userEvent.press(await screen.findByRole('button',{name:t.upscale}));
 expect(Native.startJobWithProfile).not.toHaveBeenCalled();
 await userEvent.press(screen.getByRole('button',{name:enable?t.notificationEnableContinue:t.notificationWithoutContinue}));
 expect(Native.markNotificationIntroSeen).toHaveBeenCalledTimes(1);
 expect(Native.requestNotifications).toHaveBeenCalledTimes(enable?1:0);
 expect(Native.openNotificationSettings).not.toHaveBeenCalled();
 expect(Native.startJobWithProfile).toHaveBeenCalledTimes(1);
});
test('closing the notification explanation cancels launch without persisting a choice', async () => {
 seed({state:'READY',image},{notificationIntroSeen:false});
 await viewHome();await userEvent.press(await screen.findByRole('button',{name:t.upscale}));
 await act(() => fireEvent(screen.getByTestId('information-panel-modal'), 'requestClose'));
 expect(Native.markNotificationIntroSeen).not.toHaveBeenCalled();
 expect(Native.startJobWithProfile).not.toHaveBeenCalled();
});
test('completed result exports and shares without removing it', async () => {
 seed({state:'SUCCEEDED',image,jobId:'job',resultUri:'file:///after.png',resultWidth:128,resultHeight:96,elapsedMs:1200});
 await viewHome();await userEvent.press(await screen.findByRole('button',{name:t.save}));
 expect(Native.exportResult).toHaveBeenCalledWith('job','png');
 await userEvent.press(screen.getByRole('button',{name:t.share}));expect(Native.shareResult).toHaveBeenCalledWith('job','png');
});
test('exported result opens and changing format permits a new export', async () => {
 seed({state:'SUCCEEDED',image,jobId:'job',resultUri:'file:///after.png',exports:[exported]});
 await viewHome();await userEvent.press(await screen.findByRole('button',{name:t.open}));expect(Native.openExport).toHaveBeenCalledWith('export');
 expect(screen.getByRole('button',{name:t.saved})).toBeDisabled();
 await userEvent.press(screen.getByRole('radio',{name:'JPEG'}));await userEvent.press(screen.getByRole('button',{name:t.save}));expect(Native.exportResult).toHaveBeenCalledWith('job','jpeg');
});
test('legacy original-resolution results still export through PNG after that option is removed', async () => {
 seed({state:'SUCCEEDED',image,jobId:'legacy-original',resolution:'original',resultUri:'file:///old-result.png',resultWidth:128,resultHeight:96});
 await viewHome();
 expect(screen.getByRole('radio',{name:'PNG',checked:true})).toBeOnTheScreen();
 expect(screen.queryByText('Original resolution')).not.toBeOnTheScreen();
 await userEvent.press(await screen.findByRole('button',{name:t.save}));
 expect(Native.exportResult).toHaveBeenCalledWith('legacy-original','png');
});
test('transparent JPEG requires confirmation for export and share', async () => {
 seed({state:'SUCCEEDED',image:{...image,hasAlpha:true},jobId:'job',resultUri:'file:///after.png'});
 await viewHome();await userEvent.press(await screen.findByRole('button',{name:t.continue}));await userEvent.press(await screen.findByRole('radio',{name:'JPEG'}));
 await userEvent.press(screen.getByRole('button',{name:t.save}));await userEvent.press(screen.getByRole('button',{name:t.cancel}));expect(Native.exportResult).not.toHaveBeenCalled();
 await userEvent.press(screen.getByRole('button',{name:t.share}));await userEvent.press(screen.getByRole('button',{name:t.confirmJpeg}));expect(Native.shareResult).toHaveBeenCalledWith('job','jpeg');
});
test('unsaved replacement can be cancelled', async () => {
 seed({state:'SUCCEEDED',image,jobId:'job',resultUri:'file:///after.png'});await viewHome();
 await userEvent.press(await screen.findByRole('button',{name:t.newImage}));await userEvent.press(screen.getByRole('button',{name:t.cancel}));expect(Native.pickImage).not.toHaveBeenCalled();
 await userEvent.press(screen.getByRole('button',{name:t.newImage}));await userEvent.press(screen.getByRole('button',{name:t.replace}));expect(Native.pickImage).toHaveBeenCalledTimes(1);
});
test('failed import leaves original ready and error is localized', async () => {
 seed({state:'READY',image});Native.pickImage.mockRejectedValueOnce({code:'DECODE_FAILED'});await viewHome();await userEvent.press(await screen.findByRole('button',{name:t.other}));
 expect(await screen.findByText(t.errors.DECODE_FAILED)).toBeOnTheScreen();expect(screen.getByRole('button',{name:t.upscale})).toBeEnabled();
});
test.each([false,true])('unsupported device / missing model %s', async supported => {
 capabilities.supported=supported;capabilities.modelValid=false;await viewHome();
 expect(await screen.findByText(supported?t.modelInvalid:t.unavailableBody)).toBeOnTheScreen();expect(screen.getByRole('button',{name:t.choose})).toBeDisabled();
});
test('events ignore stale snapshot and unsubscribe after unmount', async () => {
 const view=await viewHome();await screen.findByRole('button',{name:t.choose});
 await act(()=>{emitSession({state:'READY',image});sessionListeners.forEach(listener=>listener({...emptySession,sequence:0}));});
 expect(screen.getByRole('button',{name:t.upscale})).toBeOnTheScreen();await view.unmount();expect(sessionListeners.size).toBe(0);
});
test('Home remains usable when an older native bridge has no Recreate status API', async () => {
 const native = Native as any;
 const original = native.getRecreateModelState;
 native.getRecreateModelState = undefined;
 try {
  await viewHome();
  expect(await screen.findByRole('button',{name:t.choose})).toBeOnTheScreen();
  expect(Native.onRecreateModelChanged).not.toHaveBeenCalled();
 } finally {
  native.getRecreateModelState = original;
 }
});
test('recreate setup returns safely to image selection if its source image disappears', async () => {
 seed({state:'READY',image});
 emitSession({state:'READY',image});
 await viewHome();
 await userEvent.press(await screen.findByRole('radio',{name:t.recreate.title}));
 expect(screen.getByRole('button',{name:t.recreate.title})).toBeDisabled();
 await act(async()=>{emitSession({state:'EMPTY',image:undefined});});
 expect(await screen.findByRole('button',{name:t.choose})).toBeOnTheScreen();
 expect(screen.queryByRole('button',{name:t.recreate.title})).not.toBeOnTheScreen();
 expect(Native.startRecreateJob).not.toHaveBeenCalled();
});
test('recreate speed control persists the selected quality step when starting a ready model', async () => {
 seed({state:'READY',image});
 emitRecreateModel({state:'ready',downloadedBytes:1881812340,installedBytes:1881812340,error:''});
 await viewHome();
 await userEvent.press(await screen.findByRole('radio',{name:t.recreate.title}));
 const speed=await screen.findByRole('adjustable',{name:t.speedTitle});
 await fireEvent(speed,'accessibilityAction',{nativeEvent:{actionName:'decrement'}});
 expect(speed.props.accessibilityValue.now).toBe(0);
 await userEvent.press(screen.getByRole('button',{name:t.recreate.title}));
 await waitFor(()=>expect(Native.startRecreateJob).toHaveBeenCalledWith(image.id,2,'quality','',true));
});
test.each([undefined,{code:'BOGUS'},{code:'DECODE_FAILED'},{localKey:'busyClear'}])('errors have a safe translated fallback %#', error => {
 expect(errorText(error,'en')).toBe(error && 'localKey' in error?t.busyClear:error && error.code==='DECODE_FAILED'?t.errors.DECODE_FAILED:t.errors.INFERENCE_FAILED);
});
test.each(Object.keys(strings) as Array<keyof typeof strings>)('processing deadlines use the actual mode limit in %s', lang => {
 for(const [code,minutes] of [['TIME_LIMIT',30],['RECREATE_TIME_LIMIT',45]] as const) {
  const message=errorText({code},lang);
  expect(message).toBe(strings[lang].errors.TIME_LIMIT.replace('{minutes}',new Intl.NumberFormat(lang).format(minutes)));
  expect(message).not.toContain('{minutes}');
 }
});
test('comparison supports buttons without a gesture', async () => {
 await render(<Comparison before="file:///b" after="file:///a" ratio={1} t={t}/>);
 for(const name of [t.before,t.after,t.compare]){await userEvent.press(screen.getByRole('radio',{name}));expect(screen.getByRole('radio',{name})).toHaveProp('accessibilityState',{checked:true,disabled:false});}
 await fireEvent(screen.getByTestId('comparison'),'layout',{nativeEvent:{layout:{width:200}}});
});
test.each(['en','ar'] as const)('icons support locale %s and explicit/default colours', async lang => {
 await render(<LocaleContext.Provider value={lang}><Icon name="back"/><Icon name="chevron"/><Icon name="image" color="#123456"/><Button title="Go" onPress={()=>{}} icon="spark" secondary/><BackgroundNotice enabled/><BackgroundNotice enabled={false}/></LocaleContext.Provider>);
 await userEvent.press(screen.getByRole('button',{name:'Go'}));
});

test('settings changes theme, follows system, and preserves export defaults', async () => {
 seed({}, {theme:'light'});
 await render(<AppProvider><SettingsScreen {...props}/></AppProvider>);
 await userEvent.press(await screen.findByRole('radio',{name:t.dark}));
 expect(Native.updateSettings).toHaveBeenCalledWith('en','png','dark');
 await userEvent.press(screen.getByRole('radio',{name:t.system}));
 expect(Native.updateSettings).toHaveBeenLastCalledWith('en','png','system');
 await userEvent.press(screen.getByRole('radio',{name:'JPEG'}));
 expect(Native.updateSettings).toHaveBeenLastCalledWith('en','jpeg','system');
 await userEvent.press(screen.getByRole('button',{name:t.notificationSettings}));
 expect(Native.openNotificationSettings).toHaveBeenCalled();
});
test('system theme switch reflects the effective dark palette without profile identity', async () => {
 seed({}, {theme:'system'});
 const scheme = jest.spyOn(require('react-native'),'useColorScheme').mockReturnValue('dark');
 await render(<AppProvider><SettingsScreen {...props}/></AppProvider>);
 expect(screen.getByRole('radio',{name:t.system})).toHaveProp('accessibilityState',{checked:true,disabled:false});
 expect(screen.queryByText('Account')).not.toBeOnTheScreen();
 expect(screen.queryByText('On')).not.toBeOnTheScreen();
 scheme.mockRestore();
});
test('settings selects every language and preserves session', async () => {
 seed({state:'READY',image});await render(<AppProvider><SettingsScreen {...props}/></AppProvider>);
 for(const [code,name] of [['ru','\u0420\u0443\u0441\u0441\u043a\u0438\u0439'],['zh-Hans','简体中文'],['es','Español'],['hi','हिन्दी'],['ar','العربية'],['pt-BR','Português (Brasil)'],['fr','Français'],['de','Deutsch'],['ja','日本語'],['en','English']]) {
   await userEvent.press(within(screen.getByTestId('settings-language-selector')).getByRole('button'));await userEvent.press(screen.getByRole('menuitem',{name}));
   expect(Native.updateSettings).toHaveBeenLastCalledWith(code,'png','light');
 }
});
test('settings supports licenses, clear, discard and back', async () => {
 await render(<AppProvider><SettingsScreen {...props}/></AppProvider>);
 const licenses=(await screen.findAllByRole('button',{name:t.licenses}))[0]!;
 expect(StyleSheet.flatten(licenses.props.style)).toMatchObject({backgroundColor:'transparent',borderWidth:0,boxShadow:'none',paddingHorizontal:0,minWidth:0,borderRadius:0});
 await userEvent.press(licenses);expect(await screen.findByText('Local license text')).toBeOnTheScreen();
 await userEvent.press((await screen.findAllByRole('button',{name:t.back})).at(-1)!);await userEvent.press(screen.getByRole('button',{name:t.recreate.clearCache}));expect(Native.clearCache).toHaveBeenCalled();
 await userEvent.press(screen.getByRole('button',{name:t.discard}));await userEvent.press((await screen.findAllByRole('button',{name:t.cancel})).at(-1)!);expect(Native.discardSession).not.toHaveBeenCalled();
 await userEvent.press(screen.getByRole('button',{name:t.discard}));await userEvent.press(screen.getByRole('button',{name:t.delete}));expect(Native.discardSession).toHaveBeenCalled();
 await userEvent.press((await screen.findAllByRole('button',{name:t.back}))[0]);expect(navigation.goBack).toHaveBeenCalled();
});
test('the Settings About license link opens the locally bundled legal text', async () => {
 await render(<AppProvider><SettingsScreen {...props}/></AppProvider>);
 const aboutLicense=(await screen.findAllByRole('button',{name:t.licenses})).at(-1)!;
 expect(aboutLicense).toHaveProp('accessibilityLabel',t.licenses);
 await userEvent.press(aboutLicense);
 expect(await screen.findByText('Local license text')).toBeOnTheScreen();
 expect(Native.getLegalText).toHaveBeenCalledTimes(1);
 await userEvent.press(screen.getByRole('button',{name:t.back}));
 expect(screen.getByText(t.about)).toBeOnTheScreen();
});
test('a failed local-license read leaves Settings open and reports a retryable error', async () => {
 Native.getLegalText.mockRejectedValueOnce({code:'INFERENCE_FAILED'});
 await render(<AppProvider><SettingsScreen {...props}/></AppProvider>);
 await userEvent.press((await screen.findAllByRole('button',{name:t.licenses}))[0]!);
 expect(await screen.findByText(t.errors.INFERENCE_FAILED)).toBeOnTheScreen();
 expect(screen.getByText(t.settings)).toBeOnTheScreen();
});
test('Settings back on its root page returns to the previous route', async () => {
 await render(<AppProvider><SettingsScreen {...props}/></AppProvider>);
 await userEvent.press(await screen.findByRole('button',{name:t.back}));
 expect(navigation.goBack).toHaveBeenCalledTimes(1);
});
test('settings refreshes storage on model state changes, throttles duplicate events, and unsubscribes', async () => {
 const now=jest.spyOn(Date,'now').mockReturnValue(1000);
 const view=await render(<AppProvider><SettingsScreen {...props}/></AppProvider>);
 await screen.findByRole('button',{name:t.back});
 const baseline=Native.getStorageUsage.mock.calls.length;
 await act(async()=>{emitRecreateModel({state:'downloading'});});
 expect(Native.getStorageUsage).toHaveBeenCalledTimes(baseline+1);
 await act(async()=>{emitRecreateModel({state:'downloading'});});
 expect(Native.getStorageUsage).toHaveBeenCalledTimes(baseline+1);
 now.mockReturnValue(2001);
 await act(async()=>{emitRecreateModel({state:'downloading'});});
 expect(Native.getStorageUsage).toHaveBeenCalledTimes(baseline+2);
 await act(async()=>{emitRecreateModel({state:'ready'});});
 expect(Native.getStorageUsage).toHaveBeenCalledTimes(baseline+3);
 await view.unmount();
 await act(async()=>{emitRecreateModel({state:'failed'});});
 expect(Native.getStorageUsage).toHaveBeenCalledTimes(baseline+3);
 now.mockRestore();
});
test('settings protects an active session from deletion', async () => {
 seed({state:'RUNNING',image});await render(<AppProvider><SettingsScreen {...props}/></AppProvider>);
 await userEvent.press(await screen.findByRole('button',{name:t.discard}));expect(await screen.findByText(t.busyClear)).toBeOnTheScreen();expect(Native.discardSession).not.toHaveBeenCalled();
});
test('help explains the model and closes with one action', async () => {
 await render(<InformationProvider><HelpLink/></InformationProvider>);
 await userEvent.press(screen.getByRole('button',{name:t.how}));
 expect(screen.getByText(t.howTitle)).toBeOnTheScreen();await userEvent.press(screen.getByRole('button',{name:t.understood}));expect(screen.queryByText(t.howTitle)).not.toBeOnTheScreen();
});
test('fast inference can be selected independently from the model', async () => {
 seed({state:'READY',image});capabilities.modes=['quality','fast'];await viewHome();
 expect(await screen.findByRole('button',{name:`${t.recreate.model}: ${t.presets.standard.title}`})).toBeOnTheScreen();
 const speed = await screen.findByRole('adjustable', {name:t.speedTitle});
 await fireEvent(speed, 'accessibilityAction', {nativeEvent:{actionName:'increment'}});
 expect(screen.getByRole('adjustable', {name:t.speedTitle})).toHaveAccessibilityValue({now:1});
 await userEvent.press(screen.getByRole('button',{name:t.upscale}));
 expect(Native.startJobWithProfile).toHaveBeenCalledWith(image.id,2,'standard','fast',true);
});
test('Home opens settings and JPEG share cancellation retains result',async()=>{
 seed({state:'SUCCEEDED',image:{...image,hasAlpha:true},jobId:'job',resultUri:'file:///after.png'});await viewHome();
 await userEvent.press(await screen.findByRole('button',{name:t.settings}));expect(navigation.navigate).toHaveBeenCalledWith('Settings');
 await userEvent.press(screen.getByRole('radio',{name:'JPEG'}));await userEvent.press(screen.getByRole('button',{name:t.share}));await userEvent.press(screen.getByRole('button',{name:t.cancel}));expect(Native.shareResult).not.toHaveBeenCalled();
});
test.each([null,1e7])('settings shows unavailable or large storage %#',async bytes=>{
 if(bytes!==null)capabilities.workBytes=bytes;else Native.getCapabilities.mockResolvedValueOnce(null as any);
 await render(<AppProvider><SettingsScreen {...props}/></AppProvider>);await screen.findByRole('button',{name:t.clear});
});
test('storage display switches to decimal GB at the boundary without duplicate heading or MiB units',async()=>{
 expect(formatStorage(999_999_999,'en')).toBe('1,000 MB');
 expect(formatStorage(1_000_000_000,'en')).toBe('1 GB');
 Native.getStorageUsage.mockResolvedValue({cacheBytes:120000000,sessionBytes:300000000,temporaryBytes:0,recreateModelBytes:400000000,otherBytes:180000000,totalBytes:1000000000,freeBytes:2500000000});
 await render(<AppProvider><SettingsScreen {...props}/></AppProvider>);
 expect(await screen.findByRole('progressbar',{name:t.storageUsage.total})).toBeOnTheScreen();
 expect(screen.getAllByText(t.storageUsage.total)).toHaveLength(1);
 expect(screen.queryByText(/MiB/)).not.toBeOnTheScreen();
 expect(screen.getByText(new RegExp(`${t.storageUsage.free}:.*2\.5 GB`))).toBeOnTheScreen();
});
test('large storage total keeps sub-gigabyte categories in MB and the model category in GB',async()=>{
 Native.getStorageUsage.mockResolvedValue({cacheBytes:0,sessionBytes:11_500_000,temporaryBytes:0,recreateModelBytes:1_900_000_000,otherBytes:0,totalBytes:1_911_500_000,freeBytes:2_000_000_000});
 await render(<AppProvider><SettingsScreen {...props}/></AppProvider>);
 const meter=await screen.findByRole('progressbar',{name:t.storageUsage.total});
 expect(meter.props.accessibilityValue.text).toContain(`${t.storageUsage.sessions} 11.5 MB`);
 expect(meter.props.accessibilityValue.text).toContain(`${t.storageUsage.model} 1.9 GB`);
 expect(screen.getByText('11.5 MB')).toBeOnTheScreen();
 expect(screen.getAllByText('1.9 GB').length).toBeGreaterThan(0);
 expect(meter.props.accessibilityValue.text).not.toContain('0 GB');
});
test('shared styles also support their default LTR argument',()=>{const {createStyles}=require('../src/ui/components');const {darkColors}=require('../src/ui/theme');expect(createStyles(darkColors).row.flexDirection).toBe('row')});
test('a restored image remains visible if device capabilities are unavailable',async()=>{
 seed({state:'READY',image});Native.getCapabilities.mockResolvedValueOnce(null as any);await viewHome();expect(await screen.findByRole('button',{name:t.upscale})).toBeDisabled();
});

test('retry restores the persisted fast mode and scale after interruption', async () => {
 seed({state:'INTERRUPTED',image,mode:'fast',scale:4,error:'INTERRUPTED'});capabilities.modes=['quality','fast'];await viewHome();
 expect(await screen.findByRole('button',{name:`${t.recreate.model}: ${t.presets.lite.title}`})).toBeOnTheScreen();
 expect(screen.getByRole('radio',{name:'4×',checked:true})).toBeOnTheScreen();
 await userEvent.press(screen.getByRole('button',{name:t.retry}));
 expect(Native.startJobWithProfile).toHaveBeenCalledWith(image.id,4,'lite','quality',true);
});

test('backgrounding the notification explanation cancels launch without persisting a choice', async () => {
 seed({state:'READY',image},{notificationIntroSeen:false});
 const changes: Array<(state: string) => void> = [];
 const listener = jest.spyOn(AppState, 'addEventListener').mockImplementation((event, callback) => {
  if (event === 'change') changes.push(callback as (state: string) => void);
  return {remove: jest.fn()};
 });
 await viewHome();
 await userEvent.press(await screen.findByRole('button',{name:t.upscale}));
 expect(screen.getByText(Platform.OS==='ios'?t.notificationIntroTitleIos:t.notificationIntroTitle)).toBeOnTheScreen();
 await act(() => changes.forEach(change => change('background')));
 expect(screen.queryByText(Platform.OS==='ios'?t.notificationIntroTitleIos:t.notificationIntroTitle)).not.toBeOnTheScreen();
 expect(Native.markNotificationIntroSeen).not.toHaveBeenCalled();
 expect(Native.startJobWithProfile).not.toHaveBeenCalled();
 listener.mockRestore();
});
