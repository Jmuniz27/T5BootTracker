import { useState, useEffect, useRef } from 'react';
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
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../../src/theme/colors';
import { fetchLeads, assignLead, releaseLead } from '../../../src/api/leads.api';
import { api } from '../../../src/lib/api';
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
  NEW:               { bg: '#f3f4f6', color: '#6b7280', label: 'Nuevo' },
  CONTACTED:         { bg: '#fef3c7', color: '#d97706', label: 'Contactado' },
  INTERESTED:        { bg: '#dbeafe', color: '#1d4ed8', label: 'Interesado' },
  NOT_INTERESTED:    { bg: '#fee2e2', color: '#dc2626', label: 'No interesado' },
  SPEAK_COORDINATOR: { bg: '#ede9fe', color: '#7c3aed', label: 'Hablar coordinador' },
  CONVERTED:         { bg: '#dcfce7', color: '#16a34a', label: 'Convertido' },
};

const STATUS_FILTERS: { value: LeadStatus | null; label: string }[] = [
  { value: null,                label: 'Todos' },
  { value: 'NEW',               label: 'Nuevo' },
  { value: 'CONTACTED',         label: 'Contactado' },
  { value: 'INTERESTED',        label: 'Interesado' },
  { value: 'NOT_INTERESTED',    label: 'No interesado' },
  { value: 'SPEAK_COORDINATOR', label: 'Hablar coordinador' },
  { value: 'CONVERTED',         label: 'Convertido' },
];

const AVATAR_PALETTE = ['#bfdbfe', '#fef08a', '#bbf7d0', '#fecaca', '#e9d5ff', '#fed7aa'];

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

function Avatar({ name }: { name: string }) {
  return (
    <View style={[styles.avatar, { backgroundColor: avatarColor(name) }]}>
      <Text style={styles.avatarText}>{getInitials(name)}</Text>
    </View>
  );
}

