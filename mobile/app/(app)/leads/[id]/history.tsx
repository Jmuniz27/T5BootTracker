import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Modal,
  TextInput,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../../../src/theme/colors';
import { fetchInteractions, updateInteraction } from '../../../../src/api/leads.api';
import type { Interaction } from '../../../../src/types/leads';

// ─── config ──────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  CALL:     { label: 'Llamada',  icon: 'call',          color: '#3b82f6' },
  WHATSAPP: { label: 'WhatsApp', icon: 'logo-whatsapp', color: '#22c55e' },
  EMAIL:    { label: 'Email',    icon: 'mail',          color: '#8b5cf6' },
  VISIT:    { label: 'Visita',   icon: 'location',      color: '#f59e0b' },
  NOTE:     { label: 'Nota',     icon: 'create',        color: '#6b7280' },
};

const OUTCOME_LABEL: Record<string, string> = {
  INTERESTED:        'Interesado',
  NOT_INTERESTED:    'No interesado',
  NO_ANSWER:         'No contestó',
  CALLBACK:          'Llamar después',
  SPEAK_COORDINATOR: 'Hablar coordinador',
};

const TYPES = [
  { value: 'CALL',      label: 'Llamada',  icon: 'call-outline' },
  { value: 'WHATSAPP',  label: 'WhatsApp', icon: 'logo-whatsapp' },
  { value: 'EMAIL',     label: 'Email',    icon: 'mail-outline' },
  { value: 'VISIT',     label: 'Visita',   icon: 'location-outline' },
  { value: 'NOTE',      label: 'Nota',     icon: 'create-outline' },
] as const;

