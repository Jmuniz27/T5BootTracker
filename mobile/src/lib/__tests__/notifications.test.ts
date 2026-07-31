import * as Notifications from 'expo-notifications';
import { scheduleFollowUpReminder } from '../notifications';

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

const mocked = Notifications as unknown as {
  getPermissionsAsync: jest.Mock;
  requestPermissionsAsync: jest.Mock;
  scheduleNotificationAsync: jest.Mock;
};

const future = () => new Date(Date.now() + 24 * 60 * 60 * 1000);

describe('scheduleFollowUpReminder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mocked.getPermissionsAsync.mockResolvedValue({ granted: true });
    mocked.scheduleNotificationAsync.mockResolvedValue('notif-1');
  });

  it('programa con trigger de fecha cuando hay permiso', async () => {
    const date = future();
    const id = await scheduleFollowUpReminder('Ana', date);
    expect(id).toBe('notif-1');
    const arg = mocked.scheduleNotificationAsync.mock.calls[0][0];
    expect(arg.trigger).toEqual({ type: 'date', date });
    expect(arg.content.body).toContain('Ana');
  });

  it('pide permiso si no está concedido y respeta la negativa', async () => {
    mocked.getPermissionsAsync.mockResolvedValue({ granted: false });
    mocked.requestPermissionsAsync.mockResolvedValue({ granted: false });
    const id = await scheduleFollowUpReminder('Ana', future());
    expect(id).toBeNull();
    expect(mocked.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('no programa fechas en el pasado', async () => {
    const id = await scheduleFollowUpReminder('Ana', new Date(Date.now() - 1000));
    expect(id).toBeNull();
    expect(mocked.getPermissionsAsync).not.toHaveBeenCalled();
  });

  it('devuelve null ante una fecha inválida', async () => {
    const id = await scheduleFollowUpReminder('Ana', new Date('nope'));
    expect(id).toBeNull();
  });
});
