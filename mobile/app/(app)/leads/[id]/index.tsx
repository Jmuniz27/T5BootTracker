import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
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
import {
  assignLead,
  releaseLead,
  updateLeadStatus,
  getLead,
  resendInvitation,
  discardLead,
  restoreLead,
  getSelfAssignmentEnabled,
} from '../../../../src/api/leads.api';
import type { Lead, LeadStatus } from '../../../../src/types/leads';
import { copyInvitationLink, shareInvitationLink } from '../../../../src/lib/invitation';

// Estado de la cuenta del bootcamper tras convertir (espejo del badge web).
const VERIFICATION_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  INVITED:              { label: 'Invitado',                 bg: '#f1f5f9', color: '#64748b' },
  PENDING_VERIFICATION: { label: 'Pendiente de verificación', bg: '#fef9c3', color: '#a16207' },
  VERIFIED:             { label: 'Cuenta activa',            bg: '#dcfce7', color: '#15803d' },
};

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  NEW:            { label: 'Nuevo',         bg: '#fefce8', color: '#a16207' },
  QUALIFIED:      { label: 'Calificado',    bg: '#dbeafe', color: '#1d4ed8' },
  INTERESTED:     { label: 'Interesado',    bg: '#dcfce7', color: '#15803d' },
  NOT_INTERESTED: { label: 'No interesado', bg: '#fee2e2', color: '#dc2626' },
  CONVERTED:      { label: 'Convertido',    bg: '#f3e8ff', color: '#7e22ce' },
  DISCARDED:      { label: 'Descartado',    bg: '#f1f5f9', color: '#64748b' },
};

// "Nuevo" no es una opción manual: un lead nace en NEW y avanza desde ahí.
const ASSIGNABLE: LeadStatus[] = ['QUALIFIED', 'INTERESTED', 'NOT_INTERESTED'];

