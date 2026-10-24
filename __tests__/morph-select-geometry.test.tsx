import React from 'react';
import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { KinetikProvider } from '../src/lib/kinetik/tokens/theme';
import { MorphSelect } from '../src/components/kinetik/morph-select';

type TriggerHandle = { measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => void };
type PressableMock = React.ComponentType<Record<string, unknown>> & { setMeasurement: (rect: [number, number, number, number]) => void };

jest.mock('react-native/Libraries/Components/Pressable/Pressable', () => {
  const ReactModule = jest.requireActual('react') as typeof React;
  const { View: MockView } = jest.requireActual('react-native') as typeof import('react-native');
  const measurement = { rect: [60, 5000, 300, 52] as [number, number, number, number] };
  const MockPressable = ReactModule.forwardRef<TriggerHandle, Record<string, unknown>>((props, ref) => {
    ReactModule.useImperativeHandle(ref, () => ({
      measureInWindow: callback => callback(...measurement.rect),
    }), []);
    const style = typeof props.style === 'function' ? props.style({ pressed: false }) : props.style;
    return ReactModule.createElement(MockView, { ...props, style, accessible: true });
  });
  Object.assign(MockPressable, { setMeasurement: (rect: [number, number, number, number]) => { measurement.rect = rect; } });
  return { __esModule: true, default: MockPressable };
});

const MockPressableModule = require('react-native/Libraries/Components/Pressable/Pressable').default as unknown;
const mockPressable = MockPressableModule as PressableMock;
const renderSelect = (value: string | null, onValueChange = jest.fn()) => render(
  <KinetikProvider scheme="dark" reduceMotion="never" haptics={false}>
    <MorphSelect
      options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]}
      value={value} onValueChange={onValueChange} label="Theme" placeholder="Choose theme" haptics={false}
    />
  </KinetikProvider>,
);

test('MorphSelect measures its trigger and places a short list above it when lower space is insufficient', async () => {
  mockPressable.setMeasurement([60, 5000, 300, 52]);
  const view = await renderSelect('dark');
  await userEvent.press(screen.getByRole('button', { name: 'Theme, Dark' }));
  expect(screen.getByRole('menuitem', { name: 'Dark' })).toBeOnTheScreen();
  const panel = view.container.queryAll(node => node.props?.accessibilityRole === 'list')[0];
  expect(panel).toBeTruthy();
  const style = Array.isArray(panel!.props.style) ? panel!.props.style.flat(Infinity) : [panel!.props.style];
  expect(style).toEqual(expect.arrayContaining([expect.objectContaining({ flexDirection: 'column-reverse' })]));
  const modal = view.container.queryAll(node => typeof node.props?.onRequestClose === 'function')[0];
  await fireEvent(modal!, 'requestClose');
  expect(screen.queryByRole('menuitem', { name: 'Dark' })).toBeNull();
});
