import { presetToDate, scheduleFollowUp } from '../follow-up';
import { scheduleFollowUpReminder } from '../notifications';
import { addFollowUpEvent } from '../calendar';

jest.mock('../notifications', () => ({ scheduleFollowUpReminder: jest.fn() }));
jest.mock('../calendar', () => ({ addFollowUpEvent: jest.fn() }));

const mockedNotif = scheduleFollowUpReminder as jest.Mock;
const mockedCal = addFollowUpEvent as jest.Mock;

describe('presetToDate', () => {
  it('suma los días y fija la hora a las 9:00', () => {
    const from = new Date('2026-07-27T15:30:00');
    const out = presetToDate(3, from);
    expect(out.getFullYear()).toBe(2026);
    expect(out.getMonth()).toBe(6); // julio
    expect(out.getDate()).toBe(30);
    expect(out.getHours()).toBe(9);
    expect(out.getMinutes()).toBe(0);
  });
});

describe('scheduleFollowUp', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedNotif.mockResolvedValue('notif-1');
    mockedCal.mockResolvedValue('event-1');
  });

  it('programa push y calendario cuando addToCalendar es true', async () => {
    const date = new Date();
    const res = await scheduleFollowUp({ leadName: 'Ana', date, addToCalendar: true });
    expect(mockedNotif).toHaveBeenCalledWith('Ana', date);
    expect(mockedCal).toHaveBeenCalledWith('Ana', date, undefined);
    expect(res).toEqual({ notificationId: 'notif-1', eventId: 'event-1' });
  });

  it('omite el calendario cuando addToCalendar es false', async () => {
    const res = await scheduleFollowUp({ leadName: 'Ana', date: new Date(), addToCalendar: false });
    expect(mockedCal).not.toHaveBeenCalled();
    expect(res.eventId).toBeNull();
  });

  it('no lanza si un canal falla', async () => {
    mockedNotif.mockRejectedValue(new Error('boom'));
    const res = await scheduleFollowUp({ leadName: 'Ana', date: new Date(), addToCalendar: false });
    expect(res.notificationId).toBeNull();
  });
});
