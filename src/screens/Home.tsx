import React, { useEffect, useState, useRef } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Text,
  View,
  Pressable,
  AccessibilityInfo,
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
import { ReviewDialog } from '../ui/feedback';
import { needsAspectWarning } from '../domain/presentation';
import { track, jobContext, useTrackedScreen } from '../application/telemetry';
import { beginUpscale } from '../application/beginUpscale';

export function Home({ navigation }: NativeStackScreenProps<Routes, 'Home'>) {
  const v = useSession();
  const { colors } = useTheme();
  const { rtl, number } = useLocale();
  const s = createStyles(colors, rtl);
  const confirm = useConfirm();
  const pane = usePane();
  const previewHeight = Math.max(120, Math.min(320, pane.height * 0.4));
  const [review, setReview] = useState(false);
  const [reviewContext, setReviewContext] = useState<
    ReturnType<typeof jobContext>
  >({});
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
  const [speed, setSpeed] = useState<ProcessingSpeed>('quality');
  const [mode, setMode] = useState<ProfileId>('standard');
  const [scale, setScale] = useState(2),
    [format, setFormat] = useState(settings.format);
  const { operation, error, run } = useOperation(() => setMessage(''));
  useEffect(() => {
    setFormat(settings.format);
  }, [settings.format]);
  useEffect(() => {
    setScale(v.scale);
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
  }, [v.sessionId, v.jobId, v.scale, v.mode, v.profileId, v.speed]);
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
    });
  const start = () =>
    perform('start', async () => {
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
        async image =>
          confirm(
            t.prepareTitle,
            `${t.prepareNote}\n\n${t.original}: ${ltrValue(
              `${number(image.width)} × ${number(image.height)}`,
            )}\n${t.preparationLabel}: ${ltrValue(
              `${number(image.workWidth)} × ${number(image.workHeight)}`,
            )}\n${t.originalSafe}\n${t.output}: ${ltrValue(
              `${number(image.workWidth * scale)} × ${number(
                image.workHeight * scale,
              )}`,
            )}`,
            t.prepare,
            t.cancel,
          ),
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
        setReviewContext(jobContext(v));
        setReview(true);
      }
    });
  const share = () =>
    perform('share', async () => {
      if (await alphaConfirm()) await Native.shareResult(v.jobId, format);
    });
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
          <Pressable
            testID="settings"
            accessibilityRole="button"
            accessibilityLabel={t.settings}
            onPress={() => {
              track('ui_action', { action: 'settings_opened' });
              navigation.navigate('Settings');
            }}
            style={s.iconButton}
          >
            <Icon name="settings" />
          </Pressable>
        </View>
        <TelemetryNotice />
        {notificationIntro.element}
        {!anyProfiles && !busy ? (
          <Text style={s.errorText}>{t.profilesUnavailable}</Text>
        ) : null}
        {working && !busy && v.state !== 'SUCCEEDED' && (
          <Text style={s.caption}>{t.photoHint}</Text>
        )}
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
            <Text style={s.body}>{t.intro}</Text>

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
                <>
                  <ImagePreview
                    uri={working.previewUri}
                    width={working.workWidth}
                    height={working.workHeight}
                    maxHeight={previewHeight}
                    label={t.original}
                  />
                </>
              }
            >
              <View style={s.card}>
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
                {working.needsPreparation && (
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
                    <Text style={s.caption}>{t.originalSafe}</Text>
                  </>
                )}
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
                    <Segments
                      values={[
                        { id: 'quality', label: t.speedQuality },
                        { id: 'fast', label: t.speedFast },
                      ]}
                      value={speed}
                      onChange={id => {
                        setLegacyMode('');
                        setSpeed(id as ProcessingSpeed);
                        track('processing_options_changed', {
                          profile_id: mode,
                          speed: id,
                          scale,
                          action: 'speed',
                        });
                      }}
                    />
                    {speed === 'fast' ? (
                      <Text style={s.caption}>{t.speedNote}</Text>
                    ) : null}
                    {Math.max(working.workWidth, working.workHeight) <= 512 ? (
                      <Text style={s.caption}>{t.sameInput}</Text>
                    ) : null}
                    <View style={s.row}>
                      <Text style={s.caption}>{t.aiInput}</Text>
                      <Text style={s.value}>
                        {ltrValue(
                          `${number(
                            aiSize(
                              working.workWidth,
                              working.workHeight,
                              speed,
                              mode,
                            ).width,
                          )} × ${number(
                            aiSize(
                              working.workWidth,
                              working.workHeight,
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
                <Segments
                  preserveOrder
                  values={[
                    { id: '2', label: '2×' },
                    { id: '4', label: '4×' },
                  ]}
                  value={String(scale)}
                  onChange={id => {
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
                      `${number(working.workWidth * scale)} × ${number(
                        working.workHeight * scale,
                      )}`,
                    )}
                  </Text>
                </View>
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
                disabled={blocked || !!operation || !anyProfiles}
                onPress={start}
              />
              <Button
                title={t.other}
                secondary
                disabled={!!operation}
                onPress={choose}
              />
              {mode !== 'pixel' && <Text style={s.caption}>{t.aiNote}</Text>}
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
                <>
                  <ImagePreview
                    processing={
                      v.state === 'RUNNING' ||
                      v.state === 'PREPARING' ||
                      v.state === 'FINALIZING'
                    }
                    restricted={v.restrictAnimation === true}
                    uri={working.previewUri}
                    width={working.workWidth}
                    height={working.workHeight}
                    maxHeight={previewHeight}
                    label={t.original}
                  />
                </>
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
                <>
                  <Comparison
                    context={jobContext(v)}
                    before={working.previewUri}
                    after={v.resultUri}
                    ratio={working.workWidth / working.workHeight}
                    t={t}
                  />
                </>
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
                    { id: 'jpeg', label: 'JPEG' },
                    { id: 'webp', label: 'WebP' },
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
      <ReviewDialog
        context={reviewContext}
        visible={review}
        onClose={() => setReview(false)}
        onFeedback={rating =>
          navigation.navigate('Feedback', { rating, context: reviewContext })
        }
      />
    </SafeAreaView>
  );
}
