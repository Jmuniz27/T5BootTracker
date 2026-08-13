import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors } from '../../../../src/theme/colors';
import { fetchInteractions, updateInteraction } from '../../../../src/api/leads.api';
import type { Interaction } from '../../../../src/types/leads';

// ─── config ──────────────────────────────────────────────────────────────────

// El ícono varía por tipo, pero el círculo usa un color uniforme (navy sobre
// azul claro), igual que el historial del web.
const TYPE_ICON: Record<string, string> = {
  CALL:     'call',
  WHATSAPP: 'logo-whatsapp',
  EMAIL:    'mail',
  VISIT:    'location',
  NOTE:     'create',
};

const TYPES = [
  { value: 'CALL',     icon: 'call-outline' },
  { value: 'WHATSAPP', icon: 'logo-whatsapp' },
  { value: 'EMAIL',    icon: 'mail-outline' },
  { value: 'VISIT',    icon: 'location-outline' },
  { value: 'NOTE',     icon: 'create-outline' },
] as const;

const OUTCOMES = [
  { value: 'CALL_AGAIN',        bg: '#fef9c3', color: '#a16207' },
  { value: 'SEND_INFO',         bg: '#dcfce7', color: '#15803d' },
  { value: 'SCHEDULE_VISIT',    bg: '#dbeafe', color: '#1d4ed8' },
  { value: 'AWAIT_REPLY',       bg: '#f3f4f6', color: '#4b5563' },
  { value: 'SPEAK_COORDINATOR', bg: '#f3e8ff', color: '#7e22ce' },
] as const;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: '2-digit' });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', hour12: true });
}

// ─── edit modal ──────────────────────────────────────────────────────────────

interface EditModalProps {
  leadId: string;
  interaction: Interaction | null;
  onClose: () => void;
  onSaved: () => void;
}

