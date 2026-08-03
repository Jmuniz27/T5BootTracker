import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'follow_ups';

export interface FollowUpRecord {
  id: string; // id local único
  leadId: string;
  leadName: string;
  date: string; // ISO
  notificationId: string | null;
  eventId: string | null;
}

/** Lee todos los seguimientos guardados en el dispositivo (tolerante a datos corruptos). */
export async function getFollowUps(): Promise<FollowUpRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Agrega un seguimiento a la libretita local. */
export async function addFollowUp(record: FollowUpRecord): Promise<void> {
  const list = await getFollowUps();
  list.push(record);
  await AsyncStorage.setItem(KEY, JSON.stringify(list));
}

/** Elimina un seguimiento por id. */
export async function removeFollowUp(id: string): Promise<void> {
  const list = await getFollowUps();
  await AsyncStorage.setItem(KEY, JSON.stringify(list.filter((r) => r.id !== id)));
}

/** Seguimientos futuros (fecha >= ahora), ordenados del más próximo al más lejano. */
export async function getUpcomingFollowUps(now: Date = new Date()): Promise<FollowUpRecord[]> {
  const list = await getFollowUps();
  return list
    .filter((r) => {
      const t = new Date(r.date).getTime();
      return !Number.isNaN(t) && t >= now.getTime();
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}
