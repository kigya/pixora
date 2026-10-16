import React, { useEffect, useState, useRef } from 'react';
import { View, Text, Pressable, Linking } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Panel } from './information';
import { Button, createStyles } from './components';
import { useTheme } from './theme';
import { useLocale } from './locale';
import { useApp } from '../application/AppProvider';
import { track, type EventContext } from '../application/telemetry';
import { useConfirm } from './dialog';

export function Stars({
  value,
  onChange,
  disabled = false,
}: {
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const { colors } = useTheme();
  const { rtl, number } = useLocale();
  return (
    <View
      style={{
        flexDirection: rtl ? 'row-reverse' : 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
      }}
    >
      {[1, 2, 3, 4, 5].map(star => (
        <Pressable
          key={star}
          accessibilityRole="radio"
          accessibilityState={{ selected: value === star, disabled }}
          accessibilityLabel={`${number(star)} / ${number(5)}`}
          disabled={disabled}
          onPress={() => onChange(value === star ? 0 : star)}
          style={{
            minWidth: 48,
            minHeight: 52,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Svg width={30} height={30} viewBox="0 0 24 24">
            <Path
              d="M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"
              stroke={colors.accent}
              strokeWidth={1.5}
              fill={star <= value ? colors.accent : 'none'}
            />
          </Svg>
        </Pressable>
      ))}
    </View>
  );
}
export function ReviewDialog({
  visible,
  onClose,
  onFeedback,
  context = {},
}: {
  context?: EventContext;
  visible: boolean;
  onClose: () => void;
  onFeedback: (rating: number) => void;
}) {
  const { t } = useApp();
  const { colors } = useTheme();
  const { rtl } = useLocale();
  const s = createStyles(colors, rtl);
  const confirm = useConfirm();
  const [rating, setRating] = useState(0);
  const promptContext = useRef(context);
  const submitted = useRef(false);
  useEffect(() => {
    promptContext.current = context;
  }, [context]);
  useEffect(() => {
    if (visible) {
      setRating(0);
      submitted.current = false;
      track('review_prompt_shown', promptContext.current);
    }
  }, [visible]);
  const dismiss = () => {
    if (!submitted.current)
      track('review_dismissed', { ...context, action: 'dismiss' });
    onClose();
  };
  return (
    <Panel visible={visible} onClose={dismiss}>
      <Text accessibilityRole="header" style={s.heading}>
        {t.rateTitle}
      </Text>
      <Text style={s.body}>{t.rateBody}</Text>
      <Text style={s.caption}>{t.ratingRequired}</Text>
      <Stars
        value={rating}
        onChange={value => {
          setRating(value);
          track('review_rating_selected', { ...context, rating: value });
        }}
      />
      <Button
        title={t.continue}
        disabled={rating === 0}
        onPress={async () => {
          submitted.current = true;
          track('review_submitted', {
            ...context,
            rating,
            route: rating < 5 ? 'feedback' : 'play',
          });
          if (rating < 5) {
            onClose();
            onFeedback(rating);
            return;
          }
          if (await confirm(t.play, t.playTest, t.open, t.cancel)) {
            await Linking.openURL(
              'https://play.google.com/store/apps/details?id=dev.kigya.pixora',
            )
              .then(() =>
                track('play_redirect_finished', {
                  ...context,
                  status: 'success',
                }),
              )
              .catch(() =>
                track('play_redirect_finished', {
                  ...context,
                  status: 'error',
                }),
              );
            onClose();
          }
        }}
      />
      <Button title={t.notNow} secondary onPress={dismiss} />
    </Panel>
  );
}
