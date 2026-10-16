import React from 'react';
import {render, screen, userEvent, act, fireEvent} from '@testing-library/react-native';
import {AppState} from 'react-native';
import {AppProvider} from '../src/application/AppProvider';
import {Home} from '../src/screens/Home';
import {SettingsScreen} from '../src/screens/Settings';
import {emptySession} from '../src/domain/session';
import {strings} from '../src/ui/i18n';
import {errorText} from '../src/application/errors';
import {LocaleContext} from '../src/ui/locale';
import {Comparison, Icon, Button} from '../src/ui/components';
import {BackgroundNotice, HelpLink, InformationProvider} from '../src/ui/information';
import Native, {seed, emitSession, capabilities, settings, sessionListeners} from '../tests/nativeMock';
const t = strings.en;
const image = {id:'image',mime:'image/png',size:128,width:64,height:48,workWidth:64,workHeight:48,hasAlpha:false,previewUri:'file:///before.png',needsPreparation:false};
const exported = {id:'export',mime:'image/png',format:'png',uri:'content://result',width:128,height:96,size:123,createdAt:1};
const navigation = {navigate:jest.fn(),goBack:jest.fn()};
const props = {navigation,route:{key:'home',name:'Home'}} as any;
const viewHome = () => render(<AppProvider><Home {...props}/></AppProvider>);
beforeEach(() => {jest.clearAllMocks(); seed(); Native.getNotificationStatus.mockResolvedValue(false);});

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
 expect(await screen.findByText(t.backgroundTitle)).toBeOnTheScreen();
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
 await act(() => fireEvent(screen.getByTestId('information-panel'), 'requestClose'));
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
test('transparent JPEG requires confirmation for export and share', async () => {
 seed({state:'SUCCEEDED',image:{...image,hasAlpha:true},jobId:'job',resultUri:'file:///after.png'});
 await viewHome();await userEvent.press(await screen.findByRole('radio',{name:'JPEG'}));
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
test.each([undefined,{code:'BOGUS'},{code:'DECODE_FAILED'},{localKey:'busyClear'}])('errors have a safe translated fallback %#', error => {
 expect(errorText(error,'en')).toBe(error && 'localKey' in error?t.busyClear:error && error.code==='DECODE_FAILED'?t.errors.DECODE_FAILED:t.errors.INFERENCE_FAILED);
});
test('comparison supports buttons without a gesture', async () => {
 await render(<Comparison before="file:///b" after="file:///a" ratio={1} t={t}/>);
 for(const name of [t.before,t.after,t.compare]){await userEvent.press(screen.getByRole('radio',{name}));expect(screen.getByRole('radio',{name})).toBeSelected();}
 await fireEvent(screen.getByTestId('comparison'),'layout',{nativeEvent:{layout:{width:200}}});
});
test.each(['en','ar'] as const)('icons support locale %s and explicit/default colours', async lang => {
 await render(<LocaleContext.Provider value={lang}><Icon name="back"/><Icon name="chevron"/><Icon name="image" color="#123456"/><Button title="Go" onPress={()=>{}} icon="spark" secondary/><BackgroundNotice enabled/><BackgroundNotice enabled={false}/></LocaleContext.Provider>);
 await userEvent.press(screen.getByRole('button',{name:'Go'}));
});

test.each(['light','dark','system'])('settings edits %s theme and export defaults', async theme => {
 await render(<AppProvider><SettingsScreen {...props}/></AppProvider>);
 await userEvent.press(await screen.findByRole('radio',{name:t[theme as 'light'|'dark'|'system']}));
 expect(Native.updateSettings).toHaveBeenCalledWith('en','png',theme);
 await userEvent.press(screen.getByRole('radio',{name:'JPEG'}));expect(Native.updateSettings).toHaveBeenLastCalledWith('en','jpeg',theme);
 await userEvent.press(screen.getByRole('button',{name:t.notificationSettings}));expect(Native.openNotificationSettings).toHaveBeenCalled();
});
test('settings selects every language and preserves session', async () => {
 seed({state:'READY',image});await render(<AppProvider><SettingsScreen {...props}/></AppProvider>);
 for(const [code,name] of [['ru','Русский'],['zh-Hans','简体中文'],['es','Español'],['hi','हिन्दी'],['ar','العربية'],['pt','Português'],['fr','Français'],['de','Deutsch'],['ja','日本語'],['en','English']]) {
   const current = settings.language === 'system'?strings.en.system:({en:'English',ru:'Русский','zh-Hans':'简体中文',es:'Español',hi:'हिन्दी',ar:'العربية',pt:'Português',fr:'Français',de:'Deutsch',ja:'日本語'} as Record<string,string>)[settings.language];
   await userEvent.press(screen.getByRole('button',{name:new RegExp(current)}));await userEvent.press(screen.getByRole('radio',{name}));
   expect(Native.updateSettings).toHaveBeenLastCalledWith(code,'png','light');
 }
});
test('settings supports licenses, clear, discard and back', async () => {
 await render(<AppProvider><SettingsScreen {...props}/></AppProvider>);
 await userEvent.press(await screen.findByRole('button',{name:t.licenses}));expect(await screen.findByText('Local license text')).toBeOnTheScreen();
 await userEvent.press(screen.getByRole('button',{name:t.back}));await userEvent.press(screen.getByRole('button',{name:t.clear}));expect(Native.clearTemporaryFiles).toHaveBeenCalled();
 await userEvent.press(screen.getByRole('button',{name:t.discard}));await userEvent.press(screen.getByRole('button',{name:t.cancel}));expect(Native.discardSession).not.toHaveBeenCalled();
 await userEvent.press(screen.getByRole('button',{name:t.discard}));await userEvent.press(screen.getByRole('button',{name:t.delete}));expect(Native.discardSession).toHaveBeenCalled();
 await userEvent.press(screen.getByRole('button',{name:t.back}));expect(navigation.goBack).toHaveBeenCalled();
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
test('fast selection is available only when capabilities allow it', async () => {
 seed({state:'READY',image});capabilities.modes=['quality','fast'];await viewHome();
 await userEvent.press(await screen.findByRole('button',{name:`${t.profileTitle}: ${t.presets.standard.title}`}));await userEvent.press(screen.getByRole('button',{name:t.presets.lite.title}));expect(screen.getByText(t.presets.lite.note)).toBeOnTheScreen();
 await userEvent.press(screen.getByRole('button',{name:t.upscale}));expect(Native.startJobWithProfile).toHaveBeenCalledWith(image.id,2,'lite','quality',true);
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
test('shared styles also support their default LTR argument',()=>{const {createStyles}=require('../src/ui/components');const {darkColors}=require('../src/ui/theme');expect(createStyles(darkColors).row.flexDirection).toBe('row')});
test('a restored image remains visible if device capabilities are unavailable',async()=>{
 seed({state:'READY',image});Native.getCapabilities.mockResolvedValueOnce(null as any);await viewHome();expect(await screen.findByRole('button',{name:t.upscale})).toBeDisabled();
});

test('retry restores the persisted fast mode and scale after interruption', async () => {
 seed({state:'INTERRUPTED',image,mode:'fast',scale:4,error:'INTERRUPTED'});capabilities.modes=['quality','fast'];await viewHome();
 expect(await screen.findByRole('button',{name:`${t.profileTitle}: ${t.presets.lite.title}`})).toBeOnTheScreen();
 expect(screen.getByRole('radio',{name:'4×',selected:true})).toBeOnTheScreen();
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
 expect(screen.getByText(t.notificationIntroTitle)).toBeOnTheScreen();
 await act(() => changes[0]?.('background'));
 expect(screen.queryByTestId('information-panel')).toBeNull();
 expect(Native.markNotificationIntroSeen).not.toHaveBeenCalled();
 expect(Native.startJobWithProfile).not.toHaveBeenCalled();
 listener.mockRestore();
});
