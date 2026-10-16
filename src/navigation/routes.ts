export type Routes = {
  LanguageOnboarding: undefined;
  Home: undefined;
  Settings: undefined;
  Feedback:
    | { context?: Readonly<Record<string, string | number>> }
    | undefined;
};
