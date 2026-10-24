import { useEffect, useRef, useCallback, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import Native, { type Session } from '../specs/NativeUpscale';
import { publicProfile } from '../domain/profiles';

export type EventContext = Readonly<Record<string, string | number>>;
export function track(name: string, values: EventContext = {}) {
  Native.logTelemetryEvent(name, JSON.stringify(values));
}
export function jobContext(job: Session): EventContext {
  const pixels = (job.image?.workWidth ?? 0) * (job.image?.workHeight ?? 0);
  return {
    attempt_token: job.jobId,
    profile_id: publicProfile(job.profileId || job.mode),
    speed: job.speed ?? 'quality',
    scale: job.scale,
    backend: job.backend,
    processing_kind:job.processingKind === 'recreate' ? 'recreate' : 'enhance',
    compact_profile:job.processingKind === 'recreate' ? 'compact256_sd512' : 'none',
    size_bucket:
      pixels <= 262144 ? 'small' : pixels <= 786432 ? 'medium' : 'large',
    model_version: job.modelId,
  };
}
/** Counts only foreground time while this native-stack screen is focused. */
export function useTrackedScreen(
  name: string,
  context: EventContext = {},
  navigation?: {
    isFocused?: () => boolean;
    addListener?: (event: 'focus' | 'blur', notify: () => void) => () => void;
  },
) {
  const subscribe = useCallback(
    (notify: () => void) => {
      const focus = navigation?.addListener?.('focus', notify);
      const blur = navigation?.addListener?.('blur', notify);
      return () => {
        focus?.();
        blur?.();
      };
    },
    [navigation],
  );
  const snapshot = useCallback(
    () => navigation?.isFocused?.() ?? true,
    [navigation],
  );
  const focused = useSyncExternalStore(subscribe, snapshot);
  // Screen events carry navigation context, not the full per-generation payload.
  const compact = Object.fromEntries(Object.entries(context).filter(([key]) =>
    ['attempt_token','processing_kind','profile_id','model_version','source','status','rating'].includes(key)));
  const latest = useRef(compact);
  latest.current = compact;
  useEffect(() => {
    if (!focused) return;
    let start = AppState.currentState === 'active' ? Date.now() : null;
    if (start !== null)
      track('screen_view', {
        screen_name: name,
        screen_class: name,
        ...latest.current,
      });
    const finish = () => {
      if (start === null) return;
      track('screen_engagement', {
        screen_name: name,
        engagement_ms: Math.max(0, Date.now() - start),
        ...latest.current,
      });
      start = null;
    };
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active' && start === null) {
        start = Date.now();
        track('screen_view', {
          screen_name: name,
          screen_class: name,
          ...latest.current,
        });
      } else if (state !== 'active') finish();
    });
    return () => {
      finish();
      subscription.remove();
    };
  }, [focused, name]);
}

/** Explicit schema: no URI, filename, EXIF, prompt or comment can enter this context. */
export function ratingContext(job: Session): EventContext {
  const context: Record<string,string|number> = {
    attempt_token:job.jobId, processing_kind:job.processingKind === 'recreate' ? 'recreate' : 'enhance',
    profile_id:publicProfile(job.profileId || job.mode), model_version:job.modelId,
    recommended_profile:job.recommendedProfile || 'none', recommendation_applied:job.recommendationApplied ? 1 : 0,
    speed:job.speed || 'quality', scale:job.scale, backend:job.backend,
    source_width:job.image?.width ?? 0, source_height:job.image?.height ?? 0,
    input_width:job.aiInputWidth ?? job.image?.workWidth ?? 0, input_height:job.aiInputHeight ?? job.image?.workHeight ?? 0,
    output_width:job.resultWidth, output_height:job.resultHeight,
    source_format:job.image?.mime === 'image/png' ? 'png' : job.image?.mime === 'image/jpeg' ? 'jpeg' : job.image?.mime === 'image/webp' ? 'webp' : 'other',
    has_alpha:job.image?.hasAlpha ? 1 : 0, duration_ms:job.elapsedMs,
  };
  if(job.processingKind === 'recreate') Object.assign(context,{
    steps:job.recreateSteps ?? 4, strength:0.6, cfg:1, compact_profile:'compact256_sd512',
    recreate_revision:job.recreateModelRevision ?? '', prompt_present:job.recreatePrompt?.trim() ? 1 : 0,
  });
  return context;
}
