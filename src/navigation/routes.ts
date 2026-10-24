export type Routes = {
  Home: { selectedProfile?: import('../specs/NativeUpscale').ProfileId; selectionToken?: string } | undefined;
  Models: { processingKind: 'enhance' | 'recreate'; selectedProfile: import('../specs/NativeUpscale').ProfileId };
  Onboarding: { replay: boolean };
  Settings: undefined;
  Language: undefined;
  Feedback: { rating?: number; source?: 'settings' | 'result_rating'; context?: Readonly<Record<string, string | number>> } | undefined;
};
