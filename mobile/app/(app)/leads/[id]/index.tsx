import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Modal,
  Pressable,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../../../src/theme/colors';
import { useQuickCall } from '../../../../src/hooks/use-quick-call';
import { assignLead, releaseLead, updateLeadStatus, getLead } from '../../../../src/api/leads.api';
import type { Lead, LeadStatus } from '../../../../src/types/leads';

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  NEW:            { label: 'Nuevo',         bg: '#fefce8', color: '#a16207' },
  QUALIFIED:      { label: 'Calificado',    bg: '#dbeafe', color: '#1d4ed8' },
  INTERESTED:     { label: 'Interesado',    bg: '#dcfce7', color: '#15803d' },
  NOT_INTERESTED: { label: 'No interesado', bg: '#fee2e2', color: '#dc2626' },
  CONVERTED:      { label: 'Convertido',    bg: '#f3e8ff', color: '#7e22ce' },
};

const ASSIGNABLE: LeadStatus[] = ['NEW', 'QUALIFIED', 'INTERESTED', 'NOT_INTERESTED'];

const SOURCE_LABEL: Record<string, string> = {
  INSTAGRAM: 'Instagram',
  WHATSAPP: 'WhatsApp',
  LANDING_PAGE: 'Landing Page',
  MANUAL: 'Manual',
};

