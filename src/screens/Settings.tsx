import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Text,
  View,
  Pressable,
  Platform,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { Routes } from '../navigation/routes';
import Native from '../specs/NativeUpscale';
import { Button, Segments, Icon, createStyles } from '../ui/components';
import { useTheme } from '../ui/theme';
import { useConfirm } from '../ui/dialog';
import { useLocale } from '../ui/locale';
import { HelpLink, LanguagePicker } from '../ui/information';
import { useApp } from '../application/AppProvider';
import { errorText } from '../application/errors';
import { TelemetryControls } from '../ui/telemetryControls';
import { StorageSlider } from '../ui/storageSlider';
import { useOperation } from '../application/useOperation';
import { PRIVACY_POLICY_URL } from '../application/privacy';

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
  const { colors } = useTheme();
  const { rtl, number } = useLocale();
  const s = createStyles(colors, rtl);
  const confirm = useConfirm();
  const [info, setInfo] = useState(''),
    [legal, setLegal] = useState('');
  const [privacyLinkError, setPrivacyLinkError] = useState(false);
  const { operation, error, setError, run } = useOperation();
  const busy = !!operation;
  const workBytes = caps?.workBytes ?? 0;
  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);
  return (
    <SafeAreaView style={s.screen} edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.back}
            onPress={() => {
              if (info) setInfo('');
              else navigation.goBack();
            }}
            style={s.iconButton}
          >
            <Icon name="back" />
          </Pressable>
          <Text style={[s.heading, { flex: 1, textAlign: 'center' }]}>
            {info === 'legal'
              ? t.licenses
              : info === 'privacy'
              ? t.privacy
              : t.settings}
          </Text>
          <View style={{ width: 48 }} />
        </View>
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
              <Text style={s.body}>{t.language}</Text>
              <LanguagePicker
                value={settings.language}
                onChange={async id => {
                  await run(async () =>
                    setSettings(
                      await Native.updateSettings(
                        id,
                        settings.format,
                        settings.theme,
                      ),
                    ),
                  );
                }}
              />
            </View>
            <View style={s.card}>
              <Text style={s.body}>{t.theme}</Text>
              <Segments
                values={[
                  { id: 'system', label: t.system },
                  { id: 'light', label: t.light },
                  { id: 'dark', label: t.dark },
                ]}
                value={settings.theme}
                onChange={id =>
                  run(async () =>
                    setSettings(
                      await Native.updateSettings(
                        settings.language,
                        settings.format,
                        id,
                      ),
                    ),
                  )
                }
              />
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
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t.cacheHelpTitle}
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
              </Pressable>
            </View>
            <View style={s.card}>
              <Text style={s.body}>
                {workBytes < 1048576
                  ? `${number(workBytes / 1024)} KiB`
                  : `${number(workBytes / 1048576)} MiB`}
              </Text>
              <Text style={s.label}>{t.cacheLimit}</Text>
              <StorageSlider
                value={settings.cacheLimitMiB}
                onChange={value =>
                  run(async () =>
                    setSettings(await Native.setCacheLimit(value)),
                  )
                }
              />
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
                title={t.clear}
                secondary
                onPress={() =>
                  run(async () => {
                    await Native.clearTemporaryFiles();
                    track('ui_action', { action: 'temporary_files_cleared' });
                    await refresh();
                    setMessage('cleared');
                  })
                }
              />
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
      </ScrollView>
    </SafeAreaView>
  );
}
