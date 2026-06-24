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
import { fetchLeads, assignLead, releaseLead } from '../../../src/api/leads.api';
import { api } from '../../../src/lib/api';
import { useAuth } from '../../../src/context/AuthContext';
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
  NEW:               { bg: '#fefce8', color: '#a16207', label: 'Nuevo' },
  CONTACTED:         { bg: '#dbeafe', color: '#1d4ed8', label: 'Contactado' },
  INTERESTED:        { bg: '#dcfce7', color: '#15803d', label: 'Interesado' },
  NOT_INTERESTED:    { bg: '#fee2e2', color: '#dc2626', label: 'No interesado' },
  SPEAK_COORDINATOR: { bg: '#fef9c3', color: '#a16207', label: 'Hablar coordinador' },
  CONVERTED:         { bg: '#f3e8ff', color: '#7e22ce', label: 'Convertido' },
};

const OUTCOME_CONFIG: Record<string, { bg: string; color: string; label: string }> = {
  INTERESTED:        { bg: '#dcfce7', color: '#15803d', label: 'Interesado' },
  NOT_INTERESTED:    { bg: '#fee2e2', color: '#dc2626', label: 'No interesado' },
  SPEAK_COORDINATOR: { bg: '#f3e8ff', color: '#7e22ce', label: 'Hablar coordinador' },
  NO_ANSWER:         { bg: '#f3f4f6', color: '#4b5563', label: 'No contestó' },
  CALLBACK:          { bg: '#fef9c3', color: '#a16207', label: 'Llamar después' },
};

const DISPLAY_FILTERS: { value: string | null; label: string }[] = [
  { value: null,                label: 'Todos' },
  { value: 'NEW',               label: 'Nuevo' },
  { value: 'INTERESTED',        label: 'Interesado' },
  { value: 'NOT_INTERESTED',    label: 'No interesado' },
  { value: 'NO_ANSWER',         label: 'No contestó' },
  { value: 'CALLBACK',          label: 'Llamar después' },
  { value: 'SPEAK_COORDINATOR', label: 'Hablar coordinador' },
  { value: 'CONVERTED',         label: 'Convertido' },
];

function getDisplayKey(lead: Lead): string {
  if (lead.status === 'CONVERTED') return 'CONVERTED';
  return lead.last_outcome ?? 'NEW';
}

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

function Avatar({ name }: { name: string }) {
  return (
    <View style={[styles.avatar, { backgroundColor: avatarColor(name) }]}>
      <Text style={styles.avatarText}>{getInitials(name)}</Text>
    </View>
  );
}

function StatusBadge({ status, lastOutcome }: { status: LeadStatus; lastOutcome: string | null }) {
  const cfg = status === 'CONVERTED'
    ? STATUS_CONFIG.CONVERTED
    : lastOutcome
      ? (OUTCOME_CONFIG[lastOutcome] ?? STATUS_CONFIG.NEW)
      : STATUS_CONFIG.NEW;
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
  value: string | null;
  onChange: (key: string | null) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipsRow}
    >
      {DISPLAY_FILTERS.map((f) => {
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
            <StatusBadge status={lead.status} lastOutcome={lead.last_outcome} />
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
            <Ionicons name="chatbubble-outline" size={12} color={colors.textMuted} />
            <Text style={styles.cardDetail}>{lead.interaction_count}</Text>
          </View>
        </View>
      </View>

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

// ─── screen ──────────────────────────────────────────────────────────────────

type Tab = 'my' | 'available';

export default function LeadsScreen() {
  const router = useRouter();
  const { logout } = useAuth();

  const [me, setMe]                     = useState<MeData | null>(null);
  const [tab, setTab]                   = useState<Tab>('my');
  const [search, setSearch]             = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [showFilters, setShowFilters]   = useState(false);
  const [myLeads, setMyLeads]           = useState<Lead[]>([]);
  const [available, setAvailable]       = useState<Lead[]>([]);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [menuOpen, setMenuOpen]         = useState(false);
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

  useFocusEffect(
    useCallback(() => {
      loadLeads(search);
    }, [search]),
  );

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

  const myFiltered        = statusFilter ? myLeads.filter((l) => getDisplayKey(l) === statusFilter) : myLeads;
  const availableFiltered = statusFilter ? available.filter((l) => getDisplayKey(l) === statusFilter) : available;
  const displayed         = tab === 'my' ? myFiltered : availableFiltered;

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
            {showFilters && <StatusChips value={statusFilter} onChange={setStatusFilter} />}

            {/* Tabs */}
            <View style={styles.tabs}>
              <TouchableOpacity
                style={[styles.tab, tab === 'my' && styles.tabActive]}
                onPress={() => setTab('my')}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabText, tab === 'my' && styles.tabTextActive]}>
                  Mis leads ({myFiltered.length})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, tab === 'available' && styles.tabActive]}
                onPress={() => setTab('available')}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabText, tab === 'available' && styles.tabTextActive]}>
                  Disponibles ({availableFiltered.length})
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
});
