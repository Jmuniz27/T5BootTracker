import { useState } from 'react';
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
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../../../src/theme/colors';
import { logInteraction } from '../../../../src/api/leads.api';

// ─── config ──────────────────────────────────────────────────────────────────

const TYPES = [
  { value: 'CALL',      label: 'Llamada',   icon: 'call-outline' },
  { value: 'WHATSAPP',  label: 'WhatsApp',  icon: 'logo-whatsapp' },
  { value: 'EMAIL',     label: 'Email',     icon: 'mail-outline' },
  { value: 'VISIT',     label: 'Visita',    icon: 'location-outline' },
  { value: 'NOTE',      label: 'Nota',      icon: 'create-outline' },
] as const;

const OUTCOMES = [
  { value: 'INTERESTED',        label: 'Interesado' },
  { value: 'NOT_INTERESTED',    label: 'No interesado' },
  { value: 'NO_ANSWER',         label: 'No contestó' },
  { value: 'CALLBACK',          label: 'Llamar después' },
  { value: 'SPEAK_COORDINATOR', label: 'Hablar coordinador' },
] as const;

// ─── screen ──────────────────────────────────────────────────────────────────

export default function LogInteractionScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [type, setType]       = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [stars, setStars]     = useState<number | null>(null);
  const [notes, setNotes]     = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const canSubmit = type !== null && outcome !== null && !loading;

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
      });
      router.back();
    } catch {
      setError('No pudimos guardar la interacción. Intenta de nuevo.');
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
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

        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Tipo */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Tipo de interacción <Text style={styles.required}>*</Text></Text>
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
            <Text style={styles.sectionLabel}>Resultado <Text style={styles.required}>*</Text></Text>
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
            <Text style={styles.sectionLabel}>Nivel de interés <Text style={styles.optional}>(opcional)</Text></Text>
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
              {stars && (
                <Text style={styles.starsLabel}>{stars} / 5</Text>
              )}
            </View>
          </View>

          {/* Notas */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Notas <Text style={styles.optional}>(opcional)</Text></Text>
            <TextInput
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

          {error && <Text style={styles.errorText}>{error}</Text>}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
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
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  saveBtn: {
    backgroundColor: colors.navy,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
    minWidth: 72,
    alignItems: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.4,
  },
  saveBtnText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 14,
  },
  body: {
    padding: 16,
    gap: 24,
    paddingBottom: 40,
  },
  section: {
    gap: 10,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  required: {
    color: '#dc2626',
  },
  optional: {
    fontWeight: '400',
    color: colors.textMuted,
    fontSize: 13,
  },
  // Type grid
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  typeBtnActive: {
    backgroundColor: colors.navy,
    borderColor: colors.navy,
  },
  typeBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
  typeBtnTextActive: {
    color: colors.white,
  },
  // Outcome list
  outcomeList: {
    gap: 8,
  },
  outcomeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.white,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  outcomeBtnActive: {
    borderColor: colors.navy,
    backgroundColor: '#f0f4ff',
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
  radioActive: {
    borderColor: colors.navy,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.navy,
  },
  outcomeBtnText: {
    fontSize: 14,
    color: colors.textMuted,
    fontWeight: '500',
  },
  outcomeBtnTextActive: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  // Stars
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  starsLabel: {
    marginLeft: 4,
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: '600',
  },
  // Notes
  notesInput: {
    backgroundColor: colors.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.textPrimary,
    minHeight: 100,
  },
  errorText: {
    color: '#dc2626',
    fontSize: 13,
    textAlign: 'center',
  },
});
