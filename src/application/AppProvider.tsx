import React, {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useState,
  useCallback,
  useMemo,
} from 'react';
import { AppState, useColorScheme } from 'react-native';
import Native, {
  type Session,
  type Settings,
  type Capabilities,
  type ProfileAvailability,
  type TelemetrySettings,
} from '../specs/NativeUpscale';
import {
  emptySession,
  languageFor,
  sessionReducer,
  isActive,
} from '../domain/session';
import { strings, type Copy, type LocaleCode } from '../ui/i18n';
import { PixoraThemeProvider } from '../ui/theme';
import { LocaleContext } from '../ui/locale';
import { DialogProvider } from '../ui/dialog';
import { InformationProvider } from '../ui/information';

type MessageKey = '' | 'modelInvalid' | 'exportSuccess' | 'cleared';
type AppContextValue = {
  active: boolean;
  availability: ProfileAvailability;
  telemetry: TelemetrySettings;
  setTelemetry: (value: TelemetrySettings) => void;
  settings: Settings;
  caps: Capabilities | null;
  t: Copy;
  lang: LocaleCode;
  loading: boolean;
  startupError: boolean;
  notifications: boolean | null;
  accept: (s: Session) => void;
  refresh: () => Promise<void>;
  setSettings: (s: Settings) => void;
  message: MessageKey;
  setMessage: (s: MessageKey) => void;
};
const SessionContext = createContext<Session>(emptySession);
export const useSession = () => useContext(SessionContext);
const AppContext = createContext<AppContextValue | null>(null);
export const useApp = () => useContext(AppContext)!;
export function AppProvider({ children }: { children: React.ReactNode }) {
  const [session, accept] = useReducer(sessionReducer, emptySession),
    [settings, setSettings] = useState<Settings>({
      onboardingVersion: 1,
      aiDetailNoticeSeen: false,
      cacheLimitMiB: -1,
      notificationHintCount: 0,
      theme: 'system',
      language: 'system',
      format: 'png',
      notificationAsked: false,
      notificationIntroSeen: false,
      notificationDismissedSession: '',
      systemLanguage: 'en',
      languageChosen: false,
    }),
    [caps, setCaps] = useState<Capabilities | null>(null),
    [loading, setLoading] = useState(true),
    [themeReady, setThemeReady] = useState(false),
    [startupError, setStartupError] = useState(false),
    [message, setMessage] = useState<MessageKey>(''),
    [notifications, setNotifications] = useState<boolean | null>(null);
  const [availability, setAvailability] = useState<ProfileAvailability>({
    standard: true,
    lite: true,
    natural: true,
    details: true,
    balanced: true,
    sharp: true,
    art: true,
    pixel: true,
    source: 'default',
    updatedAt: 0,
  });
  const [telemetry, setTelemetry] = useState<TelemetrySettings>({
    analytics: true,
    crashes: true,
    noticeSeen: false,
    consentVersion: 0,
  });
  const systemTheme = useColorScheme();
  const dark =
    settings.theme === 'dark' ||
    (settings.theme !== 'light' && systemTheme === 'dark');
  const lang = languageFor(settings.language, settings.systemLanguage),
    t = strings[lang];
  const refresh = useCallback(async () => {
    const [current, preferences, capabilities, notice, flags, tracking] =
      await Promise.all([
        Native.getCurrentSession(),
        Native.getSettings(),
        Native.getCapabilities(),
        Native.getNotificationStatus().catch(() => false),
        Native.getProfileAvailability(),
        Native.getTelemetrySettings(),
      ]);
    accept(current);
    setSettings(preferences);
    setThemeReady(true);
    setCaps(capabilities);
    setNotifications(notice);
    setAvailability(flags);
    setTelemetry(tracking);
    setStartupError(false);
  }, []);
  useEffect(() => {
    const subscription = Native.onSessionChanged(accept);
    const flagsSubscription =
      Native.onProfileAvailabilityChanged(setAvailability);
    refresh()
      .catch(() => {setStartupError(true); setMessage('modelInvalid');})
      .finally(() => setLoading(false));
    const listener = AppState.addEventListener('change', state => {
      if (state === 'active') {
        refresh().catch(() => {});
      }
    });
    return () => {
      subscription.remove();
      flagsSubscription.remove();
      listener.remove();
    };
  }, [refresh]);
  const active = isActive(session);
  const value = useMemo(
    () => ({
      active,
      availability,
      telemetry,
      setTelemetry,
      settings,
      caps,
      t,
      lang,
      loading,
      startupError,
      notifications,
      accept,
      refresh,
      setSettings,
      message,
      setMessage,
    }),
    [
      active,
      availability,
      telemetry,
      settings,
      caps,
      t,
      lang,
      loading,
      startupError,
      notifications,
      refresh,
      message,
    ],
  );
  return (
    <SessionContext.Provider value={session}>
      <AppContext.Provider value={value}>
        <PixoraThemeProvider dark={dark} resolved={themeReady}>
          <LocaleContext.Provider value={lang}>
            <DialogProvider>
              <InformationProvider>{children}</InformationProvider>
            </DialogProvider>
          </LocaleContext.Provider>
        </PixoraThemeProvider>
      </AppContext.Provider>
    </SessionContext.Provider>
  );
}
