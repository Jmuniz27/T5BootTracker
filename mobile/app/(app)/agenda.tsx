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
import { useTranslation } from 'react-i18next';
import { colors } from '../../src/theme/colors';
import { useAuth } from '../../src/context/AuthContext';
import { FadeInView } from '../../src/components/FadeInView';
import { fetchLeads } from '../../src/api/leads.api';
import {
  getMeetings,
  createMeeting,
  updateMeeting,
  deleteMeeting,
  type Meeting,
} from '../../src/api/meetings.api';
import { buildMarkedDates, followUpsForDay } from '../../src/lib/agenda-helpers';
import {
  emptyMeetingForm,
  meetingToForm,
  formToPayload,
  type MeetingFormValues,
} from '../../src/lib/meeting-form';
import MeetingFormModal from '../../src/components/MeetingFormModal';

interface LeadOption { id: string; name: string; }

// Meeting + campo `date` para reusar los helpers de la agenda.
type Dated = Meeting & { date: string };

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
}

export default function AgendaScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  function prettyDate(key: string): string {
    const [y, m, d] = key.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    if (key === todayKey()) return t('agenda.today');
    return date.toLocaleDateString('es-EC', { weekday: 'long', day: '2-digit', month: 'short' });
  }

  const { user } = useAuth();
  const isSalesperson = user?.role === 'SALESPERSON';
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [leads, setLeads] = useState<LeadOption[]>([]);
  const [selected, setSelected] = useState<string>(todayKey());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formInitial, setFormInitial] = useState<MeetingFormValues>(emptyMeetingForm());
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [ms, leadData] = await Promise.all([getMeetings(), fetchLeads()]);
      setMeetings(ms);
      setLeads([...leadData.my_leads, ...leadData.available_leads].map((l) => ({ id: l.id, name: l.name })));
      setError(null);
    } catch {
      setError(t('agenda.loadError'));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!isSalesperson) {
        setLoading(false);
        return;
      }
      let active = true;
      load().finally(() => {
        if (active) setLoading(false);
      });
      return () => {
        active = false;
      };
    }, [load, isSalesperson]),
  );

  const records: Dated[] = meetings.map((m) => ({ ...m, date: m.start_time }));
  const marked = buildMarkedDates(records, selected);
  const dayItems = followUpsForDay(records, selected) as Dated[];
  const leadNameById = Object.fromEntries(leads.map((l) => [l.id, l.name]));

  function openCreate() {
    const base = emptyMeetingForm();
    const [y, m, d] = selected.split('-').map(Number);
    base.start = new Date(y, m - 1, d, base.start.getHours(), 0, 0, 0);
    base.end = new Date(base.start.getTime() + 30 * 60 * 1000);
    setEditingId(null);
    setFormInitial(base);
    setModalOpen(true);
  }

  function openEdit(m: Meeting) {
    setEditingId(m.id);
    setFormInitial(meetingToForm(m, leadNameById[m.lead] ?? ''));
    setModalOpen(true);
  }

  async function handleSave(values: MeetingFormValues) {
    const payload = formToPayload(values);
    if (!payload) return;
    setSaving(true);
    try {
      if (editingId) await updateMeeting(editingId, payload);
      else await createMeeting(payload);
      setModalOpen(false);
      await load();
    } catch {
      setError(t('agenda.saveError'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editingId) return;
    setDeleting(true);
    try {
      await deleteMeeting(editingId);
      setModalOpen(false);
      await load();
    } catch {
      setError(t('agenda.deleteError'));
    } finally {
      setDeleting(false);
    }
  }

  // La agenda es una herramienta del vendedor; Finanzas gestiona cobro, no
  // seguimiento comercial con visitas agendadas. Mismo criterio que
  // SalespersonRoute en web.
  if (!isSalesperson) {
    return (
      <SafeAreaView style={st.screen}>
        <View style={st.restrictedCard}>
          <Ionicons name="lock-closed-outline" size={40} color={colors.navy} />
          <Text style={st.restrictedTitle}>{t('agenda.restrictedTitle')}</Text>
          <Text style={st.restrictedMsg}>
            {t('agenda.restrictedMsg')}
          </Text>
          <TouchableOpacity style={st.restrictedBtn} onPress={() => router.back()} activeOpacity={0.85}>
            <Text style={st.restrictedBtnText}>{t('agenda.back')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <FadeInView style={st.screen}>
    <SafeAreaView style={st.screen}>
      <View style={st.header}>
        <TouchableOpacity style={st.backBtn} hitSlop={8} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={st.headerTitle}>{t('agenda.title')}</Text>
        <TouchableOpacity style={st.newBtn} onPress={openCreate} activeOpacity={0.85}>
          <Ionicons name="add" size={20} color={colors.white} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={st.loader} color={colors.navy} size="large" />
      ) : (
        <ScrollView contentContainerStyle={st.body}>
          {error ? <Text style={st.error}>{error}</Text> : null}

          <View style={st.calendarCard}>
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
              }}
            />
          </View>

          <Text style={st.sectionTitle}>{prettyDate(selected).toUpperCase()}</Text>

          {dayItems.length === 0 ? (
            <View style={st.emptyDay}>
              <Ionicons name="calendar-clear-outline" size={28} color={colors.border} />
              <Text style={st.emptyText}>{t('agenda.emptyDay')}</Text>
            </View>
          ) : (
            dayItems.map((item) => (
              <TouchableOpacity key={item.id} style={st.row} activeOpacity={0.7} onPress={() => openEdit(item)}>
                <View style={st.timePill}>
                  <Ionicons name="time-outline" size={13} color={colors.navy} />
                  <Text style={st.timeText}>{timeLabel(item.start_time)}</Text>
                </View>
                <View style={st.rowInfo}>
                  <Text style={st.rowTitle} numberOfLines={1}>{item.title || t('agenda.meeting')}</Text>
                  <Text style={st.rowLead} numberOfLines={1}>{leadNameById[item.lead] ?? ''}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.border} />
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}

      <MeetingFormModal
        visible={modalOpen}
        initial={formInitial}
        editingId={editingId}
        leads={leads}
        saving={saving}
        deleting={deleting}
        onSave={handleSave}
        onDelete={handleDelete}
        onClose={() => setModalOpen(false)}
      />
    </SafeAreaView>
    </FadeInView>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f8f9fb' },
  restrictedCard: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 28,
    gap: 12,
  },
  restrictedTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  restrictedMsg: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  restrictedBtn: {
    marginTop: 8,
    backgroundColor: colors.navy,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  restrictedBtnText: { color: colors.white, fontWeight: '700', fontSize: 14 },
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
  newBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loader: { marginTop: 60 },
  body: { padding: 16, paddingBottom: 40 },
  error: {
    color: colors.error,
    fontSize: 13,
    backgroundColor: '#fef2f2',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
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
  rowTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  rowLead: { fontSize: 12, color: colors.textMuted },
});
