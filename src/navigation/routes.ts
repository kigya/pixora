export type Routes = {
  Home: undefined;
  Settings: undefined;
  Feedback:
    | { rating?: number; context?: Readonly<Record<string, string | number>> }
    | undefined;
};
