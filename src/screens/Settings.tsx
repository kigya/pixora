import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Text,
  View,
  Platform,
  Linking,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { Routes } from '../navigation/routes';
import Native, { type RecreateModelState, type StorageUsage } from '../specs/NativeUpscale';
import { Button, Segments, Icon, createStyles } from '../ui/components';
import { useTheme } from '../ui/theme';
import { useConfirm } from '../ui/dialog';
import { useLocale } from '../ui/locale';
import { HelpLink } from '../ui/information';
import { useApp } from '../application/AppProvider';
import { errorText } from '../application/errors';
import { TelemetryControls } from '../ui/telemetryControls';
import { cacheLimits } from '../domain/presentation';
import { ElasticSlider } from '../components/kinetik/elastic-slider';
import { UsageMeter } from '../components/kinetik/usage-meter';
import { ProgressBar } from '../components/kinetik/progress-bar';
import { PopDialog } from '../components/kinetik/pop-dialog';
import { useOperation } from '../application/useOperation';
import { PRIVACY_POLICY_URL } from '../application/privacy';
import { languages } from '../ui/locale';
import { ThemeSwitch } from '../components/kinetik/theme-switch';
import { PulseToggle } from '../components/kinetik/pulse-toggle';
import { PressJelly } from '../components/kinetik/press-jelly';
import { Profile } from '../components/kinetik/screens/profile';

import { track, useTrackedScreen } from '../application/telemetry';

