import {
  processingDimensions,
  type Resolution,
} from '../domain/resolution';
import React, { useEffect, useState, useRef } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
  AccessibilityInfo,
  TextInput,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { Routes } from '../navigation/routes';
import Native, {
  type ProfileId,
  type ProcessingSpeed,
} from '../specs/NativeUpscale';
import { publicProfile, aiSize, profileIds } from '../domain/profiles';
import { isActive } from '../domain/session';
import { ProcessingCard } from '../ui/processingCard';
import {
  Button,
  Segments,
  Icon,
  UploadArt,
  Comparison,
  createStyles,
} from '../ui/components';
import { Workbench, usePane } from '../ui/layout';
import { useTheme } from '../ui/theme';
import { useConfirm } from '../ui/dialog';
import { useLocale, ltrValue } from '../ui/locale';
import { HelpLink, BackgroundNotice } from '../ui/information';
import { useApp, useSession } from '../application/AppProvider';
import { errorText } from '../application/errors';
import { useOperation } from '../application/useOperation';
import { ImagePreview } from '../ui/imagePreview';
import { ProcessingPicker } from '../ui/processingPicker';
import { useNotificationIntro } from '../ui/notificationIntro';
import { TelemetryNotice } from '../ui/telemetryControls';
import { needsAspectWarning } from '../domain/presentation';
import { track, jobContext, useTrackedScreen } from '../application/telemetry';
import { beginUpscale } from '../application/beginUpscale';
import { RecommendationRequestGate } from '../domain/recommendation';
import { RecommendationCard } from '../ui/recommendationCard';
import { NoticeBar } from '../components/kinetik/notice-bar';
import { GlideRadio } from '../components/kinetik/glide-radio';
import { StepSlider } from '../components/kinetik/step-slider';
import { ScanProgress } from '../components/kinetik/scan-progress';
import { AuroraVeil } from '../components/kinetik/aurora-veil';
import { ApertureCard } from '../components/kinetik/aperture-card';
import { ConfettiBurst } from '../components/kinetik/confetti-burst';
import { CompareSlider } from '../components/kinetik/compare-slider';
import { PressJelly } from '../components/kinetik/press-jelly';

const recreateBefore = require('../../assets/recreate/before.png');
const recreateAfter = require('../../assets/recreate/after.png');

function workingSize(width: number, height: number) {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const factor = Math.min(1, 512 / Math.max(width, height));
  return {
    width: Math.max(1, Math.floor(width * factor)),
    height: Math.max(1, Math.floor(height * factor)),
  };
}

