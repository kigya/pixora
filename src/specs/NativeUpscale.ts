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
  reasonId: 'generic' | 'photo' | 'art' | 'pixel';
};
export type Session = {
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
export interface Spec extends TurboModule {
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
