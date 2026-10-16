import {renderHook, act} from '@testing-library/react-native';
import {useOperation} from '../src/application/useOperation';
import {paneBounds,twoColumns} from '../src/domain/layout';
import {languageFor,isActive,emptySession,sessionReducer,workSize,storageReserve} from '../src/domain/session';
import {formatCopy} from '../src/ui/i18n';
import {ltrValue} from '../src/ui/locale';

test('synchronous lock prevents concurrent settings operations and releases after failure', async () => {
 const started=jest.fn();const hook=await renderHook(()=>useOperation(started));let release!:()=>void;
 const first=jest.fn(()=>new Promise<void>(resolve=>{release=resolve}));const second=jest.fn(async()=>{});
 let promise!:Promise<void>;
 await act(()=>{promise=hook.result.current.run(first,'save');hook.result.current.run(second,'save');});
 expect(first).toHaveBeenCalledTimes(1);expect(second).not.toHaveBeenCalled();expect(hook.result.current.operation).toBe('save');
 await act(async()=>{release();await promise});expect(hook.result.current.operation).toBe('');
 const failure=new Error('failed');await act(()=>hook.result.current.run(async()=>{throw failure}));expect(hook.result.current.error).toBe(failure);expect(started).toHaveBeenCalledTimes(2);
});
test('operation works without a start callback',async()=>{const hook=await renderHook(()=>useOperation());await act(()=>hook.result.current.run(async()=>{}));expect(hook.result.current.error).toBeNull()});
test('hinge chooses larger pane with ties and clamps unavailable space',()=>{
 const f={x:0,y:0,width:20,height:800,separating:true};
 expect(paneBounds(800,800,{...f,x:390}).marginLeft).toBe(0);
 expect(paneBounds(800,800,{...f,x:100}).marginLeft).toBe(120);
 expect(paneBounds(800,800,{...f,x:700}).marginLeft).toBe(0);
 expect(paneBounds(0,800,f).width).toBe(1);
 const h={x:0,y:100,width:800,height:20,separating:true};
 expect(paneBounds(800,800,h).marginTop).toBe(120);
 expect(paneBounds(800,800,{...h,y:700}).marginTop).toBe(0);
 expect(paneBounds(800,800,{...h,y:390}).marginTop).toBe(0);
 expect(paneBounds(800,0,{...h,y:0}).height).toBe(1);
 expect(paneBounds(800,800,{...f,separating:false}).width).toBe(800);
 expect(twoColumns(840,1)).toBe(true);expect(twoColumns(840,2)).toBe(false);expect(twoColumns(320,1)).toBe(false);
});
test('language defaults, active states and sequence ordering',()=>{
 expect(languageFor('en','ru')).toBe('en');expect(languageFor('system','fr_CA')).toBe('fr');expect(languageFor('system','zh-TW')).toBe('zh-Hans');expect(languageFor('garbage','xx')).toBe('en');
 expect(isActive({...emptySession,state:'RUNNING'})).toBe(true);expect(isActive(emptySession)).toBe(false);
 expect(sessionReducer(emptySession,{...emptySession,sequence:1}).sequence).toBe(1);expect(sessionReducer(emptySession,emptySession)).toBe(emptySession);
 expect(workSize(2000,1000)).toEqual({width:1024,height:512});expect(workSize(1,20000)).toEqual({width:1,height:1024});
 expect(storageReserve(4096,4096,4)).toBe(4294967296);expect(storageReserve(1,1,2)).toBe(268435456);
 expect(formatCopy('{done}/{missing}',{done:'1'})).toBe('1/{missing}');expect(ltrValue('2×4')).toContain('\u200E×\u200E');
});
test('starting without a selected image never reaches native computation',async()=>{
 const {beginUpscale}=require('../src/application/beginUpscale');const confirm=jest.fn();expect(await beginUpscale(null,2,'quality',confirm)).toBeNull();expect(confirm).not.toHaveBeenCalled();
});
