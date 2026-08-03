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
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../../src/theme/colors';
import { createLead } from '../../../src/api/leads.api';

const SOURCES = [
  { value: 'MANUAL', label: 'Manual' },
  { value: 'INSTAGRAM', label: 'Instagram' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'LANDING_PAGE', label: 'Landing Page' },
] as const;

export default function NewLeadScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [source, setSource] = useState<string>('MANUAL');
  const [program, setProgram] = useState('');
  const [isCompany, setIsCompany] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim() !== '' && phone.trim() !== '' && !loading;

  async function submit(confirmDuplicate = false) {
    setLoading(true);
    setError(null);
    try {
      const res = await createLead({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        program_interest: program.trim() || undefined,
        source,
        is_company: isCompany,
        confirm_duplicate: confirmDuplicate,
      });
      if (res?.duplicate && !confirmDuplicate) {
        setLoading(false);
        Alert.alert(
          'Posible duplicado',
          'Ya existe un lead parecido. ¿Crearlo igual?',
          [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Crear igual', onPress: () => submit(true) },
          ],
        );
        return;
      }
      router.back();
    } catch (err: any) {
      const detail = err?.response?.data;
      const firstError =
        detail && typeof detail === 'object' ? Object.values(detail)[0] : null;
      setError(
        (Array.isArray(firstError) ? firstError[0] : firstError) ??
          'No pudimos crear el lead. Verifica los datos.',
      );
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={s.screen}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} hitSlop={8} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Nuevo lead</Text>
        <TouchableOpacity
          style={[s.saveBtn, !canSubmit && s.saveBtnDisabled]}
          onPress={() => submit()}
          disabled={!canSubmit}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text style={s.saveBtnText}>Crear</Text>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          <View style={s.card}>
            <Text style={s.label}>Nombre *</Text>
            <TextInput
              style={s.input}
              value={name}
              onChangeText={setName}
              placeholder="Nombre del lead"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={s.label}>Teléfono *</Text>
            <TextInput
              style={s.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="0991234567"
              placeholderTextColor={colors.textMuted}
              keyboardType="phone-pad"
            />

            <Text style={s.label}>Email</Text>
            <TextInput
              style={s.input}
              value={email}
              onChangeText={setEmail}
              placeholder="correo@ejemplo.com"
              placeholderTextColor={colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Text style={s.label}>Programa de interés</Text>
            <TextInput
              style={s.input}
              value={program}
              onChangeText={setProgram}
              placeholder="Ej. Full Stack"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={s.label}>Origen</Text>
            <View style={s.chips}>
              {SOURCES.map((src) => {
                const active = source === src.value;
                return (
                  <TouchableOpacity
                    key={src.value}
                    style={[s.chip, active && s.chipActive]}
                    onPress={() => setSource(src.value)}
                    activeOpacity={0.8}
                  >
                    <Text style={[s.chipText, active && s.chipTextActive]}>{src.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={s.companyRow}
              onPress={() => setIsCompany((v) => !v)}
              activeOpacity={0.7}
            >
              <View style={[s.checkbox, isCompany && s.checkboxOn]}>
                {isCompany && <Ionicons name="checkmark" size={14} color={colors.white} />}
              </View>
              <Ionicons name="business-outline" size={16} color={colors.textMuted} />
              <Text style={s.companyText}>Es una empresa</Text>
            </TouchableOpacity>
          </View>

          {error && (
            <View style={s.errorBox}>
              <Ionicons name="alert-circle-outline" size={16} color="#dc2626" />
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f8f9fb' },
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
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  saveBtn: {
    backgroundColor: colors.navy,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 68,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { color: colors.white, fontWeight: '700', fontSize: 14 },
  body: { padding: 16, paddingBottom: 40 },
  card: {
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 6,
  },
  label: { fontSize: 13, fontWeight: '600', color: colors.textPrimary, marginTop: 10 },
  input: {
    backgroundColor: '#f8f9fb',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: colors.textPrimary,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: '#f8f9fb',
  },
  chipActive: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  chipTextActive: { color: colors.white },
  companyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  companyText: { fontSize: 14, color: colors.textPrimary },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fef2f2',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fecaca',
    padding: 12,
    marginTop: 12,
  },
  errorText: { color: '#dc2626', fontSize: 13, flex: 1 },
});
