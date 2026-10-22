import React from 'react';
import * as RN from 'react-native';
import {render,screen,userEvent,fireEvent,act,renderHook,waitFor} from '@testing-library/react-native';
import {DialogProvider,useConfirm} from '../src/ui/dialog';
import {InformationProvider,HelpLink,LanguagePicker} from '../src/ui/information';
import {Comparison} from '../src/ui/components';
import {Workbench,usePane} from '../src/ui/layout';
import {LocaleContext} from '../src/ui/locale';
import {strings} from '../src/ui/i18n';
import Native,{layoutListeners,seed} from '../tests/nativeMock';
const t=strings.en;
afterEach(()=>jest.restoreAllMocks());
test('comparison exposes bounded divider changes to accessibility and independent before/after actions', async () => {
 await render(<Comparison before="b" after="a" ratio={1} t={t}/>);
 const divider = screen.getByRole('adjustable');
 for (let i=0;i<20;i++) await fireEvent(divider,'accessibilityAction',{nativeEvent:{actionName:'increment'}});
 expect(divider).toHaveAccessibilityValue({min:0,max:100,now:100});
 for (let i=0;i<20;i++) await fireEvent(divider,'accessibilityAction',{nativeEvent:{actionName:'decrement'}});
 expect(divider).toHaveAccessibilityValue({min:0,max:100,now:0});
 await userEvent.press(screen.getByRole('radio',{name:t.before}));
 expect(screen.getByRole('radio',{name:t.before})).toBeSelected();
 await userEvent.press(screen.getByRole('radio',{name:t.after}));
 expect(screen.getByRole('radio',{name:t.after})).toBeSelected();
 expect(Native.logTelemetryEvent).toHaveBeenCalledWith('comparison_used',JSON.stringify({action:'divider'}));
});
test('Kinetik confirmation preserves the promise result and focuses its heading',async()=>{
 let done:Promise<boolean>|undefined;const resolved=jest.fn();
 function Ask(){const confirm=useConfirm();return <RN.Button title="Ask" onPress={()=>{done=confirm('Title','Body','Yes','No');done.then(resolved)}}/>}
 await render(<DialogProvider><Ask/></DialogProvider>);await userEvent.press(screen.getByRole('button',{name:'Ask'}));
 expect(screen.getByTestId('confirmation-dialog')).toBeOnTheScreen();
 expect(screen.getByRole('heading',{name:'Title'})).toBeOnTheScreen();
 const find=jest.spyOn(require('react-native'),'findNodeHandle').mockReturnValue(1);
 const focus=jest.spyOn(RN.AccessibilityInfo,'setAccessibilityFocus');
 await waitFor(()=>expect(focus).toHaveBeenCalledWith(1));
 await userEvent.press(screen.getByRole('button',{name:'Yes'}));
 expect(await done).toBe(true);expect(resolved).toHaveBeenCalledWith(true);find.mockRestore();
});
test('long confirmation content stays in a scroll container with actions available',async()=>{
 const body=Array.from({length:80},(_,index)=>`detail ${index+1}`).join('\n');
 let done:Promise<boolean>|undefined;
 function Ask(){const confirm=useConfirm();return <RN.Button title="Ask" onPress={()=>{done=confirm('Long title',body,'Continue','Cancel')}}/>}
 await render(<DialogProvider><Ask/></DialogProvider>);await userEvent.press(screen.getByRole('button',{name:'Ask'}));
 expect(screen.getByTestId('confirmation-scroll')).toBeOnTheScreen();
 expect(screen.getByText(body)).toBeOnTheScreen();
 await userEvent.press(screen.getByRole('button',{name:'Cancel'}));expect(await done).toBe(false);
});
test('Kinetik confirmation resolves false when the platform sends Back',async()=>{
 let done:Promise<boolean>|undefined;
 function Ask(){const confirm=useConfirm();return <RN.Button title="Ask" onPress={()=>{done=confirm('Title','Body','Yes','No')}}/>}
 await render(<DialogProvider><Ask/></DialogProvider>);await userEvent.press(screen.getByRole('button',{name:'Ask'}));
 await fireEvent(screen.getByTestId('confirmation-dialog-modal'),'requestClose');
 expect(await done).toBe(false);
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
test('phone help panel and Kinetik confirmation dismiss through their backdrops',async()=>{
 jest.spyOn(require('react-native'),'useWindowDimensions').mockReturnValue({width:320,height:600,scale:1,fontScale:1});
 let done:Promise<boolean>|undefined;
 function Ask(){const confirm=useConfirm();return <RN.Button title="Ask" onPress={()=>{done=confirm('Title','Body','Yes','No')}}/>}
 await render(<DialogProvider><InformationProvider><HelpLink/><Ask/></InformationProvider></DialogProvider>);
 await userEvent.press(screen.getByRole('button',{name:t.how}));await fireEvent.press(screen.getByTestId('information-backdrop'));expect(screen.queryByText(t.howTitle)).not.toBeOnTheScreen();
 await userEvent.press(screen.getByRole('button',{name:'Ask'}));await userEvent.press(screen.getByRole('button',{name:'Close dialog'}));expect(await done).toBe(false);
});
test('comparison layout is measured before pixel divider movement',async()=>{
 jest.spyOn(RN.PanResponder,'create').mockReturnValue({panHandlers:{}} as any);
 await render(<Comparison before="b" after="a" ratio={1} t={t}/>);await fireEvent(screen.getByTestId('comparison'),'layout',{nativeEvent:{layout:{width:200}}});
});