export function SettingsScreen({
  navigation,
}: NativeStackScreenProps<Routes, 'Settings'>) {
  useTrackedScreen('settings', {}, navigation);
  const {
    active,
    notifications,
    settings,
    caps,
    t,
    lang,
    setSettings,
    accept,
    refresh,
    setMessage,
  } = useApp();
  const { colors, dark } = useTheme();
  const { rtl, number } = useLocale();
  const s = createStyles(colors, rtl);
  const confirm = useConfirm();
  const [info, setInfo] = useState(''),
    [legal, setLegal] = useState('');
  const [privacyLinkError, setPrivacyLinkError] = useState(false);
  const [modelTermsVisible, setModelTermsVisible] = useState(false);
  const [modelState, setModelState] = useState<RecreateModelState>({
    state: 'absent', downloadedBytes: 0, totalBytes: 0, installedBytes: 0, error: '',
  });
  const [storage, setStorage] = useState<StorageUsage>({
    cacheBytes: 0, sessionBytes: 0, temporaryBytes: 0, recreateModelBytes: 0, freeBytes: 0,
  });
  const { operation, error, setError, run } = useOperation();
  const busy = !!operation;
  const usedCacheMiB = (storage.cacheBytes + storage.temporaryBytes) / 1048576;
  const cacheCapacityMiB = settings.cacheLimitMiB > 0
    ? settings.cacheLimitMiB
    : Math.max(usedCacheMiB, 1);
  const formatMiB = (value: number) => number(value);
  const modelBytes = modelState.totalBytes || 1.88 * 1024 * 1024 * 1024;
  const modelMiB = modelBytes / 1048576;
  const effectiveTheme: 'dark' | 'light' = dark ? 'dark' : 'light';
  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);
  useEffect(() => {
    let mounted = true;
    const update = () => {
      Promise.all([Native.getRecreateModelState(), Native.getStorageUsage()])
        .then(([model, usage]) => {
          if (!mounted) return;
          setModelState(model);
          setStorage(usage);
        })
        .catch(() => {});
    };
    const subscription = Native.onRecreateModelChanged(model => {
      setModelState(model);
      if (model.state === 'ready')
        Native.getStorageUsage().then(setStorage).catch(() => {});
    });
    update();
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);
  return (
    <Profile
      contentStyle={s.content}
      header={
        <View style={s.header}>
          <PressJelly
            accessibilityLabel={t.back}
            variant="surface"
            onPress={() => {
              if (info) setInfo('');
              else navigation.goBack();
            }}
            style={s.iconButton}
          >
            <Icon name="back" />
          </PressJelly>
          <Text style={[s.heading, { flex: 1, textAlign: 'center' }]}>
            {info === 'legal'
              ? t.licenses
              : info === 'privacy'
              ? t.privacy
              : t.settings}
          </Text>
          <View style={{ width: 48 }} />
        </View>
      }
      overlay={
        <PopDialog
          closeLabel={t.back}
          visible={modelTermsVisible}
          onClose={() => setModelTermsVisible(false)}
          title={t.recreate.title}
          message={t.recreate.terms}
          actions={[
            { label: t.recreate.licenses, onPress: () => run(async () => {
              setModelTermsVisible(false);
              setLegal(await Native.getLegalText());
              setInfo('legal');
            }) },
            { label: t.cancel, onPress: () => setModelTermsVisible(false) },
            { label: t.recreate.acceptDownload, tone: 'primary', onPress: () => {
              setModelTermsVisible(false);
              run(async () => setModelState(await Native.downloadRecreateModel()));
            } },
          ]}
        />
      }
    >
        {info ? (
          <>
            <Text selectable style={s.body}>
              {info === 'legal'
                ? legal
                : `${t.privacyBody}\n\n${t.feedbackPrivacy}\n\n${t.cacheLimitNote}`}
            </Text>
            {info === 'privacy' && (
              <>
                <Button
                  title={t.privacyPolicyLink}
                  secondary
                  onPress={async () => {
                    setPrivacyLinkError(false);
                    try {
                      await Linking.openURL(PRIVACY_POLICY_URL);
                    } catch {
                      setPrivacyLinkError(true);
                    }
                  }}
                />
                {privacyLinkError && (
                  <Text style={s.errorText} accessibilityLiveRegion="polite">
                    {t.privacyPolicyOpenFailed}
                  </Text>
                )}
              </>
            )}
          </>
        ) : (
          <>
            <Text style={s.label}>{t.interface}</Text>
            <View style={s.card}>
              <Button
                title={languages.find(x => x.id === settings.language)?.name ?? t.system}
                secondary
                icon="globe"
                onPress={() => navigation.navigate('Language')}
              />
            </View>
            <View style={s.card}>
              <Text style={s.body}>{t.theme}</Text>
              <View style={[s.row, { justifyContent: 'space-between' }]}>
                <ThemeSwitch
                  value={effectiveTheme}
                  label={effectiveTheme === 'dark' ? t.dark : t.light}
                  onValueChange={theme =>
                    run(async () =>
                      setSettings(await Native.updateSettings(settings.language, settings.format, theme)),
                    )
                  }
                />
                <PulseToggle
                  value={settings.theme === 'system'}
                  label={t.system}
                  onValueChange={enabled =>
                    run(async () =>
                      setSettings(await Native.updateSettings(settings.language, settings.format, enabled ? 'system' : 'light')),
                    )
                  }
                />
              </View>
            </View>
            <Text style={s.label}>{t.notifications}</Text>
            <View style={s.card}>
              <View style={s.row}>
                <Icon
                  name="phone"
                  color={notifications ? colors.accent : colors.muted}
                />
                <Text style={[s.value, { flex: 1 }]}>
                  {notifications === null
                    ? t.loading
                    : notifications
                    ? t.notificationsOn
                    : t.notificationsOff}
                </Text>
              </View>
              <Text style={s.body}>
                {Platform.OS === 'ios'
                  ? t.notificationIosBody
                  : t.notificationBody}
              </Text>
              <Button
                title={t.notificationSettings}
                secondary
                onPress={() =>
                  run(async () => {
                    await Native.openNotificationSettings();
                  })
                }
              />
            </View>
            <Text style={s.label}>{t.format}</Text>
            <View style={s.card}>
              <Segments
                values={[
                  { id: 'png', label: 'PNG' },
                  { id: 'jpeg', label: 'JPEG' },
                  { id: 'webp', label: 'WebP' },
                ]}
                value={settings.format}
                onChange={id =>
                  run(async () =>
                    setSettings(
                      await Native.updateSettings(
                        settings.language,
                        id,
                        settings.theme,
                      ),
                    ),
                  )
                }
              />
              <Text style={s.caption}>
                {settings.format === 'png'
                  ? t.pngNote
                  : settings.format === 'webp'
                  ? t.webpNote
                  : t.jpegNote}
              </Text>
            </View>
            <TelemetryControls />
            <View style={s.row}>
              <Text style={s.label}>{t.files}</Text>
              <PressJelly
                accessibilityLabel={t.cacheHelpTitle}
                variant="surface"
                style={s.iconButton}
                onPress={() =>
                  confirm(
                    t.cacheHelpTitle,
                    t.cacheHelpBody,
                    t.understood,
                    t.cancel,
                  )
                }
              >
                <Text style={{ color: colors.accent, fontSize: 22 }}>ⓘ</Text>
              </PressJelly>
            </View>
            <View style={s.card}>
              <UsageMeter
                title={t.recreate.storage}
                unit="MiB"
                total={cacheCapacityMiB}
                segments={[
                  { label: t.files, value: storage.cacheBytes / 1048576 },
                  { label: t.clear, value: storage.temporaryBytes / 1048576 },
                ]}
                formatValue={formatMiB}
              />
              <Text style={s.label}>{t.cacheLimit}</Text>
              <ElasticSlider
                label={t.cacheLimit}
                value={Math.max(0, cacheLimits.findIndex(value => value === settings.cacheLimitMiB))}
                min={0}
                max={cacheLimits.length - 1}
                step={1}
                formatValue={index => {
                  const value = cacheLimits[Math.round(index)] ?? settings.cacheLimitMiB;
                  return value === 0 ? t.cacheNo : value === -1 ? t.cacheUnlimited : `${number(value)} MiB`;
                }}
                onSlidingComplete={index =>
                  run(async () => setSettings(await Native.setCacheLimit(cacheLimits[Math.round(index)] ?? settings.cacheLimitMiB)))
                }
              />
              <Text style={s.caption}>{t.cacheLimitNote}</Text>
              <Button
                title={t.discard}
                secondary
                onPress={() =>
                  run(async () => {
                    if (active) {
                      setError({ localKey: 'busyClear' });
                      return;
                    }
                    if (
                      await confirm(
                        t.deleteTitle,
                        t.deleteBody,
                        t.delete,
                        t.cancel,
                      )
                    ) {
                      accept(await Native.discardSession());
                      track('ui_action', { action: 'session_deleted' });
                      await refresh();
                    }
                  })
                }
              />
              <Button
                title={t.recreate.clearCache}
                secondary
                disabled={active}
                onPress={() =>
                  run(async () => {
                    await Native.clearCache();
                    track('ui_action', { action: 'cache_cleared' });
                    const usage = await Native.getStorageUsage();
                    setStorage(usage);
                    await refresh();
                    setMessage('cleared');
                  })
                }
              />
            </View>
            <View style={s.card}>
              <Text style={s.label}>{t.recreate.title}</Text>
              <Text style={s.caption}>{t.recreate.model}: {number(modelState.installedBytes / 1048576)} MiB</Text>
              {modelState.state === 'downloading' || modelState.state === 'verifying' ? (
                <>
                  <ProgressBar
                    label={modelState.state === 'verifying' ? t.recreate.verifying : t.recreate.downloading}
                    value={modelState.state === 'verifying' || modelState.totalBytes <= 0
                      ? null
                      : Math.min(1, modelState.downloadedBytes / modelState.totalBytes)}
                  />
                  <Button
                    title={t.recreate.cancelDownload}
                    secondary
                    disabled={busy}
                    onPress={() => run(async () => setModelState(await Native.cancelRecreateDownload()))}
                  />
                </>
              ) : modelState.state === 'ready' ? (
                <Button
                  title={t.recreate.delete}
                  secondary
                  disabled={busy}
                  onPress={() => run(async () => {
                    if (await confirm(t.recreate.delete, t.recreate.deleteConfirm, t.delete, t.cancel)) {
                      setModelState(await Native.deleteRecreateModel());
                      setStorage(await Native.getStorageUsage());
                    }
                  })}
                />
              ) : (
                <>
                  <Text style={s.caption}>{t.recreate.downloadSize.replace('{size}', `${number(modelMiB)} MiB`)}</Text>
                  {modelState.state === 'failed' && <Text style={s.errorText}>{t.recreate.downloadFailed}</Text>}
                  <Button
                    title={modelState.state === 'paused' || modelState.state === 'failed' ? t.recreate.retry : t.recreate.download}
                    disabled={busy}
                    onPress={() => setModelTermsVisible(true)}
                  />
                </>
              )}
              {modelState.state === 'ready' && <Text style={s.caption}>{t.recreate.ready}</Text>}
            </View>
            <View style={s.card}>
              <Button
                title={t.issues}
                secondary
                onPress={() => navigation.navigate('Feedback')}
              />
            </View>
            <Text style={s.label}>{t.about}</Text>
            <View style={s.card}>
              <Text style={s.caption}>
                {t.title} · {caps?.version ?? '0.1.0'}
              </Text>
              <HelpLink />
              <Button
                title={t.onboarding.replay}
                secondary
                onPress={() =>
                  navigation.navigate('Onboarding', { replay: true })
                }
              />
              <Button
                title={t.privacy}
                secondary
                onPress={() => {
                  track('ui_action', { action: 'privacy_opened' });
                  setPrivacyLinkError(false);
                  setInfo('privacy');
                }}
              />
              <Button
                title={t.licenses}
                secondary
                onPress={() =>
                  run(async () => {
                    setLegal(await Native.getLegalText());
                    track('ui_action', { action: 'licenses_opened' });
                    setInfo('legal');
                  })
                }
              />
            </View>
          </>
        )}
        {busy && <ActivityIndicator color={colors.accent} />}
        {!!error && <Text style={s.errorText}>{errorText(error, lang)}</Text>}
    </Profile>
  );
}
