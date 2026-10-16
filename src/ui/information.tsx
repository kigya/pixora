import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  FlatList,
  AccessibilityInfo,
} from 'react-native';
import { SvgXml } from 'react-native-svg';
import { usePane } from './layout';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './theme';
import { useLocale, languages } from './locale';
import { strings } from './i18n';
import { flagXml } from './flags';
import { Button, Icon, createStyles } from './components';
import { track } from '../application/telemetry';

export function Panel({
  visible,
  onClose,
  children,
  scroll = true,
}: {
  scroll?: boolean;
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  const pane = usePane();
  const insets = useSafeAreaInsets();
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    const sub = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduced,
    );
    return () => sub.remove();
  }, []);
  return (
    <Modal
      testID="information-panel"
      transparent
      visible={visible}
      animationType={reduced ? 'none' : 'fade'}
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View
        style={{ flex: 1, backgroundColor: '#00000099' }}
        accessibilityViewIsModal
      >
        <Pressable
          testID="information-backdrop"
          accessible={false}
          onPress={onClose}
          style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}
        />
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            left: pane.marginLeft + insets.left,
            top: pane.marginTop + insets.top,
            width: pane.width,
            height: pane.height,
            padding: 16,
            justifyContent: pane.width >= 600 ? 'center' : 'flex-end',
            alignItems: 'center',
          }}
        >
          <View
            style={{
              width: '100%',
              maxWidth: 480,
              maxHeight: pane.height - 32,
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderWidth: 1,
              borderRadius: 24,
              padding: 20,
            }}
          >
            {scroll ? (
              <ScrollView
                contentContainerStyle={{ gap: 20 }}
                keyboardShouldPersistTaps="handled"
              >
                {children}
              </ScrollView>
            ) : (
              children
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}
const HelpContext = createContext<() => void>(() => {});
export const useHow = () => useContext(HelpContext);
export function InformationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  const { locale, rtl } = useLocale();
  const { colors } = useTheme();
  const s = createStyles(colors, rtl);
  const t = strings[locale];
  const sections = t.howSections;
  return (
    <HelpContext.Provider
      value={() => {
        track('ui_action', { action: 'help_opened' });
        setVisible(true);
      }}
    >
      {children}
      <Panel visible={visible} onClose={() => setVisible(false)}>
        <Text accessibilityRole="header" style={s.heading}>
          {t.howTitle}
        </Text>
        {(['learn', 'copy', 'detail'] as const).map(key => (
          <View key={key} style={{ gap: 8 }}>
            <Text style={[s.body, { color: colors.text, fontWeight: '600' }]}>
              {sections[`${key}Title`]}
            </Text>
            <Text style={s.body}>{sections[`${key}Body`]}</Text>
          </View>
        ))}
        <Button title={t.understood} onPress={() => setVisible(false)} />
      </Panel>
    </HelpContext.Provider>
  );
}
export function HelpLink() {
  const show = useHow();
  const { locale, rtl } = useLocale();
  const { colors } = useTheme();
  const t = strings[locale];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t.how}
      onPress={show}
      style={{
        minHeight: 48,
        justifyContent: 'center',
        alignSelf: rtl ? 'flex-end' : 'flex-start',
      }}
    >
      <Text
        style={{
          color: colors.badgeText,
          fontSize: 14,
          textAlign: rtl ? 'right' : 'left',
        }}
      >
        {t.how} ↗
      </Text>
    </Pressable>
  );
}
function Flag({ code }: { code?: string }) {
  return code ? (
    <SvgXml
      xml={flagXml[code]}
      width={28}
      height={22}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  ) : (
    <Icon name="globe" />
  );
}
export function LanguagePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => Promise<void>;
}) {
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const { locale, rtl } = useLocale();
  const { colors } = useTheme();
  const s = createStyles(colors, rtl);
  const t = strings[locale];
  const current = languages.find(x => x.id === value);
  const collator = new Intl.Collator(locale);
  const options = [
    { id: 'system', name: t.system, flag: undefined },
    ...[...languages].sort((a, b) => collator.compare(a.name, b.name)),
  ];
  return (
    <>
      <Pressable
        testID="language-picker"
        accessibilityRole="button"
        accessibilityLabel={`${t.language}: ${current?.name ?? t.system}`}
        onPress={() => setVisible(true)}
        style={[s.row, { minHeight: 56 }]}
      >
        <Flag code={current?.flag} />
        <Text style={[s.body, { color: colors.text, flex: 1 }]}>
          {current?.name ?? t.system}
        </Text>
        <Icon name="chevron" />
      </Pressable>
      <Panel visible={visible} onClose={() => setVisible(false)} scroll={false}>
        <Text accessibilityRole="header" style={s.heading}>
          {t.language}
        </Text>
        <FlatList
          data={options}
          keyExtractor={item => item.id}
          initialNumToRender={8}
          windowSize={3}
          style={{ maxHeight: 480 }}
          renderItem={({ item }) => (
            <Pressable
              key={item.id}
              testID={`language-${item.id}`}
              accessibilityRole="radio"
              accessibilityState={{
                selected: value === item.id,
                disabled: pending,
              }}
              accessibilityLabel={item.name}
              disabled={pending}
              onPress={async () => {
                setPending(true);
                try {
                  await onChange(item.id);
                  setVisible(false);
                } finally {
                  setPending(false);
                }
              }}
              style={[
                s.row,
                {
                  minHeight: 48,
                  padding: 12,
                  borderRadius: 12,
                  backgroundColor:
                    value === item.id ? colors.badge : colors.surface,
                },
              ]}
            >
              <Flag code={item.flag} />
              <Text style={[s.body, { color: colors.text, flex: 1 }]}>
                {item.name}
              </Text>
              {value === item.id && (
                <Icon name="check" color={colors.badgeText} />
              )}
            </Pressable>
          )}
        />
      </Panel>
    </>
  );
}
export function BackgroundNotice({
  enabled,
  children,
}: {
  enabled: boolean;
  children?: React.ReactNode;
}) {
  const { locale, rtl } = useLocale();
  const { colors } = useTheme();
  const s = createStyles(colors, rtl);
  const t = strings[locale];
  return (
    <View style={[s.card, { borderRadius: 16, padding: 16 }]}>
      <View style={[s.row, { alignItems: 'flex-start', flexWrap: 'nowrap' }]}>
        <View
          style={{
            backgroundColor: colors.badge,
            padding: 10,
            borderRadius: 12,
          }}
        >
          <Icon name="phone" color={colors.badgeText} />
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={[s.body, { color: colors.text, fontWeight: '600' }]}>
            {enabled ? t.backgroundTitle : t.returnTitle}
          </Text>
          <Text style={s.caption}>
            {enabled ? t.backgroundBody : t.returnBody}
          </Text>
        </View>
      </View>
      {children}
    </View>
  );
}
