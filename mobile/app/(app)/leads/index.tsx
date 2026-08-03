import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  Modal,
  Pressable,
  Animated,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../../src/theme/colors';
import { fetchLeads, assignLead, releaseLead, updateLeadStatus } from '../../../src/api/leads.api';
import { api } from '../../../src/lib/api';
import { useAuth } from '../../../src/context/AuthContext';
import { useQuickCall } from '../../../src/hooks/use-quick-call';
import type { Lead, LeadStatus } from '../../../src/types/leads';

interface MeData {
  id: string;
  email: string;
  full_name: string;
  role: string;
}

// ─── helpers ────────────────────────────────────────────────────────────────

const ROLE_LABEL: Record<string, string> = {
  SALESPERSON:   'Vendedor',
  ADMINISTRATOR: 'Administrador',
  COORDINATOR:   'Coordinador',
  BOOTCAMPER:    'Bootcamper',
};

const STATUS_CONFIG: Record<LeadStatus, { bg: string; color: string; label: string }> = {
  NEW:            { bg: '#fefce8', color: '#a16207', label: 'Nuevo' },
  QUALIFIED:      { bg: '#dbeafe', color: '#1d4ed8', label: 'Calificado' },
  INTERESTED:     { bg: '#dcfce7', color: '#15803d', label: 'Interesado' },
  NOT_INTERESTED: { bg: '#fee2e2', color: '#dc2626', label: 'No interesado' },
  CONVERTED:      { bg: '#f3e8ff', color: '#7e22ce', label: 'Convertido' },
};

// Estados que un vendedor puede asignar manualmente — CONVERTED queda excluido.
const ASSIGNABLE_STATUSES: LeadStatus[] = ['NEW', 'QUALIFIED', 'INTERESTED', 'NOT_INTERESTED'];

const STATUS_FILTERS: { value: LeadStatus | null; label: string }[] = [
  { value: null,             label: 'Todos' },
  { value: 'NEW',            label: 'Nuevo' },
  { value: 'QUALIFIED',      label: 'Calificado' },
  { value: 'INTERESTED',     label: 'Interesado' },
  { value: 'NOT_INTERESTED', label: 'No interesado' },
  { value: 'CONVERTED',      label: 'Convertido' },
];

const AVATAR_PALETTE = ['#213A8E', '#8b5cf6', '#14b8a6', '#f43f5e', '#f59e0b', '#0891b2', '#ec4899', '#6366f1'];

function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length === 1
    ? parts[0][0].toUpperCase()
    : (parts[0][0] + parts[1][0]).toUpperCase();
}

// ─── sub-components ──────────────────────────────────────────────────────────

function Avatar({ name, isCompany }: { name: string; isCompany?: boolean }) {
  return (
    <View style={[styles.avatar, { backgroundColor: avatarColor(name) }]}>
      <Ionicons name={isCompany ? 'business' : 'person'} size={20} color="#fff" />
    </View>
  );
}

// El badge usa `status` como fuente de verdad (igual que el web) — last_outcome ya no decide el color.
// Si se pasa onPress, el badge es tappable (abre el selector de "Cambiar estado").
function StatusBadge({ status, onPress }: { status: LeadStatus; onPress?: () => void }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.NEW;
  const badge = (
    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
      {onPress && <Ionicons name="chevron-down" size={10} color={cfg.color} style={{ marginLeft: 2 }} />}
    </View>
  );
  if (!onPress) return badge;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} hitSlop={6}>
      {badge}
    </TouchableOpacity>
  );
}

