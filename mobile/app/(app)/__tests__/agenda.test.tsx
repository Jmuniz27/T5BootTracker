import React from 'react';
import renderer, { act } from 'react-test-renderer';
import AgendaScreen from '../agenda';
import { useAuth } from '../../../src/context/AuthContext';
import { getMeetings } from '../../../src/api/meetings.api';
import { fetchLeads } from '../../../src/api/leads.api';

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useEffect } = require('react');
  return {
    useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useFocusEffect: (cb: () => void) => useEffect(() => cb(), []),
  };
});

jest.mock('../../../src/context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('react-native-calendars', () => ({ Calendar: () => null }));

jest.mock('../../../src/api/meetings.api', () => ({
  getMeetings: jest.fn(),
  createMeeting: jest.fn(),
  updateMeeting: jest.fn(),
  deleteMeeting: jest.fn(),
}));
jest.mock('../../../src/api/leads.api', () => ({ fetchLeads: jest.fn() }));

const mockMeetings = getMeetings as jest.Mock;
const mockLeads = fetchLeads as jest.Mock;
const mockUseAuth = useAuth as jest.Mock;

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

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({ user: { role: 'SALESPERSON' }, logout: jest.fn() });
  mockLeads.mockResolvedValue({
    my_leads: [{ id: 'lead-1', name: 'Ana Torres' }],
    available_leads: [],
  });
});

describe('AgendaScreen', () => {
  it('muestra las reuniones del día seleccionado (hoy)', async () => {
    mockMeetings.mockResolvedValue([
      {
        id: 'm1',
        title: 'Llamada con Ana',
        description: '',
        start_time: todayIso(),
        end_time: todayIso(10),
        lead: 'lead-1',
        assigned_to: 'u1',
        google_event_id: null,
        created_at: todayIso(),
      },
    ]);

    let root: renderer.ReactTestRenderer | undefined;
    await act(async () => {
      root = renderer.create(<AgendaScreen />);
    });
    expect(textOf(root?.toJSON())).toContain('Llamada con Ana');
    expect(mockMeetings).toHaveBeenCalled();
  });

  it('muestra el vacío del día cuando no hay reuniones', async () => {
    mockMeetings.mockResolvedValue([]);
    let root: renderer.ReactTestRenderer | undefined;
    await act(async () => {
      root = renderer.create(<AgendaScreen />);
    });
    expect(textOf(root?.toJSON())).toContain('Sin reuniones este día');
  });

  it('FINANCE ve acceso restringido y no dispara la carga de reuniones', async () => {
    mockUseAuth.mockReturnValue({ user: { role: 'FINANCE' }, logout: jest.fn() });
    let root: renderer.ReactTestRenderer | undefined;
    await act(async () => {
      root = renderer.create(<AgendaScreen />);
    });
    expect(textOf(root?.toJSON())).toContain('Acceso restringido');
    expect(mockMeetings).not.toHaveBeenCalled();
  });
});
