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

// ─── config ──────────────────────────────────────────────────────────────────

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

export const NEXT_ACTION_OPTIONS = [
  'Llamar de nuevo',
  'Enviar información',
  'Agendar visita',
  'Esperar respuesta',
  'Hablar con coordinador',
] as const;

// ─── screen ──────────────────────────────────────────────────────────────────

export default function LogInteractionScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [type, setType]             = useState<string | null>(null);
  const [outcome, setOutcome]       = useState<string | null>(null);
  const [stars, setStars]           = useState<number | null>(null);
  const [notes, setNotes]           = useState('');
  const [duration, setDuration]     = useState('');
  const [nextAction, setNextAction] = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const notesRef     = useRef<TextInput>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;

  const canSubmit = type !== null && outcome !== null && !loading;

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
        next_action: nextAction.trim() || undefined,
      });
      showToast();
    } catch {
      setError('No pudimos guardar la interacción. Intenta de nuevo.');
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      {/* Header fijo fuera del KAV para que no suba con el teclado */}
      <View style={styles.header}>
        <TouchableOpacity hitSlop={8} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Registrar interacción</Text>
        <TouchableOpacity
          style={[styles.saveBtn, !canSubmit && styles.saveBtnDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit}
        >
          {loading
            ? <ActivityIndicator size="small" color={colors.white} />
            : <Text style={styles.saveBtnText}>Guardar</Text>
          }
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Tipo */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              Tipo de interacción <Text style={styles.required}>*</Text>
            </Text>
            <View style={styles.typeGrid}>
              {TYPES.map((t) => {
                const active = type === t.value;
                return (
                  <TouchableOpacity
                    key={t.value}
                    style={[styles.typeBtn, active && styles.typeBtnActive]}
                    onPress={() => setType(t.value)}
                  >
                    <Ionicons
                      name={t.icon as any}
                      size={20}
                      color={active ? colors.white : colors.textMuted}
                    />
                    <Text style={[styles.typeBtnText, active && styles.typeBtnTextActive]}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Resultado */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              Resultado <Text style={styles.required}>*</Text>
            </Text>
            <View style={styles.outcomeList}>
              {OUTCOMES.map((o) => {
                const active = outcome === o.value;
                return (
                  <TouchableOpacity
                    key={o.value}
                    style={[styles.outcomeBtn, active && styles.outcomeBtnActive]}
                    onPress={() => setOutcome(o.value)}
                  >
                    <View style={[styles.radio, active && styles.radioActive]}>
                      {active && <View style={styles.radioDot} />}
                    </View>
                    <Text style={[styles.outcomeBtnText, active && styles.outcomeBtnTextActive]}>
                      {o.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Nivel de interés */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              Nivel de interés <Text style={styles.optional}>(opcional)</Text>
            </Text>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((n) => (
                <TouchableOpacity key={n} hitSlop={6} onPress={() => setStars(stars === n ? null : n)}>
                  <Ionicons
                    name={stars !== null && n <= stars ? 'star' : 'star-outline'}
                    size={32}
                    color={stars !== null && n <= stars ? '#f59e0b' : colors.border}
                  />
                </TouchableOpacity>
              ))}
              {stars && <Text style={styles.starsLabel}>{stars} / 5</Text>}
            </View>
          </View>

          {/* Duración */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              Duración <Text style={styles.optional}>(opcional)</Text>
            </Text>
            <View style={styles.durationRow}>
              <TextInput
                style={styles.durationInput}
                value={duration}
                onChangeText={(v) => setDuration(v.replace(/[^0-9]/g, ''))}
                placeholder="ej. 5"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
                maxLength={3}
              />
              <Text style={styles.durationUnit}>min</Text>
            </View>
          </View>

          {/* Notas */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              Notas <Text style={styles.optional}>(opcional)</Text>
            </Text>
            <TextInput
              ref={notesRef}
              style={styles.notesInput}
              value={notes}
              onChangeText={setNotes}
              placeholder="¿Cómo fue la interacción?"
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          {/* Próxima acción */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              Próxima acción <Text style={styles.optional}>(opcional)</Text>
            </Text>
            <View style={styles.chipRow}>
              {NEXT_ACTION_OPTIONS.map((opt) => {
                const active = nextAction === opt;
                return (
                  <TouchableOpacity
                    key={opt}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setNextAction(active ? '' : opt)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TextInput
              style={styles.nextActionInput}
              value={nextAction}
              onChangeText={setNextAction}
              placeholder="O escribe una acción personalizada..."
              placeholderTextColor={colors.textMuted}
            />
          </View>

          {error && <Text style={styles.errorText}>{error}</Text>}
        </ScrollView>
      </KeyboardAvoidingView>

      <Animated.View style={[styles.toast, { opacity: toastOpacity }]}>
        <Ionicons name="checkmark-circle" size={18} color={colors.white} />
        <Text style={styles.toastText}>Interacción guardada</Text>
      </Animated.View>
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
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  micBtn: { padding: 4 },
  // Type grid
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
  // Outcome
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
  // Stars
  starsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  starsLabel: { marginLeft: 4, fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  // Duration
  durationRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  durationInput: {
    backgroundColor: colors.white, borderRadius: 10,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: colors.textPrimary,
    width: 90, textAlign: 'center',
  },
  durationUnit: { fontSize: 14, color: colors.textMuted, fontWeight: '500' },
  // Notes
  notesInput: {
    backgroundColor: colors.white, borderRadius: 10,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: colors.textPrimary, minHeight: 100,
  },
  // Next action chips
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.white,
  },
  chipActive: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipText: { fontSize: 13, fontWeight: '500', color: colors.textMuted },
  chipTextActive: { color: colors.white, fontWeight: '600' },
  nextActionInput: {
    backgroundColor: colors.white, borderRadius: 10,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: colors.textPrimary,
  },
  errorText: { color: '#dc2626', fontSize: 13, textAlign: 'center' },
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
    paddingHorizontal: 18,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  toastText: { color: colors.white, fontWeight: '600', fontSize: 14 },
});
