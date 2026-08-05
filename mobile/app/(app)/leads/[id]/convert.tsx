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
import { colors } from '../../../../src/theme/colors';
import { convertLead, getPrograms, type Program, type ConvertResponse } from '../../../../src/api/leads.api';
import ProgramSelect from '../../../../src/components/ProgramSelect';
import { validateIdentificacion } from '../../../../src/utils/identificacion';
import { copyInvitationLink, shareInvitationLink } from '../../../../src/lib/invitation';

export default function ConvertLeadScreen() {
  const router = useRouter();
  const { id, name, program, email: emailParam, phone: phoneParam } =
    useLocalSearchParams<{ id: string; name?: string; program?: string; email?: string; phone?: string }>();

  const [programs, setPrograms] = useState<Program[]>([]);
  const [programId, setProgramId] = useState('');
  const [cedula, setCedula] = useState('');
  const [email, setEmail] = useState(emailParam ?? '');
  const [phone, setPhone] = useState(phoneParam ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ConvertResponse | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getPrograms()
      .then((list) => {
        setPrograms(list);
        const match = list.find((p) => p.name === program);
        if (match) setProgramId(match.id);
      })
      .catch(() => {});
  }, [program]);

  const canSubmit =
    validateIdentificacion(cedula.trim()) && programId !== '' && email.trim() !== '' && !loading;

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const data = await convertLead(id, {
        cedula: cedula.trim(),
        program_id: programId,
        email: email.trim(),
        phone: phone.trim() || undefined,
      });
      setResult(data);
    } catch (err: any) {
      const detail = err?.response?.data;
      const firstError = detail && typeof detail === 'object' ? Object.values(detail)[0] : null;
      setError(
        (Array.isArray(firstError) ? firstError[0] : firstError) ??
          'No pudimos convertir el lead. Verifica los datos.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!result?.invitation_link) return;
    await copyInvitationLink(result.invitation_link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleShare() {
    if (!result?.invitation_link) return;
    await shareInvitationLink(result.invitation_link, name);
  }

  if (result) {
    return (
      <SafeAreaView style={s.screen}>
        <View style={s.header}>
          <Text style={s.headerTitle}>¡Lead convertido!</Text>
          <View style={s.headerSpacer} />
        </View>
        <ScrollView contentContainerStyle={s.body}>
          <View style={s.card}>
            <Text style={s.leadName}>{name} ahora es Bootcamper.</Text>
            <Text style={s.label}>Email</Text>
            <Text style={s.resultEmail}>{result.email}</Text>

            {result.invitation_link ? (
              <>
                <Text style={s.label}>Enlace de invitación</Text>
                <Text style={s.resultLink} selectable numberOfLines={2}>
                  {result.invitation_link}
                </Text>
                <View style={s.resultActions}>
                  <TouchableOpacity style={s.actionGhost} onPress={handleCopy} activeOpacity={0.8}>
                    <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={18} color={colors.navy} />
                    <Text style={s.actionGhostText}>{copied ? 'Copiado' : 'Copiar'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.actionPrimary} onPress={handleShare} activeOpacity={0.85}>
                    <Ionicons name="share-social-outline" size={18} color={colors.white} />
                    <Text style={s.actionPrimaryText}>Compartir</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <Text style={s.returningNotice}>
                ⚠ Bootcamper recurrente — se reutilizó la cuenta existente.
              </Text>
            )}
          </View>

          <TouchableOpacity style={s.doneBtn} onPress={() => router.back()} activeOpacity={0.85}>
            <Text style={s.doneBtnText}>Listo</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.screen}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} hitSlop={8} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Convertir a bootcamper</Text>
        <TouchableOpacity
          style={[s.saveBtn, !canSubmit && s.saveBtnDisabled]}
          onPress={submit}
          disabled={!canSubmit}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text style={s.saveBtnText}>Convertir</Text>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          {name ? <Text style={s.leadName}>{name}</Text> : null}

          <View style={s.card}>
            <Text style={s.label}>Cédula / RUC *</Text>
            <TextInput
              style={s.input}
              value={cedula}
              onChangeText={(v) => setCedula(v.replace(/[^0-9]/g, '').slice(0, 13))}
              placeholder="10 dígitos (cédula) o 13 (RUC)"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              maxLength={13}
            />

            <Text style={s.label}>Programa *</Text>
            <ProgramSelect programs={programs} selectedId={programId || null} onSelect={setProgramId} />

            <Text style={s.label}>Email *</Text>
            <TextInput
              style={s.input}
              value={email}
              onChangeText={setEmail}
              placeholder="correo@ejemplo.com"
              placeholderTextColor={colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Text style={s.label}>Teléfono</Text>
            <TextInput
              style={s.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="0991234567"
              placeholderTextColor={colors.textMuted}
              keyboardType="phone-pad"
            />
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
    paddingHorizontal: 14,
    paddingVertical: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { color: colors.white, fontWeight: '700', fontSize: 14 },
  body: { padding: 16, paddingBottom: 40 },
  leadName: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: 12 },
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
  headerSpacer: { width: 36, height: 36 },
  resultEmail: { fontSize: 15, fontWeight: '600', color: colors.textPrimary, marginTop: 4 },
  resultLink: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  resultActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  returningNotice: { fontSize: 13, color: '#b45309', marginTop: 8 },
  actionPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.navy,
    borderRadius: 12,
    paddingVertical: 12,
  },
  actionPrimaryText: { color: colors.white, fontWeight: '700', fontSize: 14 },
  actionGhost: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 12,
  },
  actionGhostText: { color: colors.navy, fontWeight: '700', fontSize: 14 },
  doneBtn: {
    backgroundColor: colors.navy,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  doneBtnText: { color: colors.white, fontWeight: '700', fontSize: 15 },
});
