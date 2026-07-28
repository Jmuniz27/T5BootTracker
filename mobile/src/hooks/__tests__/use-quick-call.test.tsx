import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Alert, AppState, type AppStateStatus } from 'react-native';
import { useQuickCall } from '../use-quick-call';
import * as phone from '../../lib/phone';
import type { Lead } from '../../types/leads';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const lead: Lead = {
  id: 'lead-1',
  name: 'Ana Torres',
  phone: '099 123-4567',
  email: null,
  source: 'WEB',
  status: 'NEW',
  is_company: false,
  program_interest: 'FS',
  interaction_count: 0,
  last_outcome: null,
  last_interaction_at: null,
  days_assigned: null,
  owner: null,
  owner_name: null,
  created_at: '2026-07-01T00:00:00Z',
};

let changeHandler: (state: AppStateStatus) => void;
let quickCall: ReturnType<typeof useQuickCall>;

function Harness() {
  quickCall = useQuickCall();
  return null;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_type: string, handler: (s: AppStateStatus) => void) => {
      changeHandler = handler;
      return { remove: jest.fn() } as never;
    });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(phone, 'openDialer').mockResolvedValue(true);
});

describe('useQuickCall', () => {
  it('ofrece registrar la interacción al volver de una llamada', async () => {
    await act(async () => {
      renderer.create(<Harness />);
    });

    await act(async () => {
      await quickCall.startCall(lead);
    });
    expect(phone.openDialer).toHaveBeenCalledWith(lead.phone);

    // Simula ir al marcador y volver a la app.
    act(() => changeHandler('background'));
    act(() => changeHandler('active'));

    expect(Alert.alert).toHaveBeenCalledTimes(1);
    const buttons = (Alert.alert as jest.Mock).mock.calls[0][2];
    const registrar = buttons.find((b: { text: string }) => b.text === 'Registrar');
    registrar.onPress();

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/leads/[id]/log-interaction',
      params: { id: lead.id },
    });
  });

  it('no ofrece registro si no se inició una llamada', async () => {
    await act(async () => {
      renderer.create(<Harness />);
    });

    act(() => changeHandler('background'));
    act(() => changeHandler('active'));

    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('avisa si el dispositivo no puede llamar', async () => {
    (phone.openDialer as jest.Mock).mockResolvedValue(false);

    await act(async () => {
      renderer.create(<Harness />);
    });
    await act(async () => {
      await quickCall.startCall(lead);
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      'No se pudo llamar',
      expect.any(String),
    );
  });
});
