import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  addFollowUp,
  getFollowUps,
  removeFollowUp,
  getUpcomingFollowUps,
  type FollowUpRecord,
} from '../follow-up-store';

// AsyncStorage se mockea globalmente en jest.setup.js.

const rec = (over: Partial<FollowUpRecord>): FollowUpRecord => ({
  id: 'r1',
  leadId: 'lead-1',
  leadName: 'Ana',
  date: new Date(Date.now() + 86_400_000).toISOString(),
  notificationId: null,
  eventId: null,
  ...over,
});

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('follow-up-store', () => {
  it('agrega y lee seguimientos', async () => {
    await addFollowUp(rec({ id: 'a' }));
    await addFollowUp(rec({ id: 'b' }));
    const all = await getFollowUps();
    expect(all.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('elimina por id', async () => {
    await addFollowUp(rec({ id: 'a' }));
    await addFollowUp(rec({ id: 'b' }));
    await removeFollowUp('a');
    const all = await getFollowUps();
    expect(all.map((r) => r.id)).toEqual(['b']);
  });

  it('getUpcoming filtra pasados y ordena por fecha', async () => {
    const now = new Date('2026-07-27T12:00:00Z');
    const past = new Date('2026-07-20T09:00:00Z').toISOString();
    const soon = new Date('2026-07-28T09:00:00Z').toISOString();
    const later = new Date('2026-07-30T09:00:00Z').toISOString();
    await addFollowUp(rec({ id: 'later', date: later }));
    await addFollowUp(rec({ id: 'past', date: past }));
    await addFollowUp(rec({ id: 'soon', date: soon }));

    const upcoming = await getUpcomingFollowUps(now);
    expect(upcoming.map((r) => r.id)).toEqual(['soon', 'later']);
  });

  it('devuelve [] si el storage está corrupto', async () => {
    await AsyncStorage.setItem('follow_ups', 'no-es-json{');
    expect(await getFollowUps()).toEqual([]);
  });
});
