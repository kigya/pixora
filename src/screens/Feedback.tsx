import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  type TextInputFocusEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from 'expo-router/native-stack';
import type { Routes } from '../navigation/routes';
import Native from '../specs/NativeUpscale';
import { useApp } from '../application/AppProvider';
import { useOperation } from '../application/useOperation';
import { useTheme } from '../ui/theme';
import { useLocale } from '../ui/locale';
import { Button, Icon, createStyles } from '../ui/components';
import { validEmail, validMessage } from '../domain/presentation';
import { usePane } from '../ui/layout';
import { track, useTrackedScreen } from '../application/telemetry';
// This is an idempotency key, not an auth token or device identifier.
export function feedbackId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });
}
export function FeedbackScreen({
  navigation,
  route,
}: NativeStackScreenProps<Routes, 'Feedback'>) {
  useTrackedScreen('feedback', route.params?.context, navigation);
  const { t } = useApp();
  useEffect(() => {
    track('feedback_opened', {
      ...route.params?.context,
      source: route.params?.source ?? 'settings',
    });
  }, [route.params]);
  const { colors } = useTheme();
  const { rtl } = useLocale();
  const pane = usePane();
  const s = createStyles(colors, rtl);
  const [email, setEmail] = useState(''),
    [message, setMessage] = useState(''),
    [configured, setConfigured] = useState<boolean | null>(null),
    [submitted, setSubmitted] = useState(false),
    [validation, setValidation] = useState('');
  const [id, setId] = useState(feedbackId);
  const scrollRef = React.useRef<React.ComponentRef<typeof ScrollView>>(null);
  const { operation, error, run } = useOperation();
  const focusedInput = React.useRef<TextInputFocusEvent['nativeEvent']['target'] | null>(null);
  const emailInputRef = React.useRef<React.ComponentRef<typeof TextInput>>(null);
  const messageInputRef = React.useRef<React.ComponentRef<typeof TextInput>>(null);
  const focusedViewRef = React.useRef<React.ComponentRef<typeof TextInput> | null>(null);
  const scrollOffsetRef = React.useRef(0);
  useEffect(() => {
    let firstFrame: number | null = null;
    let secondFrame: number | null = null;
    const cancelPendingFrames = () => {
      if (firstFrame !== null) cancelAnimationFrame(firstFrame);
      if (secondFrame !== null) cancelAnimationFrame(secondFrame);
      firstFrame = null;
      secondFrame = null;
    };
    const listener = Keyboard.addListener('keyboardDidShow', event => {
      const focusedView = focusedViewRef.current;
      if (!focusedView || !focusedView.isFocused()) return;
      cancelPendingFrames();
      const keyboardTop = event.endCoordinates.screenY;
      firstFrame = requestAnimationFrame(() => {
        firstFrame = null;
        secondFrame = requestAnimationFrame(() => {
          secondFrame = null;
          if (focusedViewRef.current !== focusedView || !focusedView.isFocused()) return;
          focusedView.measureInWindow((_x, y, _width, height) => {
            if (focusedViewRef.current !== focusedView) return;
            const delta = y + height + 24 - keyboardTop;
            if (delta > 0) scrollRef.current?.scrollTo({ y: scrollOffsetRef.current + delta, animated: true });
          });
        });
      });
    });
    return () => {
      listener.remove();
      cancelPendingFrames();
    };
  }, []);
  const revealFocusedField = (event: TextInputFocusEvent, input: React.ComponentRef<typeof TextInput> | null) => {
    focusedViewRef.current = input;
    focusedInput.current = event.nativeEvent.target;
    if (focusedInput.current !== null) scrollRef.current?.scrollResponderScrollNativeHandleToKeyboard(focusedInput.current, 28, true);
  };
  useEffect(() => {
    let mounted = true;
    Native.getFeedbackStatus()
      .then(value => {
        if (mounted) setConfigured(value);
      })
      .catch(() => {
        if (mounted) setConfigured(false);
      });
    return () => {
      mounted = false;
    };
  }, []);
  const edit = () => {
    setId(feedbackId());
    setSubmitted(false);
    setValidation('');
  };
  const inputStyle = {
    color: colors.text,
    backgroundColor: colors.raised,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    fontSize: 16,
    textAlign: rtl ? ('right' as const) : ('left' as const),
    minHeight: 56,
  };
  return (
    <SafeAreaView style={s.screen} edges={['top', 'bottom', 'left', 'right']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        ref={scrollRef}
        testID="feedback-scroll"
        onScroll={event => { scrollOffsetRef.current = event.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={100}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        contentInsetAdjustmentBehavior="automatic"
        style={{
          width: pane.width,
          maxHeight: pane.height,
          marginLeft: pane.marginLeft,
          marginTop: pane.marginTop,
        }}
        contentContainerStyle={[s.content, { maxWidth: 600, width: '100%' }]}
      >
        <View style={s.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.back}
            onPress={() => navigation.goBack()}
            style={s.iconButton}
          >
            <Icon name="back" />
          </Pressable>
          <Text style={[s.heading, { flex: 1, textAlign: 'center' }]}>
            {t.issues}
          </Text>
          <View style={{ width: 48 }} />
        </View>
        {route.params?.rating ? <Text style={s.body}>{'★'.repeat(route.params.rating)} · {route.params.rating}/5</Text> : null}
        <Text style={s.body}>{t.feedbackPrivacy}</Text>
        <Text style={s.label}>{t.email}</Text>
        <TextInput
          ref={emailInputRef}
          accessibilityLabel={t.email}
          onFocus={event => revealFocusedField(event, emailInputRef.current)}
          onBlur={() => { if (focusedViewRef.current === emailInputRef.current) focusedViewRef.current = null; }}
          value={email}
          onChangeText={value => {
            setEmail(value);
            edit();
          }}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={254}
          style={[inputStyle, { direction: 'ltr', textAlign: 'left' }]}
          editable={!operation}
        />
        <Text style={s.caption}>{t.emailNote}</Text>
        <Text style={s.label}>{t.message}</Text>
        <TextInput
          ref={messageInputRef}
          accessibilityLabel={t.message}
          onFocus={event => revealFocusedField(event, messageInputRef.current)}
          onBlur={() => { if (focusedViewRef.current === messageInputRef.current) focusedViewRef.current = null; }}
          value={message}
          onChangeText={value => {
            setMessage(value);
            edit();
          }}
          multiline
          maxLength={4000}
          style={[inputStyle, { minHeight: 160, textAlignVertical: 'top' }]}
          editable={!operation}
        />
        {configured === null ? (
          <ActivityIndicator color={colors.accent} />
        ) : !configured ? (
          <Text style={s.caption}>{t.feedbackUnavailable}</Text>
        ) : null}
        {!!validation && (
          <Text accessibilityLiveRegion="polite" style={s.errorText}>
            {validation}
          </Text>
        )}
        {!!error && (
          <Text accessibilityLiveRegion="polite" style={s.errorText}>
            {t.feedbackError}
          </Text>
        )}
        {submitted && (
          <Text accessibilityLiveRegion="polite" style={s.body}>
            {t.feedbackSuccess}
          </Text>
        )}
        <Button
          title={t.send}
          disabled={!configured || !!operation || submitted}
          onPress={() => {
            if (email.trim() && !validEmail(email)) {
              setValidation(t.invalidEmail);
              return;
            }
            if (!validMessage(message)) {
              setValidation(t.invalidMessage);
              return;
            }
            run(async () => {
              try {
                await Native.sendFeedback(email.trim(), message.trim(), route.params?.rating ?? 0, id);
              } catch (failure) {
                track('feedback_send_finished', {
                  ...route.params?.context,
                  status: 'error',
                });
                throw failure;
              }
              track('feedback_send_finished', {
                ...route.params?.context,
                status: 'success',
              });
              setSubmitted(true);
            });
          }}
        />
        {!!operation && <ActivityIndicator color={colors.accent} />}
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
