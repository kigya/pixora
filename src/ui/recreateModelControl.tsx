import React, { useEffect, useRef, useState } from 'react';
import { AppState, Platform, Text, View } from 'react-native';
import Native, { type RecreateModelState } from '../specs/NativeUpscale';
import { useApp } from '../application/AppProvider';
import { errorText } from '../application/errors';
import { formatStorage } from '../domain/storage';
import { useLocale } from './locale';
import { useTheme } from './theme';
import { Button, createStyles } from './components';
import { PopDialog } from '../components/kinetik/pop-dialog';
import { PressJelly } from '../components/kinetik/press-jelly';
import { ProgressBar } from '../components/kinetik/progress-bar';
import { useConfirm } from './dialog';
import { useNotificationIntro } from './notificationIntro';

const absent: RecreateModelState = { state: 'absent', downloadedBytes: 0, totalBytes: 1881812340, installedBytes: 0, error: '' };
/** The same explicit, local download flow is available without leaving any screen. */
export function RecreateModelControl({allowDelete = false, compact = false, onStateChange}: {allowDelete?: boolean; compact?: boolean; onStateChange?: (value: RecreateModelState) => void}) {
  const {t, lang, settings, setSettings, active} = useApp();
  const {colors} = useTheme(); const {rtl} = useLocale(); const s = createStyles(colors, rtl);
  const confirm = useConfirm(); const intro = useNotificationIntro('download');
  const [model, setModel] = useState(absent);
  const [dialog, setDialog] = useState<'terms' | 'legal' | ''>('');
  const [legal, setLegal] = useState(''); const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false); const writing = useRef(false);
  const listener = useRef(onStateChange); listener.current = onStateChange;
  useEffect(() => {
    let mounted = true;
    const update = (value: RecreateModelState) => { if (mounted) {setModel(value); listener.current?.(value);} };
    const refresh = () => Native.getRecreateModelState().then(update).catch(() => {});
    refresh(); const event = Native.onRecreateModelChanged(update);
    const app = AppState.addEventListener('change', state => {if (state === 'active') refresh();});
    return () => {mounted = false; event.remove(); app.remove();};
  }, []);
  const perform = async (action: () => Promise<RecreateModelState>) => {
    if (writing.current) return; writing.current = true; setPending(true); setError(null);
    try {const value = await action(); setModel(value); listener.current?.(value);} catch (failure) {setError(failure);}
    finally {writing.current = false; setPending(false);}
  };
  const download = async () => {
    setDialog('');
    if (Platform.OS === 'android' && !settings.notificationIntroSeen && !(await Native.getNotificationStatus())) {
      const choice = await intro.ask(); if (choice === null) return model;
      setSettings(await Native.markNotificationIntroSeen());
      if (choice) await Native.requestNotifications();
    }
    return Native.downloadRecreateModel();
  };
  if (compact && model.state === 'ready') return null;
  const downloading = model.state === 'downloading' || model.state === 'verifying';
  const retainedPackageBytes = model.downloadedBytes > 0 || model.installedBytes > 0;
  const canDelete = allowDelete && (model.state === 'ready' || ((model.state === 'paused' || model.state === 'failed') && retainedPackageBytes));
  const total = model.totalBytes || absent.totalBytes;
  return <View style={{gap:12}}>
    <Text style={s.caption}>{t.recreate.model}: {model.state === 'ready' ? formatStorage(model.installedBytes,lang) : formatStorage(total,lang)}</Text>
    {downloading ? <>
      <Text style={s.caption}>{formatStorage(model.downloadedBytes,lang)} / {formatStorage(total,lang)}</Text>
      <ProgressBar label={model.state === 'verifying' ? t.recreate.verifying : t.recreate.downloading} value={model.state === 'verifying' ? null : Math.min(1,model.downloadedBytes/total)} />
      <Button title={t.recreate.cancelDownload} secondary disabled={pending} onPress={() => {void perform(() => Native.cancelRecreateDownload());}} />
    </> : model.state === 'ready' ? <>
      <Text style={s.caption}>{t.recreate.ready}</Text>
    </> : <>
      {model.state === 'failed' && <Text accessibilityRole="alert" style={s.errorText}>{model.error ? errorText({code:model.error},lang) : t.recreate.downloadFailed}</Text>}
      <Button testID="download-recreate-model" title={model.state === 'paused' || model.state === 'failed' ? t.recreate.retry : t.recreate.download} disabled={pending || active} onPress={() => setDialog('terms')} />
    </>}
    {canDelete && <Button title={t.recreate.delete} secondary disabled={pending || active} onPress={() => {void perform(async () => await confirm(t.recreate.delete,t.recreate.deleteConfirm,t.delete,t.cancel) ? Native.deleteRecreateModel() : model);}} />}
    <PressJelly variant="surface" accessibilityLabel={t.recreate.licenses} style={{backgroundColor:'transparent',borderWidth:0,boxShadow:'none',paddingHorizontal:0,minWidth:0,borderRadius:0,alignSelf:'flex-start'}} onPress={() => {Native.getLegalText().then(text => {setLegal(text);setDialog('legal');}).catch(setError);}}><Text accessibilityRole="link" style={{color:colors.accent}}>{t.recreate.licenses} ↗</Text></PressJelly>
    {!!error && <Text accessibilityRole="alert" style={s.errorText}>{errorText(error,lang)}</Text>}
    <PopDialog visible={dialog !== ''} title={dialog === 'legal' ? t.licenses : t.recreate.title} closeLabel={t.cancel} onClose={() => setDialog('')} actions={dialog === 'legal' ? [{label:t.back,onPress:() => setDialog('terms')}] : [{label:t.recreate.acceptDownload,tone:'primary',onPress:() => {void perform(download);}},{label:t.cancel,onPress:() => setDialog('')}] }>
      <Text selectable style={s.body}>{dialog === 'legal' ? legal : `${t.recreate.terms}\n\n${t.recreate.downloadSize.replace('{size}',formatStorage(total,lang))}`}</Text>
    </PopDialog>
    {intro.element}
  </View>;
}
