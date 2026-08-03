import { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Calendar } from 'react-native-calendars';
import { colors } from '../../src/theme/colors';
import { getFollowUps, type FollowUpRecord } from '../../src/lib/follow-up-store';
import { buildMarkedDates, followUpsForDay } from '../../src/lib/agenda-helpers';

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
}

// 'YYYY-MM-DD' → "Hoy" / "jueves 30 jul".
function prettyDate(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (key === todayKey()) return 'Hoy';
  return date.toLocaleDateString('es-EC', { weekday: 'long', day: '2-digit', month: 'short' });
}

export default function AgendaScreen() {
  const router = useRouter();
  const [records, setRecords] = useState<FollowUpRecord[]>([]);
  const [selected, setSelected] = useState<string>(todayKey());
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getFollowUps()
        .then((r) => {
          if (active) setRecords(r);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }, []),
  );

  const marked = buildMarkedDates(records, selected);
  const dayItems = followUpsForDay(records, selected);

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
        <ScrollView contentContainerStyle={s.body}>
          <View style={s.calendarCard}>
            <Calendar
              current={selected}
              firstDay={1}
              markedDates={marked}
              onDayPress={(day: { dateString: string }) => setSelected(day.dateString)}
              theme={{
                todayTextColor: colors.navy,
                arrowColor: colors.navy,
                selectedDayBackgroundColor: colors.navy,
                selectedDayTextColor: '#ffffff',
                dotColor: colors.navy,
                textMonthFontWeight: '700',
                textDayFontSize: 14,
                textMonthFontSize: 16,
              }}
            />
          </View>

          <Text style={s.sectionTitle}>{prettyDate(selected).toUpperCase()}</Text>

          {dayItems.length === 0 ? (
            <View style={s.emptyDay}>
              <Ionicons name="calendar-clear-outline" size={28} color={colors.border} />
              <Text style={s.emptyText}>Sin seguimientos este día</Text>
            </View>
          ) : (
            dayItems.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={s.row}
                activeOpacity={0.7}
                onPress={() =>
                  router.push({ pathname: '/(app)/leads/[id]/history', params: { id: item.leadId } })
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
            ))
          )}
        </ScrollView>
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
  body: { padding: 16, paddingBottom: 40 },
  calendarCard: {
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 8,
    marginBottom: 16,
    overflow: 'hidden',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  emptyDay: { paddingVertical: 32, alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 13, color: colors.textMuted },
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
});
