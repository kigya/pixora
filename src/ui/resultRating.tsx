import React, { useEffect, useRef, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import Native, { type Session } from '../specs/NativeUpscale';
import type { NativeStackScreenProps } from 'expo-router/native-stack';
import type { Routes } from '../navigation/routes';
import { useApp } from '../application/AppProvider';
import { track, ratingContext } from '../application/telemetry';
import { useTheme } from './theme';
import { PopDialog } from '../components/kinetik/pop-dialog';
import { StarRating } from '../components/kinetik/star-rating';
import { Button } from './components';

type Navigation = NativeStackScreenProps<Routes, 'Home'>['navigation'];
/** Only a live completion may ask; native persists the five-minute/per-job gate. */
export function ResultRating({job, eligible, navigation}: {job:Session; eligible:boolean; navigation:Navigation}) {
  const {t, accept} = useApp();
  const {colors} = useTheme();
  const [focused, setFocused] = useState(navigation.isFocused?.() ?? true);
  const [foreground,setForeground]=useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  const [ready,setReady]=useState(false);
  const [visible, setVisible] = useState(false);
  const [promptJob,setPromptJob]=useState('');
  const [rating, setRating] = useState(0);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const attempted = useRef(new Set<string>());
  const shown = useRef(false);
  const writing = useRef(false);
  const mounted = useRef(true);
  const activePrompt=useRef({jobId:job.jobId,active:false});
  activePrompt.current={jobId:job.jobId,active:visible && promptJob===job.jobId && eligible && focused && foreground};
  const isCurrent=(jobId:string)=>mounted.current && activePrompt.current.active && activePrompt.current.jobId===jobId;
  useEffect(() => {
    mounted.current=true;
    const listener=AppState.addEventListener('change',state=>{
      const active=state==='active';setForeground(active);
      if(!active){activePrompt.current.active=false;setVisible(false);}
    });
    return () => {mounted.current=false;listener.remove();};
  }, []);
  useEffect(() => {
    const focus=navigation.addListener?.('focus',()=>setFocused(true));
    const blur=navigation.addListener?.('blur',()=>{activePrompt.current.active=false;setFocused(false);setVisible(false);});
    return () => {focus?.();blur?.();};
  }, [navigation]);
  useEffect(() => {
    if (!eligible || !focused || !foreground || !job.jobId || attempted.current.has(job.jobId)) return;
    let current=true;
    const timer=setTimeout(() => {
      Native.claimReviewPrompt(job.jobId).then(allowed => {
        if (!current) return;
        attempted.current.add(job.jobId);
        if (allowed) {setPromptJob(job.jobId);shown.current=false;setReady(false);setRating(0);setFailed(false);setVisible(true);}
      }).catch(()=>{});
    }, 1200);
    return () => {current=false;clearTimeout(timer);};
  }, [eligible,focused,foreground,job.jobId]);
  const close=() => {
    if (writing.current || !isCurrent(job.jobId)) return;
    activePrompt.current.active=false;
    track('review_dismissed', {attempt_token:job.jobId});
    setVisible(false);
  };
  const submit=async () => {
    if (!isCurrent(job.jobId) || !shown.current || !rating || writing.current) return;
    const submittedJob=job.jobId;
    writing.current=true;setSending(true);setFailed(false);
    try {
      const updated=await Native.submitResultRating(submittedJob,rating);
      if(!isCurrent(submittedJob))return;
      accept(updated);
      if (rating < 5) {
        if (mounted.current) setVisible(false);
        navigation.navigate('Feedback',{rating,source:'result_rating',context:ratingContext(updated)});
      } else {
        const opened=await Native.openStoreReview();
        if(!isCurrent(submittedJob))return;
        track('play_redirect_finished',{attempt_token:job.jobId,status:opened?'success':'error'});
        if (mounted.current) {setFailed(!opened);setVisible(!opened);}
      }
    } catch {if(isCurrent(submittedJob))setFailed(true);}
    finally {writing.current=false;if(mounted.current)setSending(false);}
  };
  return <PopDialog
    visible={visible && promptJob===job.jobId && eligible && focused && foreground}
    title={t.rating.title} closeLabel={t.cancel} onClose={close}
    onShow={() => {
      const displayedJob=job.jobId;
      if(!isCurrent(displayedJob))return;
      Native.markReviewPromptShown(displayedJob).then(recorded => {
        if (!isCurrent(displayedJob)) return;
        shown.current=recorded;setReady(recorded);
        if(recorded)track('review_prompt_requested',{attempt_token:job.jobId});
        else setVisible(false);
      }).catch(()=>{if(isCurrent(displayedJob))setVisible(false);});
    }}
    actions={[]}
  >
    <View style={{alignItems:'center',gap:20,paddingVertical:12}}>
      <StarRating testID="result-rating" accessibilityLabel={t.rating.title} value={rating} onValueChange={setRating} clearable={false} disabled={sending} color={colors.accent} />
      {failed && <Text accessibilityRole="alert" style={{color:colors.red}}>{t.error}</Text>}
      <Button testID="submit-rating" title={rating===5?t.rating.store:t.continue} disabled={!rating || sending || !ready} onPress={submit} />
      <Button title={t.cancel} secondary disabled={sending} onPress={close} />
    </View>
  </PopDialog>;
}
