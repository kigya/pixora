export type Routes = {
  Home: undefined;
  Settings: undefined;
  Feedback:
    | { context?: Readonly<Record<string, string | number>> }
    | undefined;
};