function EditModal({ leadId, interaction, onClose, onSaved }: EditModalProps) {
  const { t } = useTranslation();
  const [type, setType]             = useState(interaction?.interaction_type ?? '');
  const [outcome, setOutcome]       = useState(interaction?.outcome ?? '');
  const [stars, setStars]           = useState<number | null>(interaction?.interest_level ?? null);
  const [notes, setNotes]           = useState(interaction?.notes ?? '');
  const [duration, setDuration]     = useState(interaction?.duration_minutes?.toString() ?? '');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const notesRef = useRef<TextInput>(null);
  const canSave  = type !== '' && outcome !== '' && !loading;

  async function handleSave() {
    if (!interaction || !canSave) return;
    setLoading(true);
    setError(null);
    try {
      await updateInteraction(leadId, interaction.id, {
        interaction_type: type,
        outcome,
        interest_level: stars,
        notes: notes.trim() || undefined,
        duration_minutes: duration ? parseInt(duration, 10) : null,
      });
      onSaved();
    } catch {
      setError(t('leads.history.editError'));
      setLoading(false);
    }
  }

  return (
    <Modal visible={interaction !== null} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={m.screen}>
        {/* Header */}
        <View style={m.header}>
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <Text style={m.cancelText}>{t('common.cancel')}</Text>
          </TouchableOpacity>
          <Text style={m.headerTitle}>{t('leads.history.editTitle')}</Text>
          <TouchableOpacity
            style={[m.saveBtn, !canSave && m.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!canSave}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator size="small" color={colors.white} />
              : <Text style={m.saveBtnText}>{t('leads.history.save')}</Text>
            }
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={m.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

            {/* Tipo */}
            <View style={m.card}>
              <Text style={m.sectionTitle}>{t('leads.history.type')} <Text style={m.required}>*</Text></Text>
              <View style={m.typeGrid}>
                {TYPES.map((ty) => {
                  const active = type === ty.value;
                  return (
                    <TouchableOpacity
                      key={ty.value}
                      style={[m.typeBtn, active && m.typeBtnActive]}
                      onPress={() => setType(ty.value)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name={ty.icon as any} size={18} color={active ? colors.white : colors.textMuted} />
                      <Text style={[m.typeBtnText, active && m.typeBtnTextActive]}>{t(`leads.interactionType.${ty.value}`)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Resultado */}
            <View style={m.card}>
              <Text style={m.sectionTitle}>{t('leads.history.outcome')} <Text style={m.required}>*</Text></Text>
              <View style={m.outcomeList}>
                {OUTCOMES.map((o) => {
                  const active = outcome === o.value;
                  return (
                    <TouchableOpacity
                      key={o.value}
                      style={[m.outcomeRow, active && { borderColor: o.color, backgroundColor: o.bg + '66' }]}
                      onPress={() => setOutcome(o.value)}
                      activeOpacity={0.8}
                    >
                      <View style={[m.radio, active && { borderColor: o.color }]}>
                        {active && <View style={[m.radioDot, { backgroundColor: o.color }]} />}
                      </View>
                      <Text style={[m.outcomeText, active && { color: o.color, fontWeight: '600' }]}>
                        {t(`leads.outcome.${o.value}`)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Interés */}
            <View style={m.card}>
              <Text style={m.sectionTitle}>{t('leads.history.interest')} <Text style={m.optional}>{t('leads.history.optional')}</Text></Text>
              <View style={m.starsRow}>
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
            </View>

            {/* Duración + Notas */}
            <View style={m.card}>
              <View style={{ gap: 10 }}>
                <Text style={m.sectionTitle}>{t('leads.history.duration')} <Text style={m.optional}>{t('leads.history.optional')}</Text></Text>
                <View style={m.durationRow}>
                  <TextInput
                    style={m.durationInput}
                    value={duration}
                    onChangeText={(v) => setDuration(v.replace(/[^0-9]/g, ''))}
                    placeholder="0"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numeric"
                    maxLength={3}
                  />
                  <Text style={m.durationUnit}>{t('leads.history.minutes')}</Text>
                </View>
              </View>
              <View style={m.cardDivider} />
              <View style={{ gap: 10 }}>
                <Text style={m.sectionTitle}>{t('leads.history.notes')} <Text style={m.optional}>{t('leads.history.optional')}</Text></Text>
                <TextInput
                  ref={notesRef}
                  style={m.notesInput}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder={t('leads.history.notesPlaceholder')}
                  placeholderTextColor={colors.textMuted}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
              </View>
            </View>

            {error && (
              <View style={m.errorBox}>
                <Ionicons name="alert-circle-outline" size={16} color="#dc2626" />
                <Text style={m.errorText}>{error}</Text>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── interaction card ─────────────────────────────────────────────────────────

function InteractionCard({ item, onEdit, editable }: { item: Interaction; onEdit: () => void; editable: boolean }) {
  const { t } = useTranslation();
  const icon = TYPE_ICON[item.interaction_type] ?? TYPE_ICON.NOTE;
  const hasStars = item.interest_level != null && item.interest_level > 0;

  return (
    <View style={s.row}>
      {/* Icon circle (uniforme, como el web) */}
      <View style={s.iconCircle}>
        <Ionicons name={icon as any} size={18} color={colors.navy} />
      </View>

      {/* Content */}
      <View style={s.rowBody}>
        {/* Line 1: tipo + estrellas + duración */}
        <View style={s.line1}>
          <Text style={s.typeLabel}>{t(`leads.interactionType.${item.interaction_type}`, item.interaction_type)}</Text>
          {hasStars && (
            <View style={s.inlineMeta}>
              <Ionicons name="star" size={13} color="#f59e0b" />
              <Text style={s.starText}>{item.interest_level}</Text>
            </View>
          )}
          {item.duration_minutes ? (
            <>
              <Text style={s.sep}>|</Text>
              <View style={s.inlineMeta}>
                <Ionicons name="time-outline" size={12} color={colors.textMuted} />
                <Text style={s.durText}>{item.duration_minutes} {t('leads.history.minShort')}</Text>
              </View>
            </>
          ) : null}
        </View>

        {/* Line 2: badges (resultado gris + próxima acción azul) */}
        <View style={s.badgeRow}>
          <View style={s.outcomeBadge}>
            <Text style={s.outcomeText}>{t(`leads.outcome.${item.outcome}`, item.outcome)}</Text>
          </View>
          {item.next_action ? (
            <View style={s.nextBadge}>
              <Text style={s.nextText}>{item.next_action}</Text>
            </View>
          ) : null}
        </View>

        {/* Notes */}
        {item.notes ? <Text style={s.notes} numberOfLines={2}>{item.notes}</Text> : null}
      </View>

      {/* Right: edit + fecha/hora */}
      <View style={s.rowRight}>
        {editable && (
          <TouchableOpacity style={s.editBtn} onPress={onEdit} activeOpacity={0.8}>
            <Ionicons name="pencil" size={13} color={colors.white} />
          </TouchableOpacity>
        )}
        <Text style={s.dateSmall}>{formatDate(item.created_at)}</Text>
        <Text style={s.dateSmall}>{formatTime(item.created_at)}</Text>
      </View>
    </View>
  );
}

// ─── screen ──────────────────────────────────────────────────────────────────

export default function LeadHistoryScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id, status } = useLocalSearchParams<{ id: string; status?: string }>();
  const isConverted = status === 'CONVERTED';

  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [editing, setEditing]           = useState<Interaction | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchInteractions(id);
      setInteractions(data);
      setError(null);
    } catch {
      setError(t('leads.history.loadError'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  return (
    <SafeAreaView style={s.screen}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} hitSlop={8} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>{t('leads.history.title')}</Text>
          {!loading && !error && (
            <Text style={s.headerSub}>{t('leads.history.count', { count: interactions.length })}</Text>
          )}
        </View>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <ActivityIndicator style={s.loader} color={colors.navy} size="large" />
      ) : error ? (
        <View style={s.center}>
          <View style={s.errorBox}>
            <Ionicons name="alert-circle-outline" size={16} color="#dc2626" />
            <Text style={s.errorText}>{error}</Text>
          </View>
          <TouchableOpacity style={s.retryBtn} onPress={load} activeOpacity={0.8}>
            <Text style={s.retryText}>{t('leads.history.retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={interactions}
          keyExtractor={(item) => item.id}
          contentContainerStyle={s.list}
          ListEmptyComponent={
            <View style={s.center}>
              <Ionicons name="time-outline" size={44} color={colors.border} />
              <Text style={s.emptyTitle}>{t('leads.history.emptyTitle')}</Text>
              <Text style={s.emptyText}>{t('leads.history.emptyText')}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <InteractionCard item={item} onEdit={() => setEditing(item)} editable={!isConverted} />
          )}
        />
      )}

      <EditModal
        key={editing?.id ?? 'none'}
        leadId={id}
        interaction={editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); load(); }}
      />
    </SafeAreaView>
  );
}

// ─── styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f8f9fb' },
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
  headerCenter: { flex: 1, alignItems: 'center', gap: 1 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  headerSub: { fontSize: 12, color: colors.textMuted, fontWeight: '500' },
  loader: { marginTop: 80 },
  list: { padding: 16, paddingBottom: 48, gap: 12 },
  // States
  center: { paddingTop: 80, alignItems: 'center', gap: 12, paddingHorizontal: 32 },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fef2f2',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fecaca',
    padding: 12,
    width: '100%',
  },
  errorText: { color: '#dc2626', fontSize: 13, flex: 1 },
  retryBtn: {
    borderWidth: 1.5,
    borderColor: colors.navy,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 9,
  },
  retryText: { color: colors.navy, fontWeight: '600', fontSize: 14 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  emptyText: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
  // Interaction row (flat, estilo web)
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    padding: 12,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rowBody: { flex: 1, gap: 5 },
  line1: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  typeLabel: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  inlineMeta: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  starText: { fontSize: 12, color: '#f59e0b', fontWeight: '700' },
  durText: { fontSize: 12, color: colors.textMuted },
  sep: { fontSize: 12, color: '#d1d5db' },
  badgeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  outcomeBadge: {
    backgroundColor: '#f3f4f6',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  outcomeText: { fontSize: 11, fontWeight: '600', color: '#4b5563' },
  nextBadge: {
    backgroundColor: '#eff6ff',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  nextText: { fontSize: 11, fontWeight: '600', color: '#2563eb' },
  notes: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
  rowRight: { alignItems: 'flex-end', gap: 4, flexShrink: 0 },
  editBtn: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateSmall: { fontSize: 11, color: colors.textMuted },
});

// ─── edit modal styles ────────────────────────────────────────────────────────

const m = StyleSheet.create({
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
  headerTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  cancelText: { color: colors.navy, fontSize: 15, fontWeight: '500' },
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
  body: { padding: 16, gap: 12, paddingBottom: 48 },
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
  starsRow: { flexDirection: 'row', gap: 4, alignItems: 'center' },
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
});