function InfoRow({ icon, label, value }: { icon: any; label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View style={s.infoRow}>
      <Ionicons name={icon} size={16} color={colors.textMuted} />
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

export default function LeadDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; lead?: string; owned?: string }>();
  const { startCall } = useQuickCall();

  function parseInitial(): Partial<Lead> & { id: string } {
    try {
      if (params.lead) return JSON.parse(params.lead);
    } catch {
      return { id: params.id, name: '' };
    }
    return { id: params.id, name: '' };
  }

  const [lead, setLead] = useState<Partial<Lead> & { id: string }>(parseInitial);
  const owned = params.owned === '1';

  const [statusOpen, setStatusOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getLead(params.id)
        .then((fresh) => { if (active && fresh?.id) setLead((prev) => ({ ...prev, ...fresh })); })
        .catch(() => {});
      return () => { active = false; };
    }, [params.id]),
  );

  const status = lead.status;
  const cfg = status ? STATUS_CONFIG[status] : null;
  const isQualified = status === 'QUALIFIED';
  const isConverted = status === 'CONVERTED';

  function go(path: '/(app)/leads/[id]/log-interaction' | '/(app)/leads/[id]/history' | '/(app)/leads/[id]/convert') {
    router.push({ pathname: path, params: { id: lead.id, name: lead.name } });
  }

  async function changeStatus(next: LeadStatus) {
    setBusy(true);
    try {
      await updateLeadStatus(lead.id, { status: next });
      setLead((prev) => ({ ...prev, status: next }));
      setStatusOpen(false);
    } catch {
      setStatusOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function assign() {
    setBusy(true);
    try {
      await assignLead(lead.id);
      router.back();
    } catch {
      setBusy(false);
    }
  }

  async function release() {
    setBusy(true);
    try {
      await releaseLead(lead.id);
      router.back();
    } catch {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={s.screen}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} hitSlop={8} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Lead</Text>
        <View style={s.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={s.body}>
        <View style={s.card}>
          <View style={s.nameRow}>
            <View style={s.avatar}>
              <Ionicons name={lead.is_company ? 'business' : 'person'} size={22} color={colors.white} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{lead.name}</Text>
              {cfg ? (
                <View style={[s.badge, { backgroundColor: cfg.bg }]}>
                  <Text style={[s.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
                </View>
              ) : null}
            </View>
          </View>

          <View style={s.divider} />

          {lead.phone ? (
            <TouchableOpacity style={s.infoRow} onPress={() => startCall(lead as Lead)} activeOpacity={0.6}>
              <Ionicons name="call-outline" size={16} color={colors.navy} />
              <Text style={s.infoLabel}>Teléfono</Text>
              <Text style={[s.infoValue, { color: colors.navy, textDecorationLine: 'underline' }]}>
                {lead.phone}
              </Text>
            </TouchableOpacity>
          ) : null}
          <InfoRow icon="mail-outline" label="Email" value={lead.email ?? undefined} />
          <InfoRow icon="pricetag-outline" label="Origen" value={lead.source ? SOURCE_LABEL[lead.source] ?? lead.source : undefined} />
          <InfoRow icon="school-outline" label="Programa" value={lead.program_interest} />
          <InfoRow
            icon="chatbubble-outline"
            label="Interacciones"
            value={lead.interaction_count != null ? String(lead.interaction_count) : undefined}
          />
        </View>

        <View style={s.actions}>
          {owned ? (
            <>
              {!isConverted && (
                <TouchableOpacity style={s.actionPrimary} onPress={() => go('/(app)/leads/[id]/log-interaction')} activeOpacity={0.85}>
                  <Ionicons name="create-outline" size={18} color={colors.white} />
                  <Text style={s.actionPrimaryText}>Registrar interacción</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={isConverted ? s.actionPrimary : s.actionGhost}
                onPress={() => go('/(app)/leads/[id]/history')}
                activeOpacity={0.85}
              >
                <Ionicons name="time-outline" size={18} color={isConverted ? colors.white : colors.navy} />
                <Text style={isConverted ? s.actionPrimaryText : s.actionGhostText}>Ver historial</Text>
              </TouchableOpacity>

              {!isConverted && (
                <TouchableOpacity style={s.actionGhost} onPress={() => setStatusOpen(true)} activeOpacity={0.8}>
                  <Ionicons name="flag-outline" size={18} color={colors.navy} />
                  <Text style={s.actionGhostText}>Cambiar estado</Text>
                </TouchableOpacity>
              )}

              {!isConverted && (
                <TouchableOpacity
                  style={s.actionGhost}
                  onPress={() => router.push({
                    pathname: '/(app)/leads/[id]/edit',
                    params: { id: lead.id, lead: JSON.stringify(lead) },
                  })}
                  activeOpacity={0.8}
                >
                  <Ionicons name="pencil-outline" size={18} color={colors.navy} />
                  <Text style={s.actionGhostText}>Editar información</Text>
                </TouchableOpacity>
              )}

              {isQualified && (
                <TouchableOpacity style={s.actionGhost} onPress={() => go('/(app)/leads/[id]/convert')} activeOpacity={0.8}>
                  <Ionicons name="ribbon-outline" size={18} color={colors.navy} />
                  <Text style={s.actionGhostText}>Convertir a bootcamper</Text>
                </TouchableOpacity>
              )}

              {!isConverted && (
                <TouchableOpacity style={s.actionDanger} onPress={release} disabled={busy} activeOpacity={0.8}>
                  {busy ? (
                    <ActivityIndicator size="small" color={colors.error} />
                  ) : (
                    <Text style={s.actionDangerText}>Desasignar</Text>
                  )}
                </TouchableOpacity>
              )}

              {!isQualified && !isConverted && (
                <Text style={s.hint}>Para convertir el lead, primero pásalo a “Calificado”.</Text>
              )}
            </>
          ) : (
            <TouchableOpacity style={s.actionPrimary} onPress={assign} disabled={busy} activeOpacity={0.85}>
              {busy ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <>
                  <Ionicons name="add-outline" size={18} color={colors.white} />
                  <Text style={s.actionPrimaryText}>Asignarme</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* Cambiar estado */}
      <Modal visible={statusOpen} transparent animationType="fade" onRequestClose={() => setStatusOpen(false)}>
        <Pressable style={s.overlay} onPress={() => setStatusOpen(false)}>
          <View style={s.sheet}>
            <View style={s.handle} />
            <Text style={s.sheetTitle}>Cambiar estado</Text>
            {ASSIGNABLE.map((st) => {
              const c = STATUS_CONFIG[st];
              const active = status === st;
              return (
                <TouchableOpacity
                  key={st}
                  style={[s.statusOption, active && { borderColor: c.color, backgroundColor: c.bg }]}
                  onPress={() => changeStatus(st)}
                  disabled={busy}
                  activeOpacity={0.8}
                >
                  <Text style={[s.statusOptionText, active && { color: c.color, fontWeight: '700' }]}>{c.label}</Text>
                  {busy && active && <ActivityIndicator size="small" color={c.color} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Modal>
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
  headerSpacer: { width: 36, height: 36 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  body: { padding: 16, gap: 16 },
  card: {
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: 18, fontWeight: '800', color: colors.textPrimary },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, marginTop: 4 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  divider: { height: 1, backgroundColor: '#f3f4f6', marginVertical: 14 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 },
  infoLabel: { fontSize: 13, color: colors.textMuted, width: 90 },
  infoValue: { flex: 1, fontSize: 14, color: colors.textPrimary, fontWeight: '500' },
  actions: { gap: 10 },
  actionPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.navy,
    borderRadius: 12,
    paddingVertical: 14,
  },
  actionPrimaryText: { color: colors.white, fontWeight: '700', fontSize: 15 },
  actionGhost: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 14,
  },
  actionGhostText: { color: colors.navy, fontWeight: '700', fontSize: 15 },
  actionDanger: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 12,
    paddingVertical: 14,
  },
  actionDangerText: { color: colors.error, fontWeight: '700', fontSize: 15 },
  hint: { fontSize: 12, color: colors.textMuted, textAlign: 'center', marginTop: 4 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingBottom: 36,
    paddingHorizontal: 20,
  },
  handle: { width: 36, height: 4, backgroundColor: colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, textAlign: 'center', marginBottom: 16 },
  statusOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 8,
    backgroundColor: '#f8f9fb',
  },
  statusOptionText: { fontSize: 14, fontWeight: '500', color: colors.textMuted },
});
