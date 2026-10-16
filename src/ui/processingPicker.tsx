import React, { useState } from 'react';
import { View, Text, Pressable, FlatList } from 'react-native';
import { useApp } from '../application/AppProvider';
import { useLocale } from './locale';
import { useTheme } from './theme';
import { Panel } from './information';
import { Button, Icon, createStyles } from './components';
import { profileIds, publicProfile } from '../domain/profiles';
import { track } from '../application/telemetry';
import { ProfilePreview } from './profilePreview';
import type { ProfileId } from '../specs/NativeUpscale';
export function ProcessingPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: ProfileId) => void;
}) {
  const { t, caps, availability } = useApp();
  const { colors } = useTheme();
  const { rtl } = useLocale();
  const s = createStyles(colors, rtl);
  const [visible, setVisible] = useState(false);
  const current = publicProfile(value);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t.profileTitle}: ${t.presets[current].title}`}
        onPress={() => {
          track('profile_picker_opened', { profile_id: current });
          setVisible(true);
        }}
        style={[s.row, { minHeight: 56 }]}
      >
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={s.value}>{t.presets[current].title}</Text>
          <Text style={s.caption}>{t.presets[current].note}</Text>
        </View>
        <Icon name="chevron" />
      </Pressable>
      <Panel visible={visible} onClose={() => setVisible(false)} scroll={false}>
        <Text accessibilityRole="header" style={s.heading}>
          {t.profileTitle}
        </Text>
        <FlatList
          data={profileIds.filter(
            id =>
              availability[id] &&
              caps?.modes.some(value => publicProfile(value) === id),
          )}
          keyExtractor={id => id}
          initialNumToRender={2}
          maxToRenderPerBatch={2}
          windowSize={3}
          style={{ maxHeight: 600 }}
          contentContainerStyle={{ gap: 16, paddingTop: 16 }}
          renderItem={({ item: id }) => (
            <View
              style={[
                s.card,
                {
                  padding: 16,
                  borderColor: current === id ? colors.accent : colors.border,
                },
              ]}
            >
              <View style={s.row}>
                <Text style={[s.value, { flex: 1 }]}>
                  {t.presets[id].title}
                </Text>
                {current === id ? (
                  <Icon name="check" color={colors.accent} />
                ) : null}
              </View>
              <Text style={s.caption}>{t.presets[id].note}</Text>
              <ProfilePreview id={id} />
              <Button
                title={t.presets[id].title}
                secondary={current !== id}
                onPress={() => {
                  track('profile_selected', {
                    profile_id: id,
                    previous_profile: current,
                  });
                  onChange(id);
                  setVisible(false);
                }}
              />
            </View>
          )}
        />
      </Panel>
    </>
  );
}