function StatusChips({
  value,
  onChange,
}: {
  value: LeadStatus | null;
  onChange: (key: LeadStatus | null) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipsRow}
    >
      {STATUS_FILTERS.map((f) => {
        const active = value === f.value;
        return (
          <TouchableOpacity
            key={String(f.value)}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onChange(f.value)}
            activeOpacity={0.7}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

interface CardProps {
  lead: Lead;
  isAvailable: boolean;
  onAssign: (id: string) => void;
  onRelease: (id: string) => void;
  onViewHistory: (lead: Lead) => void;
  onLogInteraction: (lead: Lead) => void;
  onChangeStatus: (lead: Lead) => void;
  onCall: (lead: Lead) => void;
  onOpenDetail: (lead: Lead) => void;
}

function LeadCard({ lead, isAvailable, onAssign, onRelease, onViewHistory, onLogInteraction, onChangeStatus, onCall, onOpenDetail }: CardProps) {
  const canChangeStatus = !isAvailable && lead.status !== 'CONVERTED';
  return (
    <View style={styles.card}>
      {/* Top: avatar + info (tap → detalle) */}
      <TouchableOpacity style={styles.cardTop} activeOpacity={0.6} onPress={() => onOpenDetail(lead)}>
        <Avatar name={lead.name} isCompany={lead.is_company} />
        <View style={styles.cardInfo}>
          <View style={styles.cardNameRow}>
            <Text style={styles.cardName} numberOfLines={1}>{lead.name}</Text>
            <StatusBadge status={lead.status} onPress={canChangeStatus ? () => onChangeStatus(lead) : undefined} />
          </View>
          {lead.email ? (
            <View style={styles.cardRow}>
              <Ionicons name="mail-outline" size={12} color={colors.textMuted} />
              <Text style={styles.cardDetail} numberOfLines={1}>{lead.email}</Text>
            </View>
          ) : null}
          <View style={styles.cardRow}>
            <TouchableOpacity
              style={styles.phoneBtn}
              onPress={() => onCall(lead)}
              activeOpacity={0.6}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Llamar a ${lead.name}`}
            >
              <Ionicons name="call-outline" size={12} color={colors.navy} />
              <Text style={styles.phoneLink}>{lead.phone}</Text>
            </TouchableOpacity>
            <Text style={styles.cardDot}>·</Text>
            <Ionicons name="chatbubble-outline" size={12} color={colors.textMuted} />
            <Text style={styles.cardDetail}>{lead.interaction_count}</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.border} />
      </TouchableOpacity>

      {/* Divider */}
      <View style={styles.cardDivider} />

      {/* Bottom: action buttons */}
      <View style={styles.cardFooter}>
        {isAvailable ? (
          <TouchableOpacity style={[styles.btnPrimary, styles.btnFull]} onPress={() => onAssign(lead.id)} activeOpacity={0.85}>
            <Ionicons name="add-outline" size={15} color="#fff" />
            <Text style={styles.btnPrimaryText}>Asignarme</Text>
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity style={styles.btnGhost} onPress={() => onViewHistory(lead)} activeOpacity={0.7}>
              <Ionicons name="time-outline" size={14} color={colors.navy} />
              <Text style={styles.btnGhostText}>Historial</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btnPrimary, { flex: 1 }]} onPress={() => onLogInteraction(lead)} activeOpacity={0.85}>
              <Text style={styles.btnPrimaryText}>Registrar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnOutline} onPress={() => onRelease(lead.id)} activeOpacity={0.7}>
              <Text style={styles.btnOutlineText}>Desasignar</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

function ChangeStatusModal({
  lead,
  saving,
  onClose,
  onSelect,
}: {
  lead: Lead;
  saving: boolean;
  onClose: () => void;
  onSelect: (status: LeadStatus) => void;
}) {
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.menuOverlay} onPress={onClose}>
        <View style={styles.statusSheet}>
          <View style={styles.menuHandle} />
          <Text style={styles.statusSheetTitle}>Cambiar estado</Text>
          <Text style={styles.statusSheetSubtitle} numberOfLines={1}>{lead.name}</Text>
          <View style={styles.statusOptionList}>
            {ASSIGNABLE_STATUSES.map((value) => {
              const cfg = STATUS_CONFIG[value];
              const active = lead.status === value;
              return (
                <TouchableOpacity
                  key={value}
                  style={[styles.statusOption, active && { borderColor: cfg.color, backgroundColor: cfg.bg }]}
                  onPress={() => onSelect(value)}
                  disabled={saving}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.statusOptionText, active && { color: cfg.color, fontWeight: '700' }]}>
                    {cfg.label}
                  </Text>
                  {saving && active && <ActivityIndicator size="small" color={cfg.color} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

// ─── screen ──────────────────────────────────────────────────────────────────

type Tab = 'my' | 'available';

export default function LeadsScreen() {
  const router = useRouter();
  const { logout } = useAuth();
  const { startCall } = useQuickCall();

  const [me, setMe]                     = useState<MeData | null>(null);
  const [tab, setTab]                   = useState<Tab>('my');
  const [search, setSearch]             = useState('');
  const [statusFilter, setStatusFilter] = useState<LeadStatus | null>(null);
  const [showFilters, setShowFilters]   = useState(false);
  const [myLeads, setMyLeads]           = useState<Lead[]>([]);
  const [available, setAvailable]       = useState<Lead[]>([]);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [menuOpen, setMenuOpen]         = useState(false);
  const [statusLead, setStatusLead]     = useState<Lead | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);
  const slideAnim                        = useRef(new Animated.Value(300)).current;

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function openMenu() {
    slideAnim.setValue(300);
    setMenuOpen(true);
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
  }

  function closeMenu(cb?: () => void) {
    Animated.timing(slideAnim, { toValue: 300, duration: 220, useNativeDriver: true }).start(() => {
      setMenuOpen(false);
      cb?.();
    });
  }

  async function loadLeads(q?: string, status?: LeadStatus | null) {
    try {
      const params: { search?: string; status?: string } = {};
      if (q) params.search = q;
      if (status) params.status = status;
      const data = await fetchLeads(Object.keys(params).length ? params : undefined);
      setMyLeads(data.my_leads);
      setAvailable(data.available_leads);
      setError(null);
    } catch {
      setError('No pudimos cargar los leads. Intenta de nuevo.');
    }
  }

  useEffect(() => {
    api.get<MeData>('/auth/me/').then(({ data }) => setMe(data)).catch(() => {});
    loadLeads().finally(() => setLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadLeads(search, statusFilter);
    }, [search, statusFilter]),
  );

  function handleSearchChange(text: string) {
    setSearch(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadLeads(text, statusFilter), 400);
  }

  function handleStatusFilterChange(value: LeadStatus | null) {
    setStatusFilter(value);
    loadLeads(search, value);
  }

  async function handleRefresh() {
    setRefreshing(true);
    await loadLeads(search, statusFilter);
    setRefreshing(false);
  }

  async function handleAssign(leadId: string) {
    try {
      await assignLead(leadId);
      await loadLeads(search, statusFilter);
    } catch {
      setError('No pudimos asignar el lead. Puede que ya haya sido tomado.');
    }
  }

  async function handleRelease(leadId: string) {
    try {
      await releaseLead(leadId);
      await loadLeads(search, statusFilter);
    } catch {
      setError('No pudimos desasignar el lead. Intenta de nuevo.');
    }
  }

  function handleViewHistory(lead: Lead) {
    router.push({ pathname: '/(app)/leads/[id]/history', params: { id: lead.id } });
  }

  function handleOpenDetail(lead: Lead) {
    router.push({ pathname: '/(app)/leads/[id]', params: { id: lead.id, lead: JSON.stringify(lead) } });
  }

  function handleLogInteraction(lead: Lead) {
    router.push({ pathname: '/(app)/leads/[id]/log-interaction', params: { id: lead.id, name: lead.name } });
  }

  function handleChangeStatus(lead: Lead) {
    setStatusLead(lead);
  }

  async function handleSelectStatus(newStatus: LeadStatus) {
    if (!statusLead) return;
    setStatusSaving(true);
    try {
      await updateLeadStatus(statusLead.id, { status: newStatus });
      setStatusLead(null);
      await loadLeads(search, statusFilter);
    } catch {
      setError('No pudimos actualizar el estado. Intenta de nuevo.');
    } finally {
      setStatusSaving(false);
    }
  }

  const displayed = tab === 'my' ? myLeads : available;

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <ActivityIndicator style={styles.loader} color={colors.navy} size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <FlatList
        data={displayed}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.navy} />}
        ListHeaderComponent={
          <>
            {/* Header */}
            <View style={styles.header}>
              <View>
                <Text style={styles.headerTitle}>Leads</Text>
                <Text style={styles.headerSub}>Dashboard</Text>
              </View>
              <View style={styles.headerRight}>
                <TouchableOpacity
                  style={styles.agendaBtn}
                  onPress={() => router.push('/(app)/agenda')}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Abrir agenda de seguimientos"
                >
                  <Ionicons name="calendar-outline" size={20} color={colors.navy} />
                </TouchableOpacity>
                <View style={styles.headerNameCol}>
                  <Text style={styles.headerName}>{me?.full_name ?? '—'}</Text>
                  <View style={styles.rolePill}>
                    <Text style={styles.roleText}>
                      {ROLE_LABEL[me?.role ?? ''] ?? me?.role}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity style={styles.userAvatar} onPress={openMenu} activeOpacity={0.8}>
                  <Text style={styles.userAvatarText}>
                    {me ? getInitials(me.full_name) : '?'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Stat cards */}
            <View style={styles.statRow}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{myLeads.length}</Text>
                <Text style={styles.statLabel}>Mis leads</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{available.length}</Text>
                <Text style={styles.statLabel}>Disponibles</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{myLeads.filter((l) => l.status === 'CONVERTED').length}</Text>
                <Text style={styles.statLabel}>Convertidos</Text>
              </View>
            </View>

            {/* Search */}
            <View style={styles.searchRow}>
              <View style={styles.searchBox}>
                <Ionicons name="search-outline" size={18} color={colors.textMuted} />
                <TextInput
                  style={styles.searchInput}
                  value={search}
                  onChangeText={handleSearchChange}
                  placeholder="Buscar por nombre, email o teléfono"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  returnKeyType="search"
                />
              </View>
              <TouchableOpacity
                style={[styles.filterBtn, (showFilters || statusFilter) && styles.filterBtnActive]}
                onPress={() => setShowFilters((v) => !v)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="funnel"
                  size={18}
                  color={showFilters || statusFilter ? colors.white : colors.textMuted}
                />
              </TouchableOpacity>
            </View>

            {/* Status filter chips */}
            {showFilters && <StatusChips value={statusFilter} onChange={handleStatusFilterChange} />}

            {/* Tabs */}
            <View style={styles.tabs}>
              <TouchableOpacity
                style={[styles.tab, tab === 'my' && styles.tabActive]}
                onPress={() => setTab('my')}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabText, tab === 'my' && styles.tabTextActive]}>
                  Mis leads ({myLeads.length})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, tab === 'available' && styles.tabActive]}
                onPress={() => setTab('available')}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabText, tab === 'available' && styles.tabTextActive]}>
                  Disponibles ({available.length})
                </Text>
              </TouchableOpacity>
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </>
        }
        renderItem={({ item }) => (
          <LeadCard
            lead={item}
            isAvailable={tab === 'available'}
            onAssign={handleAssign}
            onRelease={handleRelease}
            onViewHistory={handleViewHistory}
            onLogInteraction={handleLogInteraction}
            onChangeStatus={handleChangeStatus}
            onCall={startCall}
            onOpenDetail={handleOpenDetail}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={40} color={colors.border} />
            <Text style={styles.emptyTitle}>Sin resultados</Text>
            <Text style={styles.emptyText}>
              {tab === 'my'
                ? 'No tienes leads asignados.'
                : 'No hay leads disponibles para asignarte.'}
            </Text>
          </View>
        }
      />

      {/* User menu */}
      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => closeMenu()}
      >
        <Pressable style={styles.menuOverlay} onPress={() => closeMenu()}>
          <Animated.View style={[styles.menuSheet, { transform: [{ translateY: slideAnim }] }]}>
            <View style={styles.menuHandle} />
            {/* User info */}
            <View style={styles.menuUser}>
              <View style={[styles.userAvatar, styles.menuAvatar]}>
                <Text style={[styles.userAvatarText, styles.menuAvatarText]}>
                  {me ? getInitials(me.full_name) : '?'}
                </Text>
              </View>
              <View style={styles.menuUserInfo}>
                <Text style={styles.menuUserName}>{me?.full_name ?? '—'}</Text>
                <Text style={styles.menuUserEmail}>{me?.email ?? ''}</Text>
              </View>
            </View>

            <View style={styles.menuDivider} />

            {/* Logout */}
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => closeMenu(async () => {
                await logout();
                router.replace('/(auth)/login');
              })}
              activeOpacity={0.7}
            >
              <Ionicons name="log-out-outline" size={20} color="#dc2626" />
              <Text style={styles.menuItemTextDanger}>Cerrar sesión</Text>
            </TouchableOpacity>
          </Animated.View>
        </Pressable>
      </Modal>

      {/* Change status modal */}
      {statusLead && (
        <ChangeStatusModal
          lead={statusLead}
          saving={statusSaving}
          onClose={() => setStatusLead(null)}
          onSelect={handleSelectStatus}
        />
      )}

      {/* FAB: nuevo lead */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/(app)/leads/new')}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Nuevo lead"
      >
        <Ionicons name="add" size={28} color={colors.white} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

// ─── styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f8f9fb',
  },
  loader: {
    marginTop: 80,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 20,
    paddingBottom: 18,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  headerSub: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '500',
    marginTop: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  agendaBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#eff2fb',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.navy,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  headerNameCol: {
    alignItems: 'flex-end',
    gap: 3,
  },
  headerName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  rolePill: {
    backgroundColor: colors.navy,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  roleText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.navy,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userAvatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
  // Stat cards
  statRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 2,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '500',
    textAlign: 'center',
  },
  // Search
  searchRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 12,
    paddingHorizontal: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    height: 46,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
  },
  filterBtn: {
    width: 46,
    height: 46,
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterBtnActive: {
    backgroundColor: colors.navy,
    borderColor: colors.navy,
  },
  // Status chips
  chipsRow: {
    gap: 8,
    paddingBottom: 12,
    paddingRight: 4,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.navy,
    borderColor: colors.navy,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
  },
  chipTextActive: {
    color: colors.white,
  },
  // Tabs
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 3,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 10,
  },
  tabActive: {
    backgroundColor: colors.navy,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.white,
  },
  // Cards
  card: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  cardTop: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#f3f4f6',
    marginBottom: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  avatarText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
  },
  cardInfo: {
    flex: 1,
    gap: 4,
  },
  cardNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    flex: 1,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    flexShrink: 0,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardDetail: {
    fontSize: 12,
    color: colors.textMuted,
  },
  phoneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  phoneLink: {
    fontSize: 12,
    color: colors.navy,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  cardDot: {
    fontSize: 12,
    color: colors.border,
    marginHorizontal: 2,
  },
  cardFooter: {
    flexDirection: 'row',
    gap: 8,
  },
  btnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: colors.navy,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  btnFull: {
    flex: 1,
  },
  btnPrimaryText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  btnGhost: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#eff2fb',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  btnGhostText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.navy,
  },
  btnOutline: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnOutlineText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
  // Error / Empty
  errorText: {
    color: colors.error,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 12,
    backgroundColor: '#fef2f2',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  emptyState: {
    paddingVertical: 56,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  emptyText: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
  },
  // User menu modal
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  menuSheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingBottom: 36,
    paddingHorizontal: 20,
  },
  menuHandle: {
    width: 36,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  menuUser: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
  },
  menuAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  menuAvatarText: {
    fontSize: 17,
  },
  menuUserInfo: {
    gap: 2,
  },
  menuUserName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  menuUserEmail: {
    fontSize: 13,
    color: colors.textMuted,
  },
  menuDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginBottom: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
  },
  menuItemTextDanger: {
    fontSize: 15,
    fontWeight: '600',
    color: '#dc2626',
  },
  // Change status modal
  statusSheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingBottom: 36,
    paddingHorizontal: 20,
  },
  statusSheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  statusSheetSubtitle: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: 16,
  },
  statusOptionList: {
    gap: 8,
  },
  statusOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: '#f8f9fb',
  },
  statusOptionText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textMuted,
  },
});
