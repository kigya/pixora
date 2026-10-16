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
  const latest = useRef(context);
  latest.current = context;
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