export function Home({ navigation }: NativeStackScreenProps<Routes, 'Home'>) {
  const v = useSession();
  const { colors } = useTheme();
  const { rtl, number } = useLocale();
  const s = createStyles(colors, rtl);
  const confirm = useConfirm();
  const pane = usePane();
  const previewHeight = Math.max(120, Math.min(320, pane.height * 0.4));
  const [profileChanged, setProfileChanged] = useState(false);
  const notificationIntro = useNotificationIntro();
  const {
    availability,
    settings,
    setSettings,
    caps,
    t,
    lang,
    loading,
    notifications,
    accept,
    refresh,
    message,
    setMessage,
  } = useApp();
  const [legacyMode, setLegacyMode] = useState('');
  const [resolution, setResolution] = useState<Resolution>('prepared');
  const [speed, setSpeed] = useState<ProcessingSpeed>('quality');
  const [mode, setMode] = useState<ProfileId>('standard');
  const [processingKind, setProcessingKind] = useState<'enhance' | 'recreate'>('enhance');
  const [recreatePrompt, setRecreatePrompt] = useState('');
  const [recreateSteps, setRecreateSteps] = useState(0);
  const [recreateState, setRecreateState] = useState<{ state: string } | null>(null);
  const [completionAnimationJob, setCompletionAnimationJob] = useState('');
  const [apertureOpenJob, setApertureOpenJob] = useState('');
  const completionEffectsShown = useRef(new Set<string>());
  const pendingCompletionJob = useRef('');
  const previousSession = useRef({ jobId: v.jobId, state: v.state });
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [scale, setScale] = useState(2),
    [format, setFormat] = useState(settings.format);
  const [recommendation, setRecommendation] =
    useState<Awaited<ReturnType<typeof Native.getImageRecommendation>>>(null);
  const recommendationGate = useRef(new RecommendationRequestGate());
  const appliedRecommendationImage = useRef<string | undefined>(undefined);
  const { operation, error, run } = useOperation(() => setMessage(''));
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (typeof Native.getRecreateModelState !== 'function') return;
    Native.getRecreateModelState().then(setRecreateState).catch(() => {});
    const sub = Native.onRecreateModelChanged(setRecreateState);
    return () => sub.remove();
  }, []);
  useEffect(() => {
    setFormat(v.resolution === 'original' ? 'png' : settings.format);
  }, [settings.format, v.resolution]);
  useEffect(() => {
    setScale(v.scale);
    setProcessingKind(v.processingKind === 'recreate' ? 'recreate' : 'enhance');
    setRecreatePrompt(v.recreatePrompt ?? '');
    setRecreateSteps(v.recreateSteps === 8 ? 1 : 0);
    setMode(publicProfile(v.profileId || v.mode));
    setLegacyMode(
      !v.profileId &&
        v.jobId &&
        ['quality', 'fast', 'illustration', 'illustration-fast'].includes(
          v.mode,
        )
        ? v.mode
        : '',
    );
    setSpeed(v.speed === 'fast' ? 'fast' : 'quality');
    setResolution(v.resolution === 'original' ? 'original' : 'prepared');
  }, [
    v.sessionId,
    v.jobId,
    v.scale,
    v.processingKind,
    v.recreatePrompt,
    v.recreateSteps,
    v.mode,
    v.profileId,
    v.speed,
    v.resolution,
  ]);
  const busy = isActive(v);
  useTrackedScreen(`home_${v.state.toLowerCase()}`, jobContext(v), navigation);
  const resultSeen = useRef('');
  useEffect(() => {
    if (v.state === 'SUCCEEDED' && resultSeen.current !== v.jobId) {
      resultSeen.current = v.jobId;
      track('result_viewed', jobContext(v));
    }
  }, [v]);
  const anyProfiles = profileIds.some(id => availability[id]);
  useEffect(() => {
    const gate = recommendationGate.current;
    const imageId = v.image?.id;
    const request = gate.begin();
    setRecommendation(null);
    if (
      busy ||
      v.state === 'SUCCEEDED' ||
      !imageId ||
      appliedRecommendationImage.current === imageId ||
      typeof Native.getImageRecommendation !== 'function'
    )
      return () => gate.invalidate();

    Native.getImageRecommendation(imageId)
      .then(value => {
        if (gate.accepts(request, imageId, value, availability))
          setRecommendation(value);
      })
      .catch(() => {});
    return () => gate.invalidate();
  }, [v.image?.id, v.state, busy, availability]);
  useEffect(() => {
    if (busy || availability[mode]) return;
    const first = profileIds.find(id => availability[id]);
    if (first) {
      setMode(first);
      setLegacyMode('');
      setProfileChanged(true);
    }
  }, [availability, mode, busy]);
  useEffect(() => {
    if (v.state === 'SUCCEEDED')
      AccessibilityInfo.announceForAccessibility(t.done);
  }, [v.state, t.done]);
  useEffect(() => {
    const previous = previousSession.current;
    const completedNow =
      previous.jobId === v.jobId &&
      !!v.jobId &&
      previous.state !== 'SUCCEEDED' &&
      v.state === 'SUCCEEDED';
    previousSession.current = { jobId: v.jobId, state: v.state };
    if (completedNow) pendingCompletionJob.current = v.jobId;
    if (
      foreground &&
      pendingCompletionJob.current === v.jobId &&
      !completionEffectsShown.current.has(v.jobId)
    ) {
      completionEffectsShown.current.add(v.jobId);
      pendingCompletionJob.current = '';
      setCompletionAnimationJob(v.jobId);
    }
  }, [v.jobId, v.state, foreground]);
  useEffect(() => {
    if (!foreground || !completionAnimationJob || apertureOpenJob === completionAnimationJob)
      return;
    const frame = requestAnimationFrame(() => setApertureOpenJob(completionAnimationJob));
    return () => cancelAnimationFrame(frame);
  }, [foreground, completionAnimationJob, apertureOpenJob]);
  const progressBucket = Math.floor(v.progress / 10);
  useEffect(() => {
    if (v.state === 'RUNNING' && progressBucket > 0 && progressBucket < 10) {
      AccessibilityInfo.announceForAccessibility(
        `${t.processing}: ${new Intl.NumberFormat(lang).format(
          progressBucket * 10,
        )}%`,
      );
    }
  }, [progressBucket, v.state, t.processing, lang]);
  const blocked = loading || !caps?.supported || !caps?.modelValid;
  const perform = (name: string, action: () => Promise<void>) =>
    run(action, name);
  const choose = () =>
    perform('pick', async () => {
      if (
        v.state === 'SUCCEEDED' &&
        v.exports.length === 0 &&
        !(await confirm(t.unsavedTitle, t.unsaved, t.replace, t.cancel))
      )
        return;
      await Native.pickImage();
      await refresh();
      setScale(2);
      setResolution('prepared');
    });
  const start = () =>
    perform('start', async () => {
      if (!settings.aiDetailNoticeSeen) {
        setSettings(await Native.markAiDetailNoticeSeen());
      }
      if (processingKind === 'recreate') {
        if (recreateState?.state !== 'ready') {
          navigation.navigate('Settings');
          return;
        }
        const started = await Native.startRecreateJob(
          v.image?.id ?? '',
          scale,
          recreateSteps === 0 ? 'fast' : 'quality',
          recreatePrompt.trim(),
          true,
        );
        accept(started);
        return;
      }
      if (
        v.image &&
        needsAspectWarning(v.image.width, v.image.height) &&
        !(await confirm(t.aspectTitle, t.aspectBody, t.prepare, t.cancel))
      )
        return;
      const started = await beginUpscale(
        v.image,
        scale,
        legacyMode || mode,
        async image => {
          const selectedMode = legacyMode || mode;
          const selectedSpeed =
            selectedMode === 'fast' || selectedMode.endsWith('-fast')
              ? 'fast'
              : selectedMode === 'pixel'
              ? 'quality'
              : speed;
          return confirm(
            t.prepareTitle,
            `${t.original}: ${ltrValue(
              `${number(image.width)} × ${number(image.height)}`,
            )}\n${t.output}: ${ltrValue(
              `${number(image.workWidth * scale)} × ${number(
                image.workHeight * scale,
              )}`,
            )}`,
            t.prepare,
            t.cancel,
          );
        },
        legacyMode ? undefined : mode === 'pixel' ? 'quality' : speed,
        async () => {
          const enabled = await Native.getNotificationStatus();
          if (enabled || settings.notificationIntroSeen) return true;
          const choice = await notificationIntro.ask();
          if (choice === null) return false;
          setSettings(await Native.markNotificationIntroSeen());
          if (choice) await Native.requestNotifications();
          await refresh();
          return true;
        },
        'prepared',
      );
      if (started) accept(started);
    });
  const alphaConfirm = async () =>
    format !== 'jpeg' ||
    !v.image?.hasAlpha ||
    (await confirm(t.alphaTitle, t.alpha, t.confirmJpeg, t.cancel));
  const save = () =>
    perform('save', async () => {
      if (!(await alphaConfirm())) return;
      await Native.exportResult(v.jobId, format);
      await refresh();
      setMessage('exportSuccess');
      if (await Native.claimReviewPrompt(v.jobId)) {
        if (await Native.requestReview())
          track('review_prompt_requested', jobContext(v));
      }
    });
  const share = () =>
    perform('share', async () => {
      if (await alphaConfirm()) await Native.shareResult(v.jobId, format);
    });
  const dimensions = v.image
    ? processingDimensions(v.image, resolution)
    : { width: 0, height: 0 };
  const generationSize = workingSize(v.image?.workWidth ?? 0, v.image?.workHeight ?? 0);
  const outputDimensions = processingKind === 'recreate' ? generationSize : dimensions;
  const saved = v.exports.find(e => e.format === format),
    working = v.image;
  const elapsed = v.elapsedMs;
  const time = `${number(Math.floor(elapsed / 60000))}:${new Intl.NumberFormat(
    lang,
    { minimumIntegerDigits: 2, useGrouping: false },
  ).format(Math.floor(elapsed / 1000) % 60)}`;
  return (
    <SafeAreaView style={s.screen} edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView
        style={{
          maxHeight: pane.height,
          width: pane.width,
          alignSelf: 'flex-start',
          marginLeft: pane.marginLeft,
          marginTop: pane.marginTop,
        }}
        contentContainerStyle={[
          s.content,
          { maxWidth: 1120, width: pane.width },
        ]}
      >
        <View style={s.header}>
          <Text style={s.brand}>{t.title}</Text>
          <PressJelly
            testID="settings"
            accessibilityLabel={t.settings}
            variant="surface"
            onPress={() => {
              track('ui_action', { action: 'settings_opened' });
              navigation.navigate('Settings');
            }}
            style={s.iconButton}
          >
            <Icon name="settings" />
          </PressJelly>
        </View>
        <TelemetryNotice />
        {!loading && !settings.aiDetailNoticeSeen && (
          <NoticeBar
                dismissLabel={t.understood}
            tone="neutral"
            messages={[{ text: t.notice.aiDetailsMayChange }]}
            onDismiss={() => {
              Native.markAiDetailNoticeSeen().then(setSettings).catch(() => {});
            }}
          />
        )}
        {notificationIntro.element}
        {!anyProfiles && !busy ? (
          <Text style={s.errorText}>{t.profilesUnavailable}</Text>
        ) : null}
        {loading ? (
          <View style={s.card}>
            <ActivityIndicator color={colors.accent} />
            <Text style={s.body}>{t.loading}</Text>
          </View>
        ) : blocked ? (
          <View style={s.error}>
            <Text style={s.heading}>
              {caps?.supported ? t.error : t.unavailable}
            </Text>
            <Text style={s.errorText}>
              {caps?.supported ? t.modelInvalid : t.unavailableBody}
            </Text>
          </View>
        ) : null}
        {!!error && (
          <View accessibilityLiveRegion="polite" style={s.error}>
            <Text style={s.errorText}>{errorText(error, lang)}</Text>
          </View>
        )}
        {!working && !busy && (
          <>
            <UploadArt />
            <Text style={s.title}>{t.hero}</Text>

            <Button
              testID="choose-image"
              title={t.choose}
              icon="image"
              disabled={blocked || !!operation}
              onPress={choose}
            />
            <Text style={[s.caption, { textAlign: 'center' }]}>
              {t.supported}
            </Text>
            <View style={[s.row, { justifyContent: 'center', gap: 8 }]}>
              {[t.free, t.offline, t.private].map(text => (
                <View
                  key={text}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 12,
                    backgroundColor: colors.surface,
                  }}
                >
                  <Text style={s.caption}>{text}</Text>
                </View>
              ))}
            </View>
            <HelpLink />
          </>
        )}
        {working && !busy && v.state !== 'SUCCEEDED' && (
          <>
            <Text style={s.heading}>{t.upscale}</Text>
            <Workbench
              preview={
                processingKind === 'recreate' ? (
                  <CompareSlider
                    testID="recreate-preview"
                    accessibilityLabel={t.comparisonHelp}
                    beforeLabel={t.before}
                    afterLabel={t.after}
                    aspectRatio={512 / 340}
                    before={<Image source={recreateBefore} resizeMode="cover" style={StyleSheet.absoluteFill} />}
                    after={<Image source={recreateAfter} resizeMode="cover" style={StyleSheet.absoluteFill} />}
                  />
                ) : (
                  <ImagePreview
                    uri={working.previewUri}
                    width={working.workWidth}
                    height={working.workHeight}
                    maxHeight={previewHeight}
                    label={t.original}
                  />
                )
              }
            >
              <View style={s.card}>
                <Text style={s.label}>{t.recreate.title}</Text>
                <GlideRadio
                  accessibilityLabel={t.recreate.title}
                  value={processingKind}
                  options={[
                    { value: 'enhance', label: t.recreate.enhance },
                    { value: 'recreate', label: t.recreate.title },
                  ]}
                  onValueChange={value => setProcessingKind(value as 'enhance' | 'recreate')}
                />
                {profileChanged && anyProfiles ? (
                  <Text style={s.caption}>{t.profileChanged}</Text>
                ) : null}
                <View style={s.row}>
                  <Text style={s.caption}>{t.original}</Text>
                  <Text style={s.value}>
                    {ltrValue(
                      `${number(working.width)} × ${number(working.height)}`,
                    )}
                  </Text>
                </View>
                {working.needsPreparation && resolution === 'prepared' && (
                  <>
                    <View style={s.row}>
                      <Text style={s.caption}>{t.preparationLabel}</Text>
                      <Text style={s.value}>
                        {ltrValue(
                          `${number(working.workWidth)} × ${number(
                            working.workHeight,
                          )}`,
                        )}
                      </Text>
                    </View>
                    <View style={s.row}>
                      <Text style={s.caption}>{t.output}</Text>
                      <Text style={s.value}>
                        {ltrValue(
                          `${number(outputDimensions.width * scale)} × ${number(
                            outputDimensions.height * scale,
                          )}`,
                        )}
                      </Text>
                    </View>
                  </>
                )}
                {recommendation && processingKind === 'enhance' && (
                  <RecommendationCard
                    value={recommendation}
                    copy={t}
                    onApply={value => {
                      setLegacyMode('');
                      setMode(value.profileId);
                      setSpeed(value.speed);
                      if (resolution === 'original') setSpeed('quality');
                      appliedRecommendationImage.current = v.image?.id;
                      setRecommendation(null);
                    }}
                  />
                )}
                {processingKind === 'enhance' ? <>
                <Text style={s.label}>{t.profileTitle}</Text>
                <ProcessingPicker
                  value={mode}
                  onChange={id => {
                    setLegacyMode('');
                    setProfileChanged(false);
                    setMode(id);
                  }}
                />
                {mode !== 'pixel' ? (
                  <>
                    <Text style={s.label}>{t.speedTitle}</Text>
                    <StepSlider
                      label={t.speedTitle}
                      value={speed === 'fast' ? 0 : 1}
                      steps={2}
                      labels={[t.speedFast, t.speedQuality]}
                      onValueChange={index => {
                        const next = index === 0 ? 'fast' : 'quality';
                        setLegacyMode('');
                        setSpeed(next);
                        track('processing_options_changed', {
                          profile_id: mode,
                          speed: next,
                          scale,
                          action: 'speed',
                        });
                      }}
                    />
                    {Math.max(dimensions.width, dimensions.height) <= 512 ? (
                      <Text style={s.caption}>{t.sameInput}</Text>
                    ) : null}
                    <View style={s.row}>
                      <Text style={s.caption}>{t.aiInput}</Text>
                      <Text style={s.value}>
                        {ltrValue(
                          `${number(
                            aiSize(
                              dimensions.width,
                              dimensions.height,
                              speed,
                              mode,
                            ).width,
                          )} × ${number(
                            aiSize(
                              dimensions.width,
                              dimensions.height,
                              speed,
                              mode,
                            ).height,
                          )}`,
                        )}
                      </Text>
                    </View>
                  </>
                ) : null}
                <Text style={s.label}>{t.scale}</Text>
                <GlideRadio
                  accessibilityLabel={t.scale}
                  options={[{ value: '2', label: '2×' }, { value: '4', label: '4×' }]}
                  value={String(scale)}
                  onValueChange={id => {
                    setScale(Number(id));
                    track('processing_options_changed', {
                      profile_id: mode,
                      speed,
                      scale: Number(id),
                      action: 'scale',
                    });
                  }}
                />
                <View style={s.row}>
                  <Text style={s.caption}>{t.output}</Text>
                  <Text style={s.value}>
                    {ltrValue(
                      `${number(outputDimensions.width * scale)} × ${number(
                        outputDimensions.height * scale,
                      )}`,
                    )}
                  </Text>
                </View>
                </> : <View style={{ gap: 12 }}>
                  <View style={s.row}>
                    <Text style={s.caption}>{t.aiInput}</Text>
                    <Text style={s.value}>
                      {ltrValue(`${number(generationSize.width)} × ${number(generationSize.height)}`)}
                    </Text>
                  </View>
                  <View style={s.row}>
                    <Text style={s.caption}>{t.output}</Text>
                    <Text style={s.value}>
                      {ltrValue(`${number(outputDimensions.width * scale)} × ${number(outputDimensions.height * scale)}`)}
                    </Text>
                  </View>
                  <TextInput
                    value={recreatePrompt}
                    onChangeText={setRecreatePrompt}
                    placeholder={t.recreate.prompt}
                    placeholderTextColor={colors.muted}
                    maxLength={160}
                    returnKeyType="done"
                    style={{ color: colors.text, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, minHeight: 48 }}
                  />
                  <StepSlider
                    label={t.recreate.steps}
                    value={recreateSteps}
                    steps={2}
                    labels={['4', '8']}
                    onValueChange={setRecreateSteps}
                  />
                  {recreateState?.state !== 'ready' && <Button
                    title={t.recreate.download}
                    secondary
                    onPress={() => navigation.navigate('Settings')}
                  />}
                </View>}
              </View>
              {v.state === 'INTERRUPTED' && (
                <Text style={s.body}>{t.interrupted}</Text>
              )}
              {v.state === 'CANCELLED' && (
                <Text style={s.body}>{t.cancelled}</Text>
              )}
              {v.error &&
                v.error !== 'GPU_FAILED' &&
                v.error !== 'INTERRUPTED' && (
                  <View style={s.error}>
                    <Text style={s.errorText}>
                      {errorText({ code: v.error }, lang)}
                    </Text>
                  </View>
                )}
              <Button
                testID="start-job"
                title={v.state === 'READY' ? t.upscale : t.retry}
                icon="spark"
                disabled={
                  blocked ||
                  !!operation ||
                  (processingKind === 'enhance' && !anyProfiles) ||
                  (processingKind === 'recreate' && recreateState?.state !== 'ready')
                }
                onPress={start}
              />
              <Button
                title={t.other}
                secondary
                disabled={!!operation}
                onPress={choose}
              />
              <HelpLink />
            </Workbench>
          </>
        )}
        {busy && working && (
          <>
            <Text style={s.heading}>
              {v.state === 'PREPARING'
                ? t.preparing
                : v.state === 'FINALIZING'
                ? t.finalizing
                : v.state === 'CANCELLING'
                ? t.cancelling
                : t.processing}
            </Text>
            <Workbench
              preview={
                <AuroraVeil
                  intensity={1}
                  speed={3}
                  active={foreground && v.restrictAnimation !== true}
                  style={{ width: '100%', alignItems: 'center', padding: 8, borderRadius: 24 }}
                >
                  <ScanProgress
                    source={{ uri: working.previewUri }}
                    height={previewHeight}
                    active={foreground}
                    progress={v.progress >= 0 ? v.progress / 100 : null}
                    label={v.state === 'PREPARING' ? t.preparing : v.state === 'FINALIZING' ? t.finalizing : t.processing}
                    imageLabel={t.original}
                  />
                </AuroraVeil>
              }
            >
              <ProcessingCard session={v} />
              <BackgroundNotice enabled={notifications === true} />
              <Button
                title={v.state === 'CANCELLING' ? t.cancelling : t.cancelJob}
                secondary
                disabled={v.state === 'CANCELLING' || !!operation}
                onPress={() =>
                  perform('cancel', async () =>
                    accept(await Native.cancelJob(v.jobId)),
                  )
                }
              />
            </Workbench>
          </>
        )}
        {v.state === 'SUCCEEDED' && working && (
          <>
            <View style={s.row}>
              <Text style={s.heading}>{t.done}</Text>
              <Icon name="check" color={colors.green} />
            </View>
            <Workbench
              preview={
                <ConfettiBurst
                  active={foreground}
                  trigger={completionAnimationJob === v.jobId ? v.jobId : undefined}
                  haptics={false}
                >
                  {completionAnimationJob === v.jobId ? (
                    <ApertureCard
                      open={apertureOpenJob === v.jobId}
                      toggleOnPress={false}
                      accessibilityLabel={t.done}
                    >
                      <Comparison
                        context={jobContext(v)}
                        before={working.previewUri}
                        after={v.resultUri}
                        ratio={working.workWidth / working.workHeight}
                        t={t}
                      />
                    </ApertureCard>
                  ) : (
                    <Comparison
                      context={jobContext(v)}
                      before={working.previewUri}
                      after={v.resultUri}
                      ratio={working.workWidth / working.workHeight}
                      t={t}
                    />
                  )}
                </ConfettiBurst>
              }
            >
              <View style={s.card}>
                <View style={s.row}>
                  <Text style={s.caption}>{t.output}</Text>
                  <Text style={s.value}>
                    {ltrValue(
                      `${number(v.resultWidth)} × ${number(v.resultHeight)}`,
                    )}
                  </Text>
                </View>
                <View style={s.row}>
                  <Text style={s.caption}>{t.elapsed}</Text>
                  <Text style={s.value}>
                    {ltrValue(`${time} · ${number(v.scale)}×`)}
                  </Text>
                </View>
                <Text style={s.label}>{t.format}</Text>
                <Segments
                  preserveOrder
                  values={[
                    { id: 'png', label: 'PNG' },
                    ...(v.resolution === 'original'
                      ? []
                      : [
                          { id: 'jpeg', label: 'JPEG' },
                          { id: 'webp', label: 'WebP' },
                        ]),
                  ]}
                  value={format}
                  onChange={setFormat}
                />
                <Text style={s.caption}>
                  {format === 'png'
                    ? t.pngNote
                    : format === 'webp'
                    ? t.webpNote
                    : t.jpegNote}
                  {format === 'jpeg' && working.hasAlpha ? `\n${t.alpha}` : ''}
                </Text>
              </View>
              <Button
                testID="save-result"
                title={saved ? t.saved : t.save}
                icon={saved ? 'check' : 'save'}
                disabled={!!operation || !!saved}
                onPress={save}
              />
              {saved && (
                <Button
                  title={t.open}
                  secondary
                  onPress={() =>
                    perform('open', async () => {
                      await Native.openExport(saved.id);
                      track('ui_action', {
                        ...jobContext(v),
                        action: 'export_opened',
                      });
                    })
                  }
                  disabled={!!operation}
                />
              )}
              <Button
                title={t.share}
                icon="share"
                secondary
                disabled={!!operation}
                onPress={share}
              />
              <Button
                title={t.newImage}
                secondary
                disabled={!!operation}
                onPress={choose}
              />
            </Workbench>
          </>
        )}
        {!!operation && <ActivityIndicator color={colors.accent} />}
        {!!message && (
          <Text accessibilityLiveRegion="polite" style={s.success}>
            {t[message]}
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
