import type { TurboModule, CodegenTypes } from 'react-native';
import { TurboModuleRegistry } from 'react-native';
export type ImageInfo = {
  id: string;
  mime: string;
  size: number;
  width: number;
  height: number;
  workWidth: number;
  workHeight: number;
  hasAlpha: boolean;
  previewUri: string;
  needsPreparation: boolean;
};
export type ExportInfo = {
  id: string;
  mime: string;
  format: string;
  uri: string;
  width: number;
  height: number;
  size: number;
  createdAt: number;
};
export type ProfileId =
  | 'standard'
  | 'lite'
  | 'natural'
  | 'details'
  | 'balanced'
  | 'sharp'
  | 'art'
  | 'pixel';
export type ProcessingSpeed = 'fast' | 'quality';
export type ImageRecommendation = {
  imageId: string;
  profileId: ProfileId;
  speed: ProcessingSpeed;
  reasonId:
    | 'generic'
    | 'photo'
    | 'art'
    | 'pixel'
    | 'smooth'
    | 'mixed'
    | 'unavailable';
};
export type Session = {
  processingKind?: string;
  recreateSeed?: number;
  recreateModelRevision?: string;
  recreatePrompt?: string;
  recreateSteps?: number;
  recommendedProfile?: string;
  recommendationApplied?: boolean;
  recommendationContextSet?: boolean;
  resultRating?: number;
  resolution?: string;
  profileId?: string;
  speed?: string;
  aiInputWidth?: number;
  aiInputHeight?: number;
  estimatedTotalLowMs?: number;
  estimatedTotalHighMs?: number;
  remainingLowMs?: number;
  remainingHighMs?: number;
  restrictAnimation?: boolean;
  mode: string;
  modelId: string;
  timings: {
    prepareMs?: number;
    modelLoadMs?: number;
    gpuCheckMs?: number;
    preprocessingMs?: number;
    inferenceMs?: number;
    assemblyMs?: number;
    resizeMs?: number;
    writeAndPreviewMs?: number;
  };
  schemaVersion: number;
  sequence: number;
  sessionId: string;
  jobId: string;
  phase: string;
  completedTiles: number;
  totalTiles: number;
  state: string;
  scale: number;
  backend: string;
  progress: number;
  startedAt: number;
  elapsedMs: number;
  image: ImageInfo | null;
  resultUri: string;
  resultWidth: number;
  resultHeight: number;
  error: string;
  exportState: string;
  exports: ReadonlyArray<ExportInfo>;
};
export type Settings = {
  aiDetailNoticeSeen: boolean;
  onboardingVersion: number;
  cacheLimitMiB: number;
  notificationHintCount: number;
  theme: string;
  language: string;
  format: string;
  notificationAsked: boolean;
  notificationIntroSeen: boolean;
  notificationDismissedSession: string;
  systemLanguage: string;
  languageChosen: boolean;
};
export type Capabilities = {
  modes: ReadonlyArray<string>;
  sdk: number;
  supported: boolean;
  modelValid: boolean;
  ramBytes: number;
  storageBytes: number;
  workBytes: number;
  version: string;
};
export type LayoutInfo = {
  x: number;
  y: number;
  width: number;
  height: number;
  separating: boolean;
};
export type ProfileAvailability = {
  standard: boolean;
  lite: boolean;
  natural: boolean;
  details: boolean;
  balanced: boolean;
  sharp: boolean;
  art: boolean;
  pixel: boolean;
  source: string;
  updatedAt: number;
};
export type TelemetrySettings = {
  analytics: boolean;
  crashes: boolean;
  noticeSeen: boolean;
  consentVersion: number;
};
export type RecreateModelState = {
  state: string;
  downloadedBytes: number;
  totalBytes: number;
  installedBytes: number;
  error: string;
};
export type StorageUsage = {
  cacheBytes: number;
  sessionBytes: number;
  temporaryBytes: number;
  recreateModelBytes: number;
  otherBytes: number;
  freeBytes: number;
  totalBytes: number;
};
export interface Spec extends TurboModule {
  getRecreateModelState(): Promise<RecreateModelState>;
  downloadRecreateModel(): Promise<RecreateModelState>;
  cancelRecreateDownload(): Promise<RecreateModelState>;
  deleteRecreateModel(): Promise<RecreateModelState>;
  readonly onRecreateModelChanged: CodegenTypes.EventEmitter<RecreateModelState>;
  startRecreateJob(id: string, scale: number, speed: string, prompt: string, preparationConfirmed: boolean): Promise<Session>;
  markAiDetailNoticeSeen(): Promise<Settings>;
  getStorageUsage(): Promise<StorageUsage>;
  clearCache(): Promise<number>;
  setRecommendationContext(
    jobId: string,
    recommendedProfile: string,
    recommendationApplied: boolean,
  ): Promise<Session>;
  finishStartup(): void;
  getProfileAvailability(): Promise<ProfileAvailability>;
  readonly onProfileAvailabilityChanged: CodegenTypes.EventEmitter<ProfileAvailability>;
  getTelemetrySettings(): Promise<TelemetrySettings>;
  updateTelemetrySettings(
    analytics: boolean,
    crashes: boolean,
    noticeSeen: boolean,
  ): Promise<TelemetrySettings>;
  logTelemetryEvent(name: string, parameters: string): void;
  getWindowLayout(): Promise<LayoutInfo>;
  readonly onWindowLayoutChanged: CodegenTypes.EventEmitter<LayoutInfo>;
  getCapabilities(): Promise<Capabilities>;
  pickImage(): Promise<ImageInfo | null>;
  inspectSelection(selectionId: string): Promise<ImageInfo>;
  getImageRecommendation(imageId: string): Promise<ImageRecommendation | null>;
  prepareSelection(selectionId: string): Promise<ImageInfo>;
  startJob(
    inputId: string,
    scale: number,
    preparationConfirmed: boolean,
  ): Promise<Session>;
  startJobWithProfile(
    id: string,
    scale: number,
    profile: string,
    speed: string,
    preparationConfirmed: boolean,
  ): Promise<Session>;
  startJobWithResolution(
    id: string,
    scale: number,
    profile: string,
    speed: string,
    resolution: string,
    preparationConfirmed: boolean,
  ): Promise<Session>;
  startJobWithMode(
    inputId: string,
    scale: number,
    preparationConfirmed: boolean,
    mode: string,
  ): Promise<Session>;
  getCurrentSession(): Promise<Session>;
  cancelJob(jobId: string): Promise<Session>;
  exportResult(jobId: string, format: string): Promise<ExportInfo>;
  shareResult(jobId: string, format: string): Promise<boolean>;
  openExport(exportId: string): Promise<boolean>;
  discardSession(): Promise<Session>;
  clearTemporaryFiles(): Promise<number>;
  getSettings(): Promise<Settings>;
  completeOnboarding(): Promise<Settings>;
  dismissNotificationHint(sessionId: string): Promise<Settings>;
  updateSettings(
    language: string,
    format: string,
    theme: string,
  ): Promise<Settings>;
  requestNotifications(): Promise<boolean>;
  getNotificationStatus(): Promise<boolean>;
  openNotificationSettings(): Promise<boolean>;
  getLegalText(): Promise<string>;
  setCacheLimit(mebibytes: number): Promise<Settings>;
  markNotificationHint(): Promise<Settings>;
  markNotificationIntroSeen(): Promise<Settings>;
  claimReviewPrompt(jobId: string): Promise<boolean>;
  markReviewPromptShown(jobId: string): Promise<boolean>;
  submitResultRating(jobId: string, rating: number): Promise<Session>;
  openStoreReview(): Promise<boolean>;
  requestReview(): Promise<boolean>;
  getFeedbackStatus(): Promise<boolean>;
  sendFeedback(
    email: string,
    message: string,
    rating: number,
    requestId: string,
  ): Promise<boolean>;
  readonly onSessionChanged: CodegenTypes.EventEmitter<Session>;
}
export default TurboModuleRegistry.getEnforcing<Spec>('NativeUpscale');
