import { useState, useEffect } from 'react';
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
import { useTranslation } from 'react-i18next';
import { colors } from '../../../../src/theme/colors';
import { updateLead, getPrograms, type Program } from '../../../../src/api/leads.api';
import ProgramSelect from '../../../../src/components/ProgramSelect';
import type { Lead } from '../../../../src/types/leads';

const SOURCES = [
  { value: 'MANUAL', label: 'Manual' },
  { value: 'INSTAGRAM', label: 'Instagram' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'LANDING_PAGE', label: 'Landing Page' },
] as const;

export default function EditLeadScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; lead?: string }>();

  let lead: Partial<Lead> = {};
  try {
    if (params.lead) lead = JSON.parse(params.lead);
  } catch {
    lead = {};
  }

  const [name, setName] = useState(lead.name ?? '');
  const [phone, setPhone] = useState(lead.phone ?? '');
  const [email, setEmail] = useState(lead.email ?? '');
  const [source, setSource] = useState<string>(lead.source ?? 'MANUAL');
  const [programs, setPrograms] = useState<Program[]>([]);
  const [programId, setProgramId] = useState<string | null>(null);
  const [isCompany, setIsCompany] = useState(lead.is_company ?? false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPrograms()
      .then((list) => {
        setPrograms(list);
        const match = list.find((p) => p.name === lead.program_interest);
        if (match) setProgramId(match.id);
      })
      .catch(() => {});
  }, [lead.program_interest]);

  const canSubmit = name.trim() !== '' && phone.trim() !== '' && !loading;

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      await updateLead(params.id, {
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        program_interest: programId ? programs.find((p) => p.id === programId)?.name : undefined,
        source,
        is_company: isCompany,
      });
      router.back();
    } catch (err: any) {
      const detail = err?.response?.data;
      const firstError =
        detail && typeof detail === 'object' ? Object.values(detail)[0] : null;
      setError(
        (Array.isArray(firstError) ? firstError[0] : firstError) ??
          t('leads.form.saveError'),
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
        <Text style={s.headerTitle}>{t('leads.form.editTitle')}</Text>
        <TouchableOpacity
          style={[s.saveBtn, !canSubmit && s.saveBtnDisabled]}
          onPress={submit}
          disabled={!canSubmit}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text style={s.saveBtnText}>{t('leads.form.save')}</Text>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          <View style={s.card}>
            <Text style={s.label}>{t('leads.form.name')}</Text>
            <TextInput
              style={s.input}
              value={name}
              onChangeText={setName}
              placeholder={t('leads.form.namePlaceholder')}
              placeholderTextColor={colors.textMuted}
            />

            <Text style={s.label}>{t('leads.form.phone')}</Text>
            <TextInput
              style={s.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="0991234567"
              placeholderTextColor={colors.textMuted}
              keyboardType="phone-pad"
            />

            <Text style={s.label}>{t('leads.form.email')}</Text>
            <TextInput
              style={s.input}
              value={email}
              onChangeText={setEmail}
              placeholder={t('leads.form.emailPlaceholder')}
              placeholderTextColor={colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Text style={s.label}>{t('leads.form.program')}</Text>
            <ProgramSelect programs={programs} selectedId={programId} onSelect={setProgramId} />


            <Text style={s.label}>{t('leads.form.source')}</Text>
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
              <Text style={s.companyText}>{t('leads.form.isCompany')}</Text>
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
    minWidth: 76,
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
