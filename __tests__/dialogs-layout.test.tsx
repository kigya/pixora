import React from 'react';
import * as RN from 'react-native';
import {render,screen,userEvent,fireEvent,act,renderHook} from '@testing-library/react-native';
import {DialogProvider,useConfirm} from '../src/ui/dialog';
import {InformationProvider,HelpLink,LanguagePicker} from '../src/ui/information';
import {Comparison} from '../src/ui/components';
import {Workbench,usePane} from '../src/ui/layout';
import {LocaleContext} from '../src/ui/locale';
import {strings} from '../src/ui/i18n';
import Native,{layoutListeners,seed} from '../tests/nativeMock';
const t=strings.en;
afterEach(()=>jest.restoreAllMocks());
test('comparison captures horizontal movement and clamps its divider',async()=>{
 let handlers:any;
 const create=jest.spyOn(RN.PanResponder,'create').mockImplementation(config=>{handlers=config;return {panHandlers:{}} as any});
 await render(<Comparison before="b" after="a" ratio={1} t={t}/>);
 expect(handlers.onStartShouldSetPanResponder()).toBe(false);
 expect(handlers.onMoveShouldSetPanResponder({}, {dx:3,dy:0})).toBe(false);
 expect(handlers.onMoveShouldSetPanResponder({}, {dx:10,dy:10})).toBe(false);
 expect(handlers.onMoveShouldSetPanResponder({}, {dx:10,dy:0})).toBe(true);
 await act(()=>handlers.onPanResponderGrant({nativeEvent:{locationX:-10}}));expect(screen.getByRole('radio',{name:t.after})).toBeSelected();
 await act(()=>handlers.onPanResponderMove({nativeEvent:{locationX:10000}}));expect(screen.getByRole('radio',{name:t.before})).toBeSelected();
 await act(()=>handlers.onPanResponderRelease());
 expect(Native.logTelemetryEvent).toHaveBeenCalledWith('comparison_used',JSON.stringify({action:'divider'}));create.mockRestore();
});
test.each([false,true])('modal handles native Back and accessibility focus reduced=%s',async reduced=>{
 jest.spyOn(RN.AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(reduced);
 let done:Promise<boolean>|undefined;const resolved=jest.fn();
 function Ask(){const confirm=useConfirm();return <RN.Button title="Ask" onPress={()=>{done=confirm('Title','Body','Yes','No');done.then(resolved)}}/>}
 await render(<DialogProvider><Ask/></DialogProvider>);await userEvent.press(screen.getByRole('button',{name:'Ask'}));
 const modal=screen.getByTestId('confirmation-dialog');
 const find=jest.spyOn(require('react-native'),'findNodeHandle').mockReturnValueOnce(1).mockReturnValueOnce(null);
 const focus=jest.spyOn(RN.AccessibilityInfo,'setAccessibilityFocus');
 await fireEvent(modal,'show');expect(focus).toHaveBeenCalledWith(1);await fireEvent(modal,'show');
 await fireEvent(modal,'requestClose');expect(await done).toBe(false);find.mockRestore();
});
test('pending confirmation is rejected on unmount and replacement',async()=>{
 const pending:Array<Promise<boolean>>=[];
 function Ask(){const confirm=useConfirm();return <RN.Button title="Ask" onPress={()=>pending.push(confirm('Title','Body','Yes','No'))}/>}
 const view=await render(<DialogProvider><Ask/></DialogProvider>);await userEvent.press(screen.getByRole('button',{name:'Ask'}));
 // Native callers can request a second confirmation before the first closes.
 await userEvent.press(screen.getByRole('button',{name:'Ask',includeHiddenElements:true}));expect(await pending[0]).toBe(false);
 await view.unmount();expect(await pending[1]).toBe(false);
 const fallback=await renderHook(()=>useConfirm());expect(await fallback.result.current('A','B','C','D')).toBe(false);
});
test('help and language panels close through native Back',async()=>{
 await render(<InformationProvider><HelpLink/><LanguagePicker value="system" onChange={async()=>{}}/></InformationProvider>);
 await userEvent.press(screen.getByRole('button',{name:t.how}));await fireEvent(screen.getByTestId('information-panel'),'requestClose');
 expect(screen.queryByText(t.howTitle)).not.toBeOnTheScreen();
 await userEvent.press(screen.getByRole('button',{name:`${t.language}: ${t.system}`}));await userEvent.press(screen.getByRole('radio',{name:t.system}));
 await userEvent.press(screen.getByRole('button',{name:`${t.language}: ${t.system}`}));await fireEvent(screen.getByTestId('information-panel'),'requestClose');
});
test.each([{width:320,rtl:false,fontScale:1},{width:840,rtl:false,fontScale:1},{width:840,rtl:true,fontScale:1},{width:840,rtl:false,fontScale:2}])('responsive workbench %#',async item=>{
 jest.spyOn(require('react-native'),'useWindowDimensions').mockReturnValue({width:item.width,height:600,scale:1,fontScale:item.fontScale});
 await render(<LocaleContext.Provider value={item.rtl?'ar':'en'}><Workbench preview={<RN.Text>Preview</RN.Text>}><RN.Text>Controls</RN.Text></Workbench></LocaleContext.Provider>);
 expect(screen.getByText('Controls')).toBeOnTheScreen();
});
test('hinge events update the pane; initial lookup failure is contained',async()=>{
 seed();Native.getWindowLayout.mockRejectedValueOnce(new Error('not available'));const hook=await renderHook(()=>usePane());
 await act(()=>{layoutListeners.forEach(listener=>listener({x:100,y:0,width:20,height:800,separating:true}))});
 expect(hook.result.current.width).toBeGreaterThan(0);await hook.unmount();expect(layoutListeners.size).toBe(0);
});
test('phone help panel and confirmation dismiss through their backdrops',async()=>{
 jest.spyOn(require('react-native'),'useWindowDimensions').mockReturnValue({width:320,height:600,scale:1,fontScale:1});
 let done:Promise<boolean>|undefined;
 function Ask(){const confirm=useConfirm();return <RN.Button title="Ask" onPress={()=>{done=confirm('Title','Body','Yes','No')}}/>}
 await render(<DialogProvider><InformationProvider><HelpLink/><Ask/></InformationProvider></DialogProvider>);
 await userEvent.press(screen.getByRole('button',{name:t.how}));await fireEvent.press(screen.getByTestId('information-backdrop'));expect(screen.queryByText(t.howTitle)).not.toBeOnTheScreen();
 await userEvent.press(screen.getByRole('button',{name:'Ask'}));await fireEvent.press(screen.getByTestId('confirmation-backdrop'));expect(await done).toBe(false);
});
test('comparison layout is measured before pixel divider movement',async()=>{
 jest.spyOn(RN.PanResponder,'create').mockReturnValue({panHandlers:{}} as any);
 await render(<Comparison before="b" after="a" ratio={1} t={t}/>);await fireEvent(screen.getByTestId('comparison'),'layout',{nativeEvent:{layout:{width:200}}});
});
