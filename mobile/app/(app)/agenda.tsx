import { useState, useCallback } from 'react';
import {
  View,
  Text,
  SectionList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { getUpcomingFollowUps, type FollowUpRecord } from '../../src/lib/follow-up-store';

interface Section {
  title: string;
  data: FollowUpRecord[];
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

// Etiqueta de día: Hoy / Mañana / "jueves 30 jul".
function dayLabel(iso: string): string {
  const date = new Date(iso);
  const today = startOfDay(new Date());
  const target = startOfDay(date);
  const diffDays = Math.round((target - today) / 86_400_000);
  if (diffDays === 0) return 'Hoy';
  if (diffDays === 1) return 'Mañana';
  return date.toLocaleDateString('es-EC', { weekday: 'long', day: '2-digit', month: 'short' });
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
}

function groupByDay(records: FollowUpRecord[]): Section[] {
  const sections: Section[] = [];
  for (const record of records) {
    const title = dayLabel(record.date);
    const last = sections[sections.length - 1];
    if (last && last.title === title) last.data.push(record);
    else sections.push({ title, data: [record] });
  }
  return sections;
}

export default function AgendaScreen() {
  const router = useRouter();
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getUpcomingFollowUps()
        .then((records) => {
          if (active) setSections(groupByDay(records));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }, []),
  );

  return (
    <SafeAreaView style={s.screen}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} hitSlop={8} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Agenda</Text>
        <View style={s.backBtn} />
      </View>

      {loading ? (
        <ActivityIndicator style={s.loader} color={colors.navy} size="large" />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={s.list}
          renderSectionHeader={({ section }) => (
            <Text style={s.sectionTitle}>{section.title.toUpperCase()}</Text>
          )}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={s.row}
              activeOpacity={0.7}
              onPress={() =>
                router.push({
                  pathname: '/(app)/leads/[id]/history',
                  params: { id: item.leadId },
                })
              }
            >
              <View style={s.timePill}>
                <Ionicons name="time-outline" size={13} color={colors.navy} />
                <Text style={s.timeText}>{timeLabel(item.date)}</Text>
              </View>
              <View style={s.rowInfo}>
                <Text style={s.rowTitle}>Seguimiento</Text>
                <Text style={s.rowLead} numberOfLines={1}>{item.leadName}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.border} />
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={s.empty}>
              <Ionicons name="calendar-outline" size={40} color={colors.border} />
              <Text style={s.emptyTitle}>Sin seguimientos</Text>
              <Text style={s.emptyText}>
                Agenda un recordatorio al registrar una interacción y aparecerá aquí.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f8f9fb' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  loader: { marginTop: 60 },
  list: { padding: 16, paddingBottom: 40 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginTop: 12,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 8,
  },
  timePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#eff2fb',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  timeText: { fontSize: 12, fontWeight: '700', color: colors.navy },
  rowInfo: { flex: 1 },
  rowTitle: { fontSize: 12, color: colors.textMuted, fontWeight: '500' },
  rowLead: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  empty: { paddingVertical: 64, alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  emptyText: { fontSize: 13, color: colors.textMuted, textAlign: 'center', paddingHorizontal: 32 },
});
