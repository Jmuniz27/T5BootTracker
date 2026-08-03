import { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../../../src/theme/colors';
import { logInteraction } from '../../../../src/api/leads.api';
import { createMeeting } from '../../../../src/api/meetings.api';
import {
  emptyMeetingForm,
  formToPayload,
  type MeetingFormValues,
} from '../../../../src/lib/meeting-form';
import MeetingFormModal from '../../../../src/components/MeetingFormModal';

// ─── config ──────────────────────────────────────────────────────────────────

const TYPES = [
  { value: 'CALL',     label: 'Llamada',  icon: 'call-outline' },
  { value: 'WHATSAPP', label: 'WhatsApp', icon: 'logo-whatsapp' },
  { value: 'EMAIL',    label: 'Email',    icon: 'mail-outline' },
  { value: 'VISIT',    label: 'Visita',   icon: 'location-outline' },
  { value: 'NOTE',     label: 'Nota',     icon: 'create-outline' },
] as const;

const OUTCOMES = [
  { value: 'CALL_AGAIN',        label: 'Llamar de nuevo',       bg: '#fef9c3', color: '#a16207' },
  { value: 'SEND_INFO',         label: 'Enviar información',    bg: '#dcfce7', color: '#15803d' },
  { value: 'SCHEDULE_VISIT',    label: 'Agendar visita',        bg: '#dbeafe', color: '#1d4ed8' },
  { value: 'AWAIT_REPLY',       label: 'Esperar respuesta',     bg: '#f3f4f6', color: '#4b5563' },
  { value: 'SPEAK_COORDINATOR', label: 'Hablar coordinador',    bg: '#f3e8ff', color: '#7e22ce' },
] as const;

// ─── shared form components ───────────────────────────────────────────────────

function SectionCard({ children }: { children: React.ReactNode }) {
  return <View style={s.card}>{children}</View>;
}

function SectionTitle({ children, required, optional }: {
  children: string;
  required?: boolean;
  optional?: boolean;
}) {
  return (
    <Text style={s.sectionTitle}>
      {children}
      {required && <Text style={s.required}> *</Text>}
      {optional && <Text style={s.optional}> (opcional)</Text>}
    </Text>
  );
}

// ─── screen ──────────────────────────────────────────────────────────────────

export default function LogInteractionScreen() {
  const router = useRouter();
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const leadName = name || 'tu lead';

  const [type, setType]             = useState<string | null>(null);
  const [outcome, setOutcome]       = useState<string | null>(null);
  const [stars, setStars]           = useState<number | null>(null);
  const [notes, setNotes]           = useState('');
  const [duration, setDuration]     = useState('');
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [meetingSaving, setMeetingSaving] = useState(false);
  const [meetingScheduled, setMeetingScheduled] = useState(false);
  const [meetingInitial, setMeetingInitial] = useState<MeetingFormValues>(emptyMeetingForm());
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const toastOpacity = useRef(new Animated.Value(0)).current;
  const canSubmit = type !== null && outcome !== null && !loading;

  function openMeeting() {
    const f = emptyMeetingForm();
    f.title = `Seguimiento: ${leadName}`;
    f.lead = id;
    f.leadName = leadName;
    f.description = notes.trim();
    setMeetingInitial(f);
    setMeetingOpen(true);
  }

  async function handleSaveMeeting(values: MeetingFormValues) {
    const payload = formToPayload(values);
    if (!payload) return;
    setMeetingSaving(true);
    try {
      await createMeeting(payload);
      setMeetingOpen(false);
      setMeetingScheduled(true);
    } catch {
      setError('No pudimos agendar la reunión. Intenta de nuevo.');
    } finally {
      setMeetingSaving(false);
    }
  }

  function showToast() {
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(1600),
      Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => router.back());
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      await logInteraction(id, {
        interaction_type: type!,
        outcome: outcome!,
        interest_level: stars,
        notes: notes.trim() || undefined,
        duration_minutes: duration ? parseInt(duration, 10) : null,
      });

      showToast();
    } catch {
      setError('No pudimos guardar la interacción. Intenta de nuevo.');
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={s.screen}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} hitSlop={8} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>Registrar interacción</Text>
        </View>
        <TouchableOpacity
          style={[s.saveBtn, !canSubmit && s.saveBtnDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator size="small" color={colors.white} />
            : <Text style={s.saveBtnText}>Guardar</Text>
          }
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={s.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Tipo */}
          <SectionCard>
            <SectionTitle required>Tipo de interacción</SectionTitle>
            <View style={s.typeGrid}>
              {TYPES.map((t) => {
                const active = type === t.value;
                return (
                  <TouchableOpacity
                    key={t.value}
                    style={[s.typeBtn, active && s.typeBtnActive]}
                    onPress={() => setType(t.value)}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={t.icon as any}
                      size={18}
                      color={active ? colors.white : colors.textMuted}
                    />
                    <Text style={[s.typeBtnText, active && s.typeBtnTextActive]}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </SectionCard>

          {/* Resultado */}
          <SectionCard>
            <SectionTitle required>Resultado</SectionTitle>
            <View style={s.outcomeList}>
              {OUTCOMES.map((o) => {
                const active = outcome === o.value;
                return (
                  <TouchableOpacity
                    key={o.value}
                    style={[s.outcomeRow, active && { borderColor: o.color, backgroundColor: o.bg + '66' }]}
                    onPress={() => setOutcome(o.value)}
                    activeOpacity={0.8}
                  >
                    <View style={[s.radio, active && { borderColor: o.color }]}>
                      {active && <View style={[s.radioDot, { backgroundColor: o.color }]} />}
                    </View>
                    <Text style={[s.outcomeText, active && { color: o.color, fontWeight: '600' }]}>
                      {o.label}
                    </Text>
                    {active && (
                      <View style={[s.outcomeBadge, { backgroundColor: o.bg }]}>
                        <Text style={[s.outcomeBadgeText, { color: o.color }]}>{o.label}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </SectionCard>

          {/* Nivel de interés */}
          <SectionCard>
            <SectionTitle optional>Nivel de interés</SectionTitle>
            <View style={s.starsRow}>
              {[1, 2, 3, 4, 5].map((n) => (
                <TouchableOpacity key={n} hitSlop={8} onPress={() => setStars(stars === n ? null : n)} activeOpacity={0.7}>
                  <Ionicons
                    name="star"
                    size={28}
                    color={stars !== null && n <= stars ? '#3b82f6' : '#d1d5db'}
                  />
                </TouchableOpacity>
              ))}
            </View>
          </SectionCard>

          {/* Duración + Notas en el mismo card */}
          <SectionCard>
            <View style={s.durationSection}>
              <SectionTitle optional>Duración</SectionTitle>
              <View style={s.durationRow}>
                <TextInput
                  style={s.durationInput}
                  value={duration}
                  onChangeText={(v) => setDuration(v.replace(/[^0-9]/g, ''))}
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                  maxLength={3}
                />
                <Text style={s.durationUnit}>minutos</Text>
              </View>
            </View>

            <View style={s.cardDivider} />

            <View style={{ gap: 10 }}>
              <SectionTitle optional>Notas</SectionTitle>
              <TextInput
                style={s.notesInput}
                value={notes}
                onChangeText={setNotes}
                placeholder="¿Cómo fue la interacción?"
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>
          </SectionCard>

          {/* Agendar próxima reunión con el lead */}
          <SectionCard>
            <View style={s.followUpHeader}>
              <Ionicons name="calendar-outline" size={16} color={colors.navy} />
              <Text style={s.sectionTitle}>Agendar próxima reunión</Text>
              <Text style={s.optional}>(opcional)</Text>
            </View>
            <Text style={s.followUpHint}>
              Aparece en tu Agenda y se sincroniza con Google Calendar.
            </Text>

            {meetingScheduled ? (
              <View style={s.selectedRow}>
                <Ionicons name="checkmark-circle" size={16} color="#16a34a" />
                <Text style={s.selectedText}>Reunión agendada</Text>
                <TouchableOpacity onPress={openMeeting} hitSlop={8}>
                  <Text style={s.selectedEdit}>Otra</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={s.scheduleBtn} onPress={openMeeting} activeOpacity={0.85}>
                <Ionicons name="add" size={18} color={colors.navy} />
                <Text style={s.scheduleBtnText}>Agendar reunión</Text>
              </TouchableOpacity>
            )}
          </SectionCard>

          {error && (
            <View style={s.errorBox}>
              <Ionicons name="alert-circle-outline" size={16} color="#dc2626" />
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <Animated.View style={[s.toast, { opacity: toastOpacity }]}>
        <Ionicons name="checkmark-circle" size={18} color={colors.white} />
        <Text style={s.toastText}>Interacción guardada</Text>
      </Animated.View>

      <MeetingFormModal
        visible={meetingOpen}
        initial={meetingInitial}
        editingId={null}
        leads={[{ id, name: leadName }]}
        saving={meetingSaving}
        deleting={false}
        onSave={handleSaveMeeting}
        onDelete={() => {}}
        onClose={() => setMeetingOpen(false)}
      />
    </SafeAreaView>
  );
}

// ─── styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f8f9fb' },
  scheduleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#eff2fb',
    borderRadius: 12,
    paddingVertical: 13,
  },
  scheduleBtnText: { fontSize: 14, fontWeight: '700', color: colors.navy },
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
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
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  saveBtn: {
    backgroundColor: colors.navy,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 76,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { color: colors.white, fontWeight: '700', fontSize: 14 },
  // Body
  body: { padding: 16, gap: 12, paddingBottom: 48 },
  // Section card
  card: {
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 12,
  },
  cardDivider: { height: 1, backgroundColor: '#f3f4f6' },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  required: { color: '#dc2626' },
  optional: { fontSize: 13, fontWeight: '400', color: colors.textMuted },
  // Type grid
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: '#f8f9fb',
  },
  typeBtnActive: { backgroundColor: colors.navy, borderColor: colors.navy },
  typeBtnText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  typeBtnTextActive: { color: colors.white },
  // Outcome
  outcomeList: { gap: 8 },
  outcomeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: '#f8f9fb',
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  outcomeText: { flex: 1, fontSize: 14, color: colors.textMuted, fontWeight: '500' },
  outcomeBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  outcomeBadgeText: { fontSize: 11, fontWeight: '700' },
  // Stars
  starsRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  // Duration
  durationSection: { gap: 10 },
  durationRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  durationInput: {
    backgroundColor: '#f8f9fb',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    width: 80,
    textAlign: 'center',
  },
  durationUnit: { fontSize: 14, color: colors.textMuted, fontWeight: '500' },
  // Notes
  notesInput: {
    backgroundColor: '#f8f9fb',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.textPrimary,
    minHeight: 110,
  },
  // Follow-up reminder
  followUpHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  followUpHint: { fontSize: 12, color: colors.textMuted, marginTop: -4 },
  followUpChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  followUpChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: '#f8f9fb',
  },
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#eff2fb',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  selectedText: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.navy },
  selectedEdit: { fontSize: 13, fontWeight: '700', color: colors.navy, textDecorationLine: 'underline' },
  followUpChipActive: { backgroundColor: colors.navy, borderColor: colors.navy },
  followUpChipText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  followUpChipTextActive: { color: colors.white },
  calRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 4 },
  calRowText: { fontSize: 13, color: colors.textMuted, fontWeight: '500', flex: 1 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  // Error
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fef2f2',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fecaca',
    padding: 12,
  },
  errorText: { color: '#dc2626', fontSize: 13, flex: 1 },
  // Toast
  toast: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#16a34a',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 13,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 6,
  },
  toastText: { color: colors.white, fontWeight: '600', fontSize: 14 },
});