const DISCARD_REASONS: { value: string; label: string }[] = [
  { value: 'NO_BUDGET',   label: 'Sin presupuesto' },
  { value: 'SCHEDULE',    label: 'Los horarios no le sirven' },
  { value: 'NO_RESPONSE', label: 'No responde / los correos rebotan' },
  { value: 'FREE_ONLY',   label: 'Sólo busca contenido gratis' },
  { value: 'OTHER',       label: 'Otro' },
];

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
  const [resendBusy, setResendBusy] = useState(false);
  const [resendLink, setResendLink] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [discardReason, setDiscardReason] = useState('');
  const [discardDetail, setDiscardDetail] = useState('');
  const [discardError, setDiscardError] = useState<string | null>(null);
  const [selfAssignEnabled, setSelfAssignEnabled] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getLead(params.id)
        .then((fresh) => { if (active && fresh?.id) setLead((prev) => ({ ...prev, ...fresh })); })
        .catch(() => {});
      getSelfAssignmentEnabled()
        .then((enabled) => { if (active) setSelfAssignEnabled(enabled); })
        .catch(() => {});
      return () => { active = false; };
    }, [params.id]),
  );

  const status = lead.status;
  const cfg = status ? STATUS_CONFIG[status] : null;
  const isQualified = status === 'QUALIFIED';
  const isConverted = status === 'CONVERTED';
  const isDiscarded = status === 'DISCARDED';

  // Estado de la cuenta del bootcamper (Invitado / Cuenta activa). Solo informativo.
  const verifStatus = lead.bootcamper_verification_status ?? null;
  const verifCfg = verifStatus ? VERIFICATION_CONFIG[verifStatus] : null;

  function go(path: '/(app)/leads/[id]/log-interaction' | '/(app)/leads/[id]/history' | '/(app)/leads/[id]/convert') {
    router.push({ pathname: path, params: { id: lead.id, name: lead.name, status: lead.status ?? '' } });
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

  function openDiscard() {
    setDiscardReason('');
    setDiscardDetail('');
    setDiscardError(null);
    setDiscardOpen(true);
  }

  async function submitDiscard() {
    if (!discardReason) {
      setDiscardError('Elige un motivo.');
      return;
    }
    if (discardReason === 'OTHER' && !discardDetail.trim()) {
      setDiscardError('Con el motivo “Otro” hay que escribir el detalle.');
      return;
    }
    setBusy(true);
    setDiscardError(null);
    try {
      await discardLead(lead.id, { reason: discardReason, detail: discardDetail.trim() });
      setDiscardOpen(false);
      // Al descartar se desasigna: volvemos al listado.
      router.back();
    } catch (err: any) {
      setDiscardError(err?.response?.data?.error ?? 'No se pudo descartar el lead.');
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    setBusy(true);
    try {
      await restoreLead(lead.id);
      router.back();
    } catch {
      setBusy(false);
    }
  }

  const canResendInvitation = isConverted && lead.bootcamper_verification_status === 'INVITED';

  async function resend() {
    setResendBusy(true);
    setResendError(null);
    try {
      const { invitation_link } = await resendInvitation(lead.id);
      setResendLink(invitation_link);
    } catch (err: any) {
      setResendError(
        err?.response?.data?.error ?? 'No pudimos reenviar la invitación. Intenta de nuevo.',
      );
    } finally {
      setResendBusy(false);
    }
  }

  async function copyResendLink() {
    if (!resendLink) return;
    await copyInvitationLink(resendLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function shareResendLink() {
    if (!resendLink) return;
    await shareInvitationLink(resendLink, lead.name);
  }

  function closeResendModal() {
    setResendLink(null);
    setResendError(null);
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
            {!isConverted && (
              <TouchableOpacity
                style={s.editIcon}
                hitSlop={8}
                onPress={() => router.push({
                  pathname: '/(app)/leads/[id]/edit',
                  params: { id: lead.id, lead: JSON.stringify(lead) },
                })}
                accessibilityRole="button"
                accessibilityLabel="Editar información del lead"
              >
                <Ionicons name="pencil" size={16} color={colors.white} />
              </TouchableOpacity>
            )}
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
          {isConverted ? (
            <InfoRow icon="ribbon-outline" label="Convertido por" value={lead.owner_name} />
          ) : null}
          {isConverted && verifCfg ? (
            <View style={s.infoRow}>
              <Ionicons name="shield-checkmark-outline" size={16} color={colors.textMuted} />
              <Text style={s.infoLabel}>Cuenta</Text>
              <View style={{ flex: 1, alignItems: 'flex-start' }}>
                <View style={[s.verifBadge, { backgroundColor: verifCfg.bg }]}>
                  <Text style={[s.verifBadgeText, { color: verifCfg.color }]}>{verifCfg.label}</Text>
                </View>
              </View>
            </View>
          ) : null}
          {isDiscarded ? (
            <>
              <InfoRow icon="close-circle-outline" label="Motivo" value={lead.discard_reason_display} />
              <InfoRow icon="document-text-outline" label="Detalle" value={lead.discard_detail} />
            </>
          ) : null}
        </View>

        <View style={s.actions}>
          {isConverted ? (
            <>
              <TouchableOpacity style={s.actionPrimary} onPress={() => go('/(app)/leads/[id]/history')} activeOpacity={0.85}>
                <Ionicons name="time-outline" size={18} color={colors.white} />
                <Text style={s.actionPrimaryText}>Ver historial</Text>
              </TouchableOpacity>
              {canResendInvitation && (
                <TouchableOpacity style={s.actionGhost} onPress={resend} disabled={resendBusy} activeOpacity={0.8}>
                  {resendBusy ? (
                    <ActivityIndicator size="small" color={colors.navy} />
                  ) : (
                    <>
                      <Ionicons name="paper-plane-outline" size={18} color={colors.navy} />
                      <Text style={s.actionGhostText}>Reenviar invitación</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
              {resendError && (
                <Text style={s.hint}>{resendError}</Text>
              )}
            </>
          ) : isDiscarded ? (
            <>
              <TouchableOpacity style={s.actionPrimary} onPress={() => go('/(app)/leads/[id]/history')} activeOpacity={0.85}>
                <Ionicons name="time-outline" size={18} color={colors.white} />
                <Text style={s.actionPrimaryText}>Ver historial</Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.actionGhost} onPress={restore} disabled={busy} activeOpacity={0.8}>
                {busy ? (
                  <ActivityIndicator size="small" color={colors.navy} />
                ) : (
                  <>
                    <Ionicons name="refresh-outline" size={18} color={colors.navy} />
                    <Text style={s.actionGhostText}>Reactivar lead</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          ) : owned ? (
            <>
              <TouchableOpacity style={s.actionPrimary} onPress={() => go('/(app)/leads/[id]/log-interaction')} activeOpacity={0.85}>
                <Ionicons name="create-outline" size={18} color={colors.white} />
                <Text style={s.actionPrimaryText}>Registrar interacción</Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.actionGhost} onPress={() => go('/(app)/leads/[id]/history')} activeOpacity={0.8}>
                <Ionicons name="time-outline" size={18} color={colors.navy} />
                <Text style={s.actionGhostText}>Ver historial</Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.actionGhost} onPress={() => setStatusOpen(true)} activeOpacity={0.8}>
                <Ionicons name="flag-outline" size={18} color={colors.navy} />
                <Text style={s.actionGhostText}>Cambiar estado</Text>
              </TouchableOpacity>

              {/* Se muestra siempre, pero sólo se habilita en Calificado (el
                  motivo se explica en el hint de más abajo). */}
              <TouchableOpacity
                style={[s.actionGhost, !isQualified && s.actionDisabled]}
                disabled={!isQualified}
                onPress={() => router.push({
                  pathname: '/(app)/leads/[id]/convert',
                  params: {
                    id: lead.id,
                    name: lead.name,
                    program: lead.program_interest ?? '',
                    email: lead.email ?? '',
                    phone: lead.phone ?? '',
                  },
                })}
                activeOpacity={0.8}
              >
                <Ionicons name="ribbon-outline" size={18} color={colors.navy} />
                <Text style={s.actionGhostText}>Convertir a bootcamper</Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.actionGhost} onPress={openDiscard} disabled={busy} activeOpacity={0.8}>
                <Ionicons name="close-circle-outline" size={18} color={colors.navy} />
                <Text style={s.actionGhostText}>Descartar lead</Text>
              </TouchableOpacity>

              {/* Con la auto-asignación apagada el pool lo maneja el Admin: si
                  soltás el lead no podrías retomarlo, así que tampoco se libera. */}
              <TouchableOpacity
                style={[s.actionDanger, !selfAssignEnabled && s.actionDisabled]}
                onPress={release}
                disabled={busy || !selfAssignEnabled}
                activeOpacity={0.8}
              >
                {busy ? (
                  <ActivityIndicator size="small" color={colors.error} />
                ) : (
                  <Text style={s.actionDangerText}>Desasignar</Text>
                )}
              </TouchableOpacity>

              {!selfAssignEnabled && (
                <Text style={s.hint}>La asignación la realiza el Administrador.</Text>
              )}
              {!isQualified && (
                <Text style={s.hint}>Para convertir el lead, primero pásalo a “Calificado”.</Text>
              )}
            </>
          ) : (
            <>
              <TouchableOpacity style={s.actionGhost} onPress={() => go('/(app)/leads/[id]/history')} activeOpacity={0.8}>
                <Ionicons name="time-outline" size={18} color={colors.navy} />
                <Text style={s.actionGhostText}>Ver historial</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.actionPrimary, !selfAssignEnabled && s.actionDisabled]}
                onPress={assign}
                disabled={busy || !selfAssignEnabled}
                activeOpacity={0.85}
              >
                {busy ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <>
                    <Ionicons name="add-outline" size={18} color={colors.white} />
                    <Text style={s.actionPrimaryText}>Asignarme</Text>
                  </>
                )}
              </TouchableOpacity>
              {!selfAssignEnabled && (
                <Text style={s.hint}>La asignación la realiza el Administrador.</Text>
              )}
            </>
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

      {/* Descartar lead */}
      <Modal visible={discardOpen} transparent animationType="fade" onRequestClose={() => setDiscardOpen(false)}>
        <Pressable style={s.overlay} onPress={() => setDiscardOpen(false)}>
          <Pressable style={s.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={s.handle} />
            <Text style={s.sheetTitle}>Descartar lead</Text>
            <Text style={s.discardHint}>Sale del listado de seguimiento. Se puede reactivar después.</Text>

            {DISCARD_REASONS.map((r) => {
              const active = discardReason === r.value;
              return (
                <TouchableOpacity
                  key={r.value}
                  style={[s.statusOption, active && { borderColor: colors.navy, backgroundColor: '#eff2fb' }]}
                  onPress={() => setDiscardReason(r.value)}
                  disabled={busy}
                  activeOpacity={0.8}
                >
                  <Text style={[s.statusOptionText, active && { color: colors.navy, fontWeight: '700' }]}>{r.label}</Text>
                  {active && <Ionicons name="checkmark-circle" size={18} color={colors.navy} />}
                </TouchableOpacity>
              );
            })}

            <TextInput
              style={s.discardInput}
              value={discardDetail}
              onChangeText={setDiscardDetail}
              placeholder={discardReason === 'OTHER' ? 'Detalle (obligatorio)' : 'Detalle (opcional)'}
              placeholderTextColor={colors.textMuted}
              multiline
            />

            {discardError && <Text style={s.hint}>{discardError}</Text>}

            <View style={s.resultActions}>
              <TouchableOpacity style={[s.actionGhost, { flex: 1 }]} onPress={() => setDiscardOpen(false)} disabled={busy} activeOpacity={0.8}>
                <Text style={s.actionGhostText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.actionPrimary, { flex: 1 }]} onPress={submitDiscard} disabled={busy} activeOpacity={0.85}>
                {busy ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Text style={s.actionPrimaryText}>Descartar</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Resultado del reenvío de invitación */}
      <Modal visible={resendLink !== null} transparent animationType="fade" onRequestClose={closeResendModal}>
        <Pressable style={s.overlay} onPress={closeResendModal}>
          <Pressable style={s.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={s.handle} />
            <Text style={s.sheetTitle}>Invitación reenviada</Text>
            <Text style={s.resultLink} selectable numberOfLines={2}>
              {resendLink}
            </Text>
            <View style={s.resultActions}>
              <TouchableOpacity style={[s.actionGhost, s.sheetBtn]} onPress={copyResendLink} activeOpacity={0.8}>
                <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={20} color={colors.navy} />
                <Text style={[s.actionGhostText, s.sheetBtnText]}>{copied ? 'Copiado' : 'Copiar'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.actionPrimary, s.sheetBtn]} onPress={shareResendLink} activeOpacity={0.85}>
                <Ionicons name="share-social-outline" size={20} color={colors.white} />
                <Text style={[s.actionPrimaryText, s.sheetBtnText]}>Compartir</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
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
  editIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  actionDisabled: { opacity: 0.4 },
  verifBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  verifBadgeText: { fontSize: 11, fontWeight: '700' },
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
  resultLink: { fontSize: 12, color: colors.textMuted, marginBottom: 16 },
  resultActions: { flexDirection: 'row', gap: 10 },
  // Botones del sheet de reenvío: full-width y un poco más altos.
  sheetBtn: { flex: 1, paddingVertical: 16 },
  sheetBtnText: { fontSize: 16 },
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
  discardHint: { fontSize: 12, color: colors.textMuted, textAlign: 'center', marginTop: -8, marginBottom: 16 },
  discardInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.textPrimary,
    minHeight: 64,
    textAlignVertical: 'top',
    marginTop: 8,
    marginBottom: 12,
  },
});
