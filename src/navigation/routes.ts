export type Routes = {
  Home: undefined;
  Onboarding: { replay: boolean };
  Settings: undefined;
  Language: undefined;
  Feedback: { rating?: number; source?: 'settings' | 'result_rating'; context?: Readonly<Record<string, string | number>> } | undefined;
};
