import React from 'react';
import renderer, { act } from 'react-test-renderer';
import AgendaScreen from '../agenda';
import { getUpcomingFollowUps } from '../../../src/lib/follow-up-store';

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useEffect } = require('react');
  return {
    useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useFocusEffect: (cb: () => void) => useEffect(() => cb(), []),
  };
});

jest.mock('../../../src/lib/follow-up-store', () => ({
  getUpcomingFollowUps: jest.fn(),
}));

const mocked = getUpcomingFollowUps as jest.Mock;

// Extrae todo el texto renderizado del árbol de react-test-renderer.
function textOf(node: unknown): string {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(textOf).join(' ');
  return textOf((node as { children?: unknown }).children);
}

describe('AgendaScreen', () => {
  afterEach(() => jest.clearAllMocks());

  it('renderiza los seguimientos cargados', async () => {
    mocked.mockResolvedValue([
      {
        id: 'a',
        leadId: 'lead-1',
        leadName: 'Ana Torres',
        date: new Date(Date.now() + 86_400_000).toISOString(),
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

  it('muestra el estado vacío sin seguimientos', async () => {
    mocked.mockResolvedValue([]);
    let root: renderer.ReactTestRenderer | undefined;
    await act(async () => {
      root = renderer.create(<AgendaScreen />);
    });
    expect(textOf(root?.toJSON())).toContain('Sin seguimientos');
  });
});