function StatusBadge({ status }: { status: LeadStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.NEW;
  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

function StatusChips({
  value,
  onChange,
}: {
  value: LeadStatus | null;
  onChange: (status: LeadStatus | null) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipsRow}
    >
      {STATUS_FILTERS.map((opt) => {
        const active = value === opt.value;
        return (
          <TouchableOpacity
            key={opt.label}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onChange(opt.value)}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
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
}

function LeadCard({ lead, isAvailable, onAssign, onRelease, onViewHistory, onLogInteraction }: CardProps) {
  return (
    <View style={styles.card}>
      {/* Top: avatar + info */}
      <View style={styles.cardTop}>
        <Avatar name={lead.name} />
        <View style={styles.cardInfo}>
          <View style={styles.cardNameRow}>
            <Text style={styles.cardName} numberOfLines={1}>{lead.name}</Text>
            <StatusBadge status={lead.status} />
          </View>
          {lead.email ? (
            <View style={styles.cardRow}>
              <Ionicons name="mail-outline" size={12} color={colors.textMuted} />
              <Text style={styles.cardDetail} numberOfLines={1}>{lead.email}</Text>
            </View>
          ) : null}
          <View style={styles.cardRow}>
            <Ionicons name="call-outline" size={12} color={colors.textMuted} />
            <Text style={styles.cardDetail}>{lead.phone}</Text>
            <Text style={styles.cardDot}>·</Text>
            <Text style={styles.cardDetail}>{lead.interaction_count} interacciones</Text>
          </View>
        </View>
      </View>

      {/* Bottom: action buttons */}
      <View style={styles.cardFooter}>
        {isAvailable ? (
          <TouchableOpacity style={[styles.btnPrimary, styles.btnFull]} onPress={() => onAssign(lead.id)}>
            <Text style={styles.btnPrimaryText}>Asignarme</Text>
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity style={styles.btnGhost} onPress={() => onViewHistory(lead)}>
              <Ionicons name="time-outline" size={13} color={colors.navy} />
              <Text style={styles.btnGhostText}>Historial</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btnPrimary, { flex: 1 }]} onPress={() => onLogInteraction(lead)}>
              <Text style={styles.btnPrimaryText}>Registrar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnDanger} onPress={() => onRelease(lead.id)}>
              <Text style={styles.btnDangerText}>Desasignar</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

// ─── screen ──────────────────────────────────────────────────────────────────

type Tab = 'my' | 'available';

export default function LeadsScreen() {
  const router = useRouter();

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

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function loadLeads(q?: string) {
    try {
      const data = await fetchLeads(q ? { search: q } : undefined);
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

  function handleSearchChange(text: string) {
    setSearch(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadLeads(text), 400);
  }

  async function handleRefresh() {
    setRefreshing(true);
    await loadLeads(search);
    setRefreshing(false);
  }

  async function handleAssign(leadId: string) {
    try {
      await assignLead(leadId);
      await loadLeads(search);
    } catch {
      setError('No pudimos asignar el lead. Puede que ya haya sido tomado.');
    }
  }

  async function handleRelease(leadId: string) {
    try {
      await releaseLead(leadId);
      await loadLeads(search);
    } catch {
      setError('No pudimos desasignar el lead. Intenta de nuevo.');
    }
  }

  function handleViewHistory(lead: Lead) {
    router.push({ pathname: '/(app)/leads/[id]/history', params: { id: lead.id } });
  }

  function handleLogInteraction(lead: Lead) {
    router.push({ pathname: '/(app)/leads/[id]/log-interaction', params: { id: lead.id } });
  }

  const base = tab === 'my' ? myLeads : available;
  const displayed = statusFilter
    ? base.filter((l) => l.status === statusFilter)
    : base;

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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        ListHeaderComponent={
          <>
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity hitSlop={8}>
                <Ionicons name="menu" size={26} color={colors.textPrimary} />
              </TouchableOpacity>
              <View style={styles.headerRight}>
                <View style={styles.headerNameCol}>
                  <Text style={styles.headerName}>{me?.full_name ?? '—'}</Text>
                  <View style={styles.rolePill}>
                    <Text style={styles.roleText}>
                      {ROLE_LABEL[me?.role ?? ''] ?? me?.role}
                    </Text>
                  </View>
                </View>
                <View style={styles.userAvatar}>
                  <Text style={styles.userAvatarText}>
                    {me ? getInitials(me.full_name) : '?'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Title */}
            <View style={styles.titleSection}>
              <Text style={styles.title}>Mis leads</Text>
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
              >
                <Ionicons
                  name="funnel"
                  size={20}
                  color={showFilters || statusFilter ? colors.white : colors.textPrimary}
                />
              </TouchableOpacity>
            </View>

            {/* Status filter chips */}
            {showFilters && <StatusChips value={statusFilter} onChange={setStatusFilter} />}

            {/* Tabs */}
            <View style={styles.tabs}>
              <TouchableOpacity
                style={[styles.tab, tab === 'my' && styles.tabActive]}
                onPress={() => setTab('my')}
              >
                <Text style={[styles.tabText, tab === 'my' && styles.tabTextActive]}>
                  Mis leads ({myLeads.length})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, tab === 'available' && styles.tabActive]}
                onPress={() => setTab('available')}
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
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>
              {tab === 'my'
                ? 'No tienes leads asignados.'
                : 'No hay leads disponibles para asignarte.'}
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

// ─── styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loader: {
    marginTop: 80,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerNameCol: {
    alignItems: 'flex-end',
    gap: 3,
  },
  headerName: {
    fontSize: 15,
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
    backgroundColor: '#c7d2fe',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userAvatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.navy,
  },
  // Title
  titleSection: {
    marginBottom: 18,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  // Search
  searchRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 10,
    paddingHorizontal: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    height: 48,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
  },
  filterBtn: {
    width: 48,
    height: 48,
    backgroundColor: colors.white,
    borderRadius: 10,
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
    paddingBottom: 14,
    paddingRight: 4,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
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
    borderRadius: 10,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
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
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  cardTop: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
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
    color: colors.navy,
  },
  cardInfo: {
    flex: 1,
    gap: 3,
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
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardDetail: {
    fontSize: 12,
    color: colors.textMuted,
    flexShrink: 1,
  },
  cardDot: {
    fontSize: 12,
    color: colors.textMuted,
  },
  badge: {
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  // Card footer buttons
  cardFooter: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 4,
  },
  btnGhost: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1.5,
    borderColor: colors.navy,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  btnGhostText: {
    fontSize: 12,
    color: colors.navy,
    fontWeight: '600',
  },
  btnPrimary: {
    backgroundColor: colors.navy,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnFull: {
    flex: 1,
  },
  btnPrimaryText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  btnDanger: {
    borderWidth: 1.5,
    borderColor: '#dc2626',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDangerText: {
    fontSize: 12,
    color: '#dc2626',
    fontWeight: '600',
  },
  // Feedback
  errorText: {
    color: colors.error,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 12,
  },
  emptyState: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: colors.textMuted,
  },
});
