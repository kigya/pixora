import React, { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { useApp } from '../application/AppProvider';
import { useLocale } from './locale';
import { useTheme } from './theme';
import { Button, createStyles } from './components';
import { profileIds, publicProfile } from '../domain/profiles';
import { track } from '../application/telemetry';
import { CompareSlider } from '../components/kinetik/compare-slider';
import { ExpandCard } from '../components/kinetik/expand-card';
import type { ProfileId } from '../specs/NativeUpscale';

const examples: Record<ProfileId, readonly [number, number]> = {
  standard: [require('../../assets/presets/standard-before.jpg'), require('../../assets/presets/standard-after.jpg')],
  lite: [require('../../assets/presets/lite-before.jpg'), require('../../assets/presets/lite-after.jpg')],
  natural: [require('../../assets/presets/natural-before.jpg'), require('../../assets/presets/natural-after.jpg')],
  details: [require('../../assets/presets/details-before.jpg'), require('../../assets/presets/details-after.jpg')],
  balanced: [require('../../assets/presets/balanced-before.jpg'), require('../../assets/presets/balanced-after.jpg')],
  sharp: [require('../../assets/presets/sharp-before.jpg'), require('../../assets/presets/sharp-after.jpg')],
  art: [require('../../assets/presets/art-before.jpg'), require('../../assets/presets/art-after.jpg')],
  pixel: [require('../../assets/presets/pixel-before.png'), require('../../assets/presets/pixel-after.png')],
};

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
  const [expanded, setExpanded] = useState<ProfileId | null>(null);
  const current = publicProfile(value);
  const available = profileIds.filter(
    id => availability[id] && caps?.modes.some(mode => publicProfile(mode) === id),
  );
  const select = (id: ProfileId) => {
    if (current !== id) {
      track('profile_selected', { profile_id: id, previous_profile: current });
      onChange(id);
    }
  };
  return (
    <View style={{ gap: 12 }}>
      {available.map(id => {
        const [before, after] = examples[id];
        const selected = current === id;
        return (
          <ExpandCard
            key={id}
            title={t.presets[id].title}
            expanded={expanded === id}
            onExpandedChange={open => {
              setExpanded(open ? id : null);
              if (open) track('profile_picker_opened', { profile_id: current });
            }}
            selectionSlot={
              <Button
                title={selected ? t.done : t.selectModel}
                secondary={!selected}
                disabled={selected}
                icon={selected ? 'check' : undefined}
                testID={`select-model-${id}`}
                onPress={() => select(id)}
              />
            }
          >
            <Text style={s.caption}>{t.presets[id].note}</Text>
            <CompareSlider
              accessibilityLabel={`${t.presets[id].title}: ${t.before} / ${t.after}`}
              beforeLabel={t.before}
              afterLabel={t.after}
              before={<Image source={before} resizeMode="cover" style={{ width: '100%', height: '100%' }} />}
              after={<Image source={after} resizeMode="cover" style={{ width: '100%', height: '100%' }} />}
              aspectRatio={1.45}
              hint={false}
            />
          </ExpandCard>
        );
      })}
    </View>
  );
}
