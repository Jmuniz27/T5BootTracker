import React from 'react';
import renderer, { act } from 'react-test-renderer';
import AgendaScreen from '../agenda';
import { getFollowUps } from '../../../src/lib/follow-up-store';

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useEffect } = require('react');
  return {
    useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useFocusEffect: (cb: () => void) => useEffect(() => cb(), []),
  };
});

// react-native-calendars usa módulos nativos/XDate; lo stubeamos en tests.
jest.mock('react-native-calendars', () => ({ Calendar: () => null }));

jest.mock('../../../src/lib/follow-up-store', () => ({
  getFollowUps: jest.fn(),
}));

const mocked = getFollowUps as jest.Mock;

// Extrae todo el texto renderizado del árbol.
function textOf(node: unknown): string {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(textOf).join(' ');
  return textOf((node as { children?: unknown }).children);
}

function todayIso(hour = 9): string {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

describe('AgendaScreen', () => {
  afterEach(() => jest.clearAllMocks());

  it('muestra los seguimientos del día seleccionado (hoy)', async () => {
    mocked.mockResolvedValue([
      {
        id: 'a',
        leadId: 'lead-1',
        leadName: 'Ana Torres',
        date: todayIso(),
        notificationId: null,
        eventId: null,
      },
    ]);

    let root: renderer.ReactTestRenderer | undefined;
    await act(async () => {
      root = renderer.create(<AgendaScreen />);
    });
    expect(textOf(root?.toJSON())).toContain('Ana Torres');
    expect(mocked).toHaveBeenCalled();
  });

  it('muestra el vacío del día cuando no hay seguimientos', async () => {
    mocked.mockResolvedValue([]);
    let root: renderer.ReactTestRenderer | undefined;
    await act(async () => {
      root = renderer.create(<AgendaScreen />);
    });
    expect(textOf(root?.toJSON())).toContain('Sin seguimientos este día');
  });
});
