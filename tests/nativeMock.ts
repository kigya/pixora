import type {
  Session,
  Settings,
  Capabilities,
  ProfileAvailability,
} from '../src/specs/NativeUpscale';
import { emptySession } from '../src/domain/session';
export let session: Session = { ...emptySession };
export let settings: Settings;
export let capabilities: Capabilities;
export const sessionListeners = new Set<(s: Session) => void>();
export const layoutListeners = new Set<(s: unknown) => void>();
export function emitSession(next: Partial<Session>) {
  session = { ...session, ...next, sequence: session.sequence + 1 };
  sessionListeners.forEach(listener => listener(session));
  return session;
}
export function seed(
  next: Partial<Session> = {},
  preferences: Partial<Settings> = {},
) {
  session = { ...emptySession, sequence: 10, ...next };
  settings = {
    cacheLimitMiB: -1,
    notificationHintCount: 0,
    theme: 'light',
    language: 'en',
    format: 'png',
    notificationAsked: false,
    notificationIntroSeen: true,
    notificationDismissedSession: '',
    systemLanguage: 'en',
    languageChosen: true,
    ...preferences,
  };
  capabilities = {
    modes: ['quality'],
    sdk: 36,
    supported: true,
    modelValid: true,
    ramBytes: 4294967296,
    storageBytes: 1e10,
    workBytes: 2048,
    version: '0.4.0',
  };
}
seed();
const native = {
  getProfileAvailability: jest.fn(async () => ({
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
  })),
  onProfileAvailabilityChanged: jest.fn(
    (_listener?: (value: ProfileAvailability) => void) => ({
      remove: jest.fn(),
    }),
  ),
  getTelemetrySettings: jest.fn(async () => ({
    analytics: true,
    crashes: true,
    noticeSeen: false,
    consentVersion: 0,
  })),
  updateTelemetrySettings: jest.fn(async (analytics, crashes, noticeSeen) => ({
    analytics,
    crashes,
    noticeSeen,
    consentVersion: 2,
  })),
  logTelemetryEvent: jest.fn(),
  finishStartup: jest.fn(),
  getCurrentSession: jest.fn(async () => session),
  getImageRecommendation: jest.fn(
    async (_imageId: string): Promise<import('../src/specs/NativeUpscale').ImageRecommendation | null> => null,
  ),
  getSettings: jest.fn(async () => settings),
  getCapabilities: jest.fn(async () => capabilities),
  onSessionChanged: jest.fn((listener: (s: Session) => void) => {
    sessionListeners.add(listener);
    return { remove: () => sessionListeners.delete(listener) };
  }),
  getWindowLayout: jest.fn(async () => ({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    separating: false,
  })),
  onWindowLayoutChanged: jest.fn((listener: (s: unknown) => void) => {
    layoutListeners.add(listener);
    return { remove: () => layoutListeners.delete(listener) };
  }),
  getNotificationStatus: jest.fn(async () => false),
  pickImage: jest.fn(async () => null),
  startJob: jest.fn(async (_id: string, scale: number) =>
    emitSession({ state: 'RUNNING', scale, jobId: 'job' }),
  ),
  startJobWithMode: jest.fn(
    async (_id: string, scale: number, _confirmed: boolean, mode: string) =>
      emitSession({ state: 'RUNNING', scale, mode, jobId: 'job' }),
  ),
  startJobWithProfile: jest.fn(
    async (
      _id: string,
      scale: number,
      profileId: string,
      speed: string,
      _confirmed: boolean,
    ) =>
      emitSession({
        state: 'RUNNING',
        scale,
        mode: profileId,
        profileId,
        speed,
        jobId: 'job',
      }),
  ),
  cancelJob: jest.fn(async () => emitSession({ state: 'CANCELLED' })),
  exportResult: jest.fn(async () => ({})),
  shareResult: jest.fn(async () => true),
  openExport: jest.fn(async () => true),
  dismissNotificationHint: jest.fn(
    async (id: string) =>
      (settings = { ...settings, notificationDismissedSession: id }),
  ),
  updateSettings: jest.fn(
    async (language: string, format: string, theme: string) =>
      (settings = { ...settings, language, format, theme, languageChosen: true }),
  ),
  requestNotifications: jest.fn(async () => true),
  openNotificationSettings: jest.fn(async () => true),
  discardSession: jest.fn(async () =>
    emitSession({ state: 'EMPTY', image: null }),
  ),
  clearTemporaryFiles: jest.fn(async () => 0),
  setCacheLimit: jest.fn(
    async (cacheLimitMiB: number) =>
      (settings = { ...settings, cacheLimitMiB }),
  ),
  markNotificationIntroSeen: jest.fn(async () => {
    settings = { ...settings, notificationIntroSeen: true };
    return settings;
  }),
  markNotificationHint: jest.fn(
    async () =>
      (settings = {
        ...settings,
        notificationHintCount: settings.notificationHintCount + 1,
      }),
  ),
  claimReviewPrompt: jest.fn(async () => false),
  requestReview: jest.fn(async () => false),
  getFeedbackStatus: jest.fn(async () => false),
  sendFeedback: jest.fn(
    async (_email: string, _message: string, _rating: number, _id: string) =>
      true,
  ),
  getLegalText: jest.fn(async () => 'Local license text'),
};
export default native;
