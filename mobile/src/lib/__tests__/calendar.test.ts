import * as Calendar from 'expo-calendar';
import { addFollowUpEvent } from '../calendar';

jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));

jest.mock('expo-calendar', () => ({
  getCalendarPermissionsAsync: jest.fn(),
  requestCalendarPermissionsAsync: jest.fn(),
  getCalendarsAsync: jest.fn(),
  getDefaultCalendarAsync: jest.fn(),
  createEventAsync: jest.fn(),
  EntityTypes: { EVENT: 'event' },
}));

const mocked = Calendar as unknown as {
  getCalendarPermissionsAsync: jest.Mock;
  requestCalendarPermissionsAsync: jest.Mock;
  getCalendarsAsync: jest.Mock;
  createEventAsync: jest.Mock;
};

const date = new Date(Date.now() + 24 * 60 * 60 * 1000);

describe('addFollowUpEvent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mocked.getCalendarPermissionsAsync.mockResolvedValue({ granted: true });
    mocked.getCalendarsAsync.mockResolvedValue([
      { id: 'cal-1', allowsModifications: true },
    ]);
    mocked.createEventAsync.mockResolvedValue('event-1');
  });

  it('crea el evento en un calendario modificable', async () => {
    const id = await addFollowUpEvent('Ana', date, 'notas');
    expect(id).toBe('event-1');
    const [calendarId, event] = mocked.createEventAsync.mock.calls[0];
    expect(calendarId).toBe('cal-1');
    expect(event.title).toContain('Ana');
    expect(event.startDate).toBe(date);
    expect(event.endDate.getTime()).toBe(date.getTime() + 30 * 60 * 1000);
  });

  it('devuelve null si se niega el permiso', async () => {
    mocked.getCalendarPermissionsAsync.mockResolvedValue({ granted: false });
    mocked.requestCalendarPermissionsAsync.mockResolvedValue({ granted: false });
    const id = await addFollowUpEvent('Ana', date);
    expect(id).toBeNull();
    expect(mocked.createEventAsync).not.toHaveBeenCalled();
  });

  it('devuelve null si no hay calendario disponible', async () => {
    mocked.getCalendarsAsync.mockResolvedValue([]);
    const id = await addFollowUpEvent('Ana', date);
    expect(id).toBeNull();
  });
});
