export type Routes = {
  Home: undefined;
  Onboarding: { replay: boolean };
  Settings: undefined;
  Feedback: { context?: Readonly<Record<string, string | number>> } | undefined;
};
