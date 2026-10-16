import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
} from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  AccessibilityInfo,
  findNodeHandle,
} from 'react-native';
import { usePane } from './layout';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './theme';
import { useLocale } from './locale';
import { Button, createStyles } from './components';
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
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const sub = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    return () => sub.remove();
  }, []);
  const resolver = useRef<((value: boolean) => void) | null>(null);
  const titleRef = useRef<React.ElementRef<typeof Text>>(null);
  const { colors } = useTheme();
  const { rtl } = useLocale();
  const s = createStyles(colors, rtl);
  const pane = usePane();
  const insets = useSafeAreaInsets();
  const finish = (value: boolean) => {
    const resolve = resolver.current;
    resolver.current = null;
    setRequest(null);
    resolve?.(value);
  };
  useEffect(
    () => () => {
      resolver.current?.(false);
    },
    [],
  );
  const confirm: Confirm = (title, body, action, cancel) =>
    new Promise(resolve => {
      resolver.current?.(false);
      resolver.current = resolve;
      setRequest({ title, body, action, cancel });
    });
  return (
    <Context.Provider value={confirm}>
      {children}
      <Modal
        testID="confirmation-dialog"
        visible={!!request}
        transparent
        animationType={reduceMotion ? 'none' : 'fade'}
        statusBarTranslucent
        onRequestClose={() => finish(false)}
        onShow={() => {
          const node = findNodeHandle(titleRef.current);
          if (node) AccessibilityInfo.setAccessibilityFocus(node);
        }}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: '#00000099',
          }}
          accessibilityViewIsModal
        >
          <Pressable
            testID="confirmation-backdrop"
            accessible={false}
            onPress={() => finish(false)}
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              right: 0,
            }}
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
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <View
              style={[
                s.card,
                {
                  width: '100%',
                  maxWidth: 480,
                  maxHeight: pane.height - 32,
                  padding: 24,
                },
              ]}
            >
              <ScrollView contentContainerStyle={{ gap: 20 }}>
                <View style={s.badge}>
                  <Text style={s.badgeText}>✦ Pixora</Text>
                </View>
                <Text
                  ref={titleRef}
                  accessible
                  accessibilityRole="header"
                  style={s.heading}
                >
                  {request?.title}
                </Text>
                <Text style={s.body}>{request?.body}</Text>
                <Button
                  title={request?.action ?? ''}
                  onPress={() => finish(true)}
                />
                <Button
                  title={request?.cancel ?? ''}
                  secondary
                  onPress={() => finish(false)}
                />
              </ScrollView>
            </View>
          </View>
        </View>
      </Modal>
    </Context.Provider>
  );
}
