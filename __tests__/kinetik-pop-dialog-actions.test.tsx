import React from 'react';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { KinetikProvider } from '../src/lib/kinetik/tokens/theme';
import { PopDialog } from '../src/components/kinetik/pop-dialog';

const app = (children: React.ReactNode) => <KinetikProvider scheme="dark" reduceMotion="always">{children}</KinetikProvider>;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
});
afterEach(() => jest.restoreAllMocks());

test('one default action is an accessible button and invokes only its callback', async () => {
  const onAction = jest.fn();
  const view = await render(app(<PopDialog visible title="One action" actions={[{ label: 'Keep', onPress: onAction }]} onClose={jest.fn()} testID="one" />));
  const action = screen.getByRole('button', { name: 'Keep' });
  expect(action).toBeEnabled();
  expect(StyleSheet.flatten(action.props.style)).toMatchObject({ backgroundColor: '#1C1C1C' });
  expect(action.props.accessibilityActions).toEqual([{ name: 'activate' }]);
  await userEvent.press(action);
  expect(onAction).toHaveBeenCalledTimes(1);
  expect(view.getByTestId('one')).toBeOnTheScreen();
});

test('two actions use the primary and danger tones and keep callbacks independent', async () => {
  const cancel = jest.fn();
  const remove = jest.fn();
  await render(app(<PopDialog visible title="Two actions" actions={[
    { label: 'Cancel', onPress: cancel, tone: 'primary' },
    { label: 'Remove', onPress: remove, tone: 'danger' },
  ]} onClose={jest.fn()} />));
  const primary = screen.getByRole('button', { name: 'Cancel' });
  const danger = screen.getByRole('button', { name: 'Remove' });
  expect(StyleSheet.flatten(primary.props.style)).toMatchObject({ backgroundColor: '#FFFFFF' });
  expect(StyleSheet.flatten(danger.props.style)).toMatchObject({ backgroundColor: '#FF6B7A' });
  expect(StyleSheet.flatten(primary.props.style)?.backgroundColor).not.toBe(StyleSheet.flatten(danger.props.style)?.backgroundColor);
  await userEvent.press(danger);
  expect(remove).toHaveBeenCalledTimes(1);
  expect(cancel).not.toHaveBeenCalled();
  await userEvent.press(primary);
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(remove).toHaveBeenCalledTimes(1);
});

test('three actions use the stacked layout and each action remains independently reachable', async () => {
  const calls = [jest.fn(), jest.fn(), jest.fn()];
  const view = await render(app(<PopDialog visible title="Three actions" actions={[
    { label: 'Save', onPress: calls[0]! },
    { label: 'Share', onPress: calls[1]!, tone: 'primary' },
    { label: 'Delete', onPress: calls[2]!, tone: 'danger' },
  ]} onClose={jest.fn()} />));
  for (const label of ['Save', 'Share', 'Delete']) expect(screen.getByRole('button', { name: label })).toBeOnTheScreen();
  await userEvent.press(screen.getByRole('button', { name: 'Save' }));
  await userEvent.press(screen.getByRole('button', { name: 'Share' }));
  await userEvent.press(screen.getByRole('button', { name: 'Delete' }));
  expect(calls.map(call => call.mock.calls.length)).toEqual([1, 1, 1]);
  expect(view.getByText('Three actions')).toBeOnTheScreen();
});

test('a non-dismissable dialog ignores the backdrop while Android Back still reaches its close handler', async () => {
  const onClose = jest.fn();
  const view = await render(app(<PopDialog visible title="Protected" actions={[]} onClose={onClose} dismissable={false} testID="protected" backdropTestID="protected-backdrop" />));
  await userEvent.press(screen.getByTestId('protected-backdrop', { includeHiddenElements: true }));
  expect(onClose).not.toHaveBeenCalled();
  await act(() => view.getByTestId('protected-modal').props.onRequestClose());
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('the visible dialog title is exposed as a heading and escape invokes close', async () => {
  const onClose = jest.fn();
  const view = await render(app(<PopDialog visible title="Accessible title" actions={[]} onClose={onClose} testID="accessible" />));
  expect(screen.getByRole('header', { name: 'Accessible title' })).toBeOnTheScreen();
  await act(() => view.getByTestId('accessible-modal').props.children.props.onAccessibilityEscape());
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('a dismissable dialog closes from backdrop and reports its show callback once per opening', async () => {
  const onClose = jest.fn();
  const onShow = jest.fn();
  const view = await render(app(<PopDialog visible title="Dismissable" actions={[]} onClose={onClose} onShow={onShow} testID="dismissable" backdropTestID="dismissable-backdrop" />));
  await act(() => view.getByTestId('dismissable-modal').props.onShow());
  expect(onShow).toHaveBeenCalledTimes(1);
  await userEvent.press(screen.getByTestId('dismissable-backdrop', { includeHiddenElements: true }));
  expect(onClose).toHaveBeenCalledTimes(1);
  await screen.rerender(app(<PopDialog visible={false} title="Dismissable" actions={[]} onClose={onClose} onShow={onShow} testID="dismissable" backdropTestID="dismissable-backdrop" />));
  await screen.rerender(app(<PopDialog visible title="Dismissable" actions={[]} onClose={onClose} onShow={onShow} testID="dismissable" backdropTestID="dismissable-backdrop" />));
  await act(() => view.getByTestId('dismissable-modal').props.onShow());
  expect(onShow).toHaveBeenCalledTimes(2);
});
