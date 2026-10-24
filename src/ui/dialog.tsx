import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  AccessibilityInfo,
  ScrollView,
  Text,
  View,
  findNodeHandle,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PopDialog } from '../components/kinetik/pop-dialog';
import { useKinetikTheme } from '../lib/kinetik/tokens/theme';

type Request = { title: string; body: string; action: string; cancel: string };
type Confirm = (
  title: string,
  body: string,
  action: string,
  cancel: string,
) => Promise<boolean>;

const Context = createContext<Confirm>(async () => false);
export const useConfirm = () => useContext(Context);

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<Request | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);
  const titleRef = useRef<React.ElementRef<typeof Text>>(null);
  const { colors, font, space } = useKinetikTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();

  const finish = (value: boolean) => {
    const resolve = resolver.current;
    resolver.current = null;
    setRequest(null);
    resolve?.(value);
  };

  useEffect(
    () => () => {
      resolver.current?.(false);
      resolver.current = null;
    },
    [],
  );

  useEffect(() => {
    if (!request) return;
    const focusTitle = () => {
      const node = findNodeHandle(titleRef.current);
      if (node) AccessibilityInfo.setAccessibilityFocus(node);
    };
    const frame = requestAnimationFrame(focusTitle);
    return () => cancelAnimationFrame(frame);
  }, [request]);

  const confirm: Confirm = (title, body, action, cancel) =>
    new Promise(resolve => {
      resolver.current?.(false);
      resolver.current = resolve;
      setRequest({ title, body, action, cancel });
    });

  const maxDialogHeight = Math.max(
    180,
    window.height - insets.top - insets.bottom - 32,
  );

  return (
    <Context.Provider value={confirm}>
      {children}
      <PopDialog
        visible={!!request}
        onShow={() => {
          const node=findNodeHandle(titleRef.current);
          if(node)AccessibilityInfo.setAccessibilityFocus(node);
        }}
        onClose={() => finish(false)}
        closeLabel={request?.cancel}
        // The visible, focusable heading is inside the bounded scroll region.
        title=""
        actions={[
          {
            label: request?.action ?? '',
            tone: 'primary',
            onPress: () => finish(true),
          },
          {
            label: request?.cancel ?? '',
            onPress: () => finish(false),
          },
        ]}
        dismissable
        testID="confirmation-dialog"
        style={{ maxHeight: maxDialogHeight }}
      >
        <ScrollView
          testID="confirmation-scroll"
          style={{ flexShrink: 1 }}
          contentContainerStyle={{ gap: space[4] }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator
        >
          <View
            style={{
              alignSelf: 'flex-start',
              backgroundColor: colors.emberSoft,
              borderRadius: 999,
              paddingHorizontal: space[3],
              paddingVertical: space[1],
            }}
          >
            <Text
              style={{
                color: colors.ember,
                fontSize: font.size.xs,
                fontWeight: font.weight.semibold,
              }}
            >
              ✦ Pixora
            </Text>
          </View>
          <Text
            ref={titleRef}
            accessible
            accessibilityRole="header"
            style={{
              color: colors.text,
              fontSize: font.size.lg,
              fontWeight: font.weight.semibold,
            }}
          >
            {request?.title}
          </Text>
          <Text
            style={{
              color: colors.textMuted,
              fontSize: font.size.sm,
              lineHeight: 22,
            }}
          >
            {request?.body}
          </Text>
        </ScrollView>
      </PopDialog>
    </Context.Provider>
  );
}