const OUTCOMES = [
  { value: 'INTERESTED',        label: 'Interesado' },
  { value: 'NOT_INTERESTED',    label: 'No interesado' },
  { value: 'NO_ANSWER',         label: 'No contestó' },
  { value: 'CALLBACK',          label: 'Llamar después' },
  { value: 'SPEAK_COORDINATOR', label: 'Hablar coordinador' },
] as const;

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('es-EC', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── edit modal ──────────────────────────────────────────────────────────────

interface EditModalProps {
  leadId: string;
  interaction: Interaction | null;
  onClose: () => void;
  onSaved: () => void;
}

function EditModal({ leadId, interaction, onClose, onSaved }: EditModalProps) {
  const [type, setType]       = useState(interaction?.interaction_type ?? '');
  const [outcome, setOutcome] = useState(interaction?.outcome ?? '');
  const [stars, setStars]     = useState<number | null>(interaction?.interest_level ?? null);
  const [notes, setNotes]     = useState(interaction?.notes ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const canSave = type !== '' && outcome !== '' && !loading;

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
      });
      onSaved();
    } catch {
      setError('No pudimos guardar los cambios. Intenta de nuevo.');
      setLoading(false);
    }
  }

  return (
    <Modal visible={interaction !== null} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={modal.screen}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          {/* Header */}
          <View style={modal.header}>
            <TouchableOpacity hitSlop={8} onPress={onClose}>
              <Text style={modal.cancelText}>Cancelar</Text>
            </TouchableOpacity>
            <Text style={modal.headerTitle}>Editar interacción</Text>
            <TouchableOpacity
              style={[modal.saveBtn, !canSave && modal.saveBtnDisabled]}
              onPress={handleSave}
              disabled={!canSave}
            >
              {loading
                ? <ActivityIndicator size="small" color={colors.white} />
                : <Text style={modal.saveBtnText}>Guardar</Text>
              }
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={modal.body} keyboardShouldPersistTaps="handled">
            {/* Tipo */}
            <View style={modal.section}>
              <Text style={modal.sectionLabel}>Tipo <Text style={modal.required}>*</Text></Text>
              <View style={modal.typeGrid}>
                {TYPES.map((t) => {
                  const active = type === t.value;
                  return (
                    <TouchableOpacity
                      key={t.value}
                      style={[modal.typeBtn, active && modal.typeBtnActive]}
                      onPress={() => setType(t.value)}
                    >
                      <Ionicons name={t.icon as any} size={18} color={active ? colors.white : colors.textMuted} />
                      <Text style={[modal.typeBtnText, active && modal.typeBtnTextActive]}>{t.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Resultado */}
            <View style={modal.section}>
              <Text style={modal.sectionLabel}>Resultado <Text style={modal.required}>*</Text></Text>
              <View style={modal.outcomeList}>
                {OUTCOMES.map((o) => {
                  const active = outcome === o.value;
                  return (
                    <TouchableOpacity
                      key={o.value}
                      style={[modal.outcomeBtn, active && modal.outcomeBtnActive]}
                      onPress={() => setOutcome(o.value)}
                    >
                      <View style={[modal.radio, active && modal.radioActive]}>
                        {active && <View style={modal.radioDot} />}
                      </View>
                      <Text style={[modal.outcomeBtnText, active && modal.outcomeBtnTextActive]}>{o.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Estrellas */}
            <View style={modal.section}>
              <Text style={modal.sectionLabel}>Nivel de interés <Text style={modal.optional}>(opcional)</Text></Text>
              <View style={modal.starsRow}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <TouchableOpacity key={n} hitSlop={6} onPress={() => setStars(stars === n ? null : n)}>
                    <Ionicons
                      name={stars !== null && n <= stars ? 'star' : 'star-outline'}
                      size={30}
                      color={stars !== null && n <= stars ? '#f59e0b' : colors.border}
                    />
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Notas */}
            <View style={modal.section}>
              <Text style={modal.sectionLabel}>Notas <Text style={modal.optional}>(opcional)</Text></Text>
              <TextInput
                style={modal.notesInput}
                value={notes}
                onChangeText={setNotes}
                placeholder="Notas de la interacción..."
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>

            {error && <Text style={modal.errorText}>{error}</Text>}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── interaction card ────────────────────────────────────────────────────────

function InteractionCard({ item, onEdit }: { item: Interaction; onEdit: () => void }) {
  const cfg = TYPE_CONFIG[item.interaction_type] ?? TYPE_CONFIG.NOTE;
  return (
    <View style={styles.card}>
      <View style={styles.cardLeft}>
        <View style={[styles.typeIcon, { backgroundColor: cfg.color + '20' }]}>
          <Ionicons name={cfg.icon as any} size={18} color={cfg.color} />
        </View>
        <View style={styles.timeline} />
      </View>

      <View style={styles.cardContent}>
        <View style={styles.cardHeader}>
          <Text style={styles.typeLabel}>{cfg.label}</Text>
          <Text style={styles.cardDate}>{formatDate(item.created_at)}</Text>
        </View>

        <View style={styles.outcomePill}>
          <Text style={styles.outcomeText}>{OUTCOME_LABEL[item.outcome] ?? item.outcome}</Text>
        </View>

        {item.interest_level !== null && (
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Ionicons
                key={n}
                name={n <= (item.interest_level ?? 0) ? 'star' : 'star-outline'}
                size={13}
                color={n <= (item.interest_level ?? 0) ? '#f59e0b' : colors.border}
              />
            ))}
          </View>
        )}

        {item.notes ? <Text style={styles.notes}>{item.notes}</Text> : null}

        <View style={styles.cardFooter}>
          <Text style={styles.salesperson}>{item.salesperson_name}</Text>
          <TouchableOpacity style={styles.editBtn} onPress={onEdit}>
            <Ionicons name="pencil-outline" size={13} color={colors.navy} />
            <Text style={styles.editBtnText}>Editar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ─── screen ──────────────────────────────────────────────────────────────────

export default function LeadHistoryScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [editing, setEditing]           = useState<Interaction | null>(null);

  async function load() {
    try {
      const data = await fetchInteractions(id);
      setInteractions(data);
      setError(null);
    } catch {
      setError('No pudimos cargar el historial. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity hitSlop={8} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Historial</Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.navy} size="large" />
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={load} style={styles.retryBtn}>
            <Text style={styles.retryText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={interactions}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="time-outline" size={40} color={colors.textMuted} />
              <Text style={styles.emptyText}>Sin interacciones registradas.</Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <InteractionCard
              item={item}
              onEdit={() => setEditing(item)}
            />
          )}
        />
      )}

      <EditModal
        leadId={id}
        interaction={editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); load(); }}
      />
    </SafeAreaView>
  );
}

// ─── styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  loader: { marginTop: 80 },
  list: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 },
  errorText: { color: '#dc2626', fontSize: 13, textAlign: 'center' },
  retryBtn: {
    borderWidth: 1, borderColor: colors.navy, borderRadius: 8,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  retryText: { color: colors.navy, fontWeight: '600', fontSize: 13 },
  emptyText: { fontSize: 14, color: colors.textMuted },
  // Card
  card: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 4,
  },
  cardLeft: {
    alignItems: 'center',
    width: 36,
  },
  typeIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeline: {
    flex: 1,
    width: 2,
    backgroundColor: colors.border,
    marginTop: 4,
    marginBottom: -4,
    minHeight: 16,
  },
  cardContent: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  typeLabel: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  cardDate: { fontSize: 12, color: colors.textMuted },
  outcomePill: {
    alignSelf: 'flex-start',
    backgroundColor: '#f3f4f6',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  outcomeText: { fontSize: 12, color: '#6b7280', fontWeight: '600' },
  starsRow: { flexDirection: 'row', gap: 2 },
  notes: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  salesperson: { fontSize: 12, color: colors.textMuted },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.navy,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  editBtnText: { fontSize: 12, color: colors.navy, fontWeight: '600' },
});

const modal = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  cancelText: { color: colors.navy, fontSize: 15 },
  saveBtn: {
    backgroundColor: colors.navy,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
    minWidth: 72,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { color: colors.white, fontWeight: '700', fontSize: 14 },
  body: { padding: 16, gap: 24, paddingBottom: 40 },
  section: { gap: 10 },
  sectionLabel: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  required: { color: '#dc2626' },
  optional: { fontWeight: '400', color: colors.textMuted, fontSize: 13 },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 10, borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.white,
  },
  typeBtnActive: { backgroundColor: colors.navy, borderColor: colors.navy },
  typeBtnText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  typeBtnTextActive: { color: colors.white },
  outcomeList: { gap: 8 },
  outcomeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.white, borderRadius: 10,
    borderWidth: 1.5, borderColor: colors.border,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  outcomeBtnActive: { borderColor: colors.navy, backgroundColor: '#f0f4ff' },
  radio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  radioActive: { borderColor: colors.navy },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.navy },
  outcomeBtnText: { fontSize: 14, color: colors.textMuted, fontWeight: '500' },
  outcomeBtnTextActive: { color: colors.textPrimary, fontWeight: '600' },
  starsRow: { flexDirection: 'row', gap: 6 },
  notesInput: {
    backgroundColor: colors.white, borderRadius: 10,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: colors.textPrimary, minHeight: 100,
  },
  errorText: { color: '#dc2626', fontSize: 13, textAlign: 'center' },
});
