import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ScrollView,
  StyleSheet,
  RefreshControl,
  SafeAreaView,
  Modal,
  Pressable,
  Animated,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors } from '../../../src/theme/colors';
import { fetchLeads } from '../../../src/api/leads.api';
import { api } from '../../../src/lib/api';
import { useAuth } from '../../../src/context/AuthContext';
import { FadeInView } from '../../../src/components/FadeInView';
import { LeadCardSkeleton } from '../../../src/components/Skeleton';
import LanguageSwitcher from '../../../src/components/LanguageSwitcher';
import type { Lead, LeadStatus } from '../../../src/types/leads';

interface MeData {
  id: string;
  email: string;
  full_name: string;
  role: string;
}

// ─── helpers ────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<LeadStatus, { bg: string; color: string }> = {
  NEW:            { bg: '#fefce8', color: '#a16207' },
  QUALIFIED:      { bg: '#dbeafe', color: '#1d4ed8' },
  INTERESTED:     { bg: '#dcfce7', color: '#15803d' },
  NOT_INTERESTED: { bg: '#fee2e2', color: '#dc2626' },
  CONVERTED:      { bg: '#f3e8ff', color: '#7e22ce' },
  DISCARDED:      { bg: '#f1f5f9', color: '#64748b' },
};

const STATUS_FILTER_VALUES: (LeadStatus | null)[] = [
  null, 'NEW', 'QUALIFIED', 'INTERESTED', 'NOT_INTERESTED', 'CONVERTED', 'DISCARDED',
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
function StatusBadge({ status }: { status: LeadStatus }) {
  const { t } = useTranslation();
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.NEW;
  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.badgeText, { color: cfg.color }]}>{t(`leads.status.${status}`)}</Text>
    </View>
  );
}

function StatusChips({
  value,
  onChange,
}: {
  value: LeadStatus | null;
  onChange: (key: LeadStatus | null) => void;
}) {
  const { t } = useTranslation();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipsRow}
    >
      {STATUS_FILTER_VALUES.map((value2) => {
        const active = value === value2;
        return (
          <TouchableOpacity
            key={String(value2)}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onChange(value2)}
            activeOpacity={0.7}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>
              {value2 === null ? t('leads.filterAll') : t(`leads.status.${value2}`)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

interface CardProps {
  lead: Lead;
  onOpenDetail: (lead: Lead) => void;
}

// Tarjeta minimalista: solo ícono + nombre + estado. Toda la info y acciones
// viven en la pantalla de detalle (tap sobre la tarjeta).
function LeadCard({ lead, onOpenDetail }: CardProps) {
  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.6} onPress={() => onOpenDetail(lead)}>
      <Avatar name={lead.name} isCompany={lead.is_company} />
      <Text style={styles.cardName} numberOfLines={1}>{lead.name}</Text>
      <StatusBadge status={lead.status} />
      <Ionicons name="chevron-forward" size={16} color={colors.border} />
    </TouchableOpacity>
  );
}

// ─── screen ──────────────────────────────────────────────────────────────────

type Tab = 'my' | 'available' | 'converted';

export default function LeadsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { logout, user } = useAuth();
  const isSalesperson = user?.role === 'SALESPERSON';

  const [me, setMe]                     = useState<MeData | null>(null);
  const [tab, setTab]                   = useState<Tab>('my');
  const [search, setSearch]             = useState('');
  const [statusFilter, setStatusFilter] = useState<LeadStatus | null>(null);
  const [showFilters, setShowFilters]   = useState(false);
  const [myLeads, setMyLeads]           = useState<Lead[]>([]);
  const [available, setAvailable]       = useState<Lead[]>([]);
  const [convertedLeads, setConvertedLeads] = useState<Lead[]>([]);
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

  async function loadLeads(q?: string, status?: LeadStatus | null) {
    try {
      const params: { search?: string; status?: string } = {};
      if (q) params.search = q;
      if (status) params.status = status;
      const data = await fetchLeads(Object.keys(params).length ? params : undefined);
      setMyLeads(data.my_leads);
      setAvailable(data.available_leads);
      setConvertedLeads(data.converted_leads ?? data.my_leads.filter((l) => l.status === 'CONVERTED'));
      setError(null);
    } catch {
      setError(t('leads.list.loadError'));
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

  function handleOpenDetail(lead: Lead) {
    router.push({
      pathname: '/(app)/leads/[id]',
      params: { id: lead.id, lead: JSON.stringify(lead), owned: tab === 'available' ? '0' : '1' },
    });
  }

  const activeMy = myLeads.filter((l) => l.status !== 'CONVERTED');
  const displayed = tab === 'available' ? available : tab === 'converted' ? convertedLeads : activeMy;

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        {Array.from({ length: 6 }).map((_, i) => (
          <LeadCardSkeleton key={i} />
        ))}
      </SafeAreaView>
    );
  }

  return (
    <FadeInView style={styles.screen}>
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
                <Text style={styles.headerTitle}>{t('leads.list.title')}</Text>
                <Text style={styles.headerSub}>{t('leads.list.subtitle')}</Text>
              </View>
              <View style={styles.headerRight}>
                {isSalesperson && (
                  <TouchableOpacity
                    style={styles.agendaBtn}
                    onPress={() => router.push('/(app)/agenda')}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={t('leads.list.agendaAria')}
                  >
                    <Ionicons name="calendar-outline" size={20} color={colors.navy} />
                  </TouchableOpacity>
                )}
                <View style={styles.headerNameCol}>
                  <Text style={styles.headerName}>{me?.full_name ?? '—'}</Text>
                  <View style={styles.rolePill}>
                    <Text style={styles.roleText}>
                      {me?.role ? t(`leads.roles.${me.role}`, me.role) : me?.role}
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

            {/* Indicadores (solo lectura, no son botones) */}
            <Text style={styles.sectionLabel}>{t('leads.list.indicators')}</Text>
            <View style={styles.statRow}>
              <View style={styles.statTile}>
                <Text style={styles.statValue}>{activeMy.length}</Text>
                <Text style={styles.statLabel}>{t('leads.list.myLeads')}</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statTile}>
                <Text style={styles.statValue}>{available.length}</Text>
                <Text style={styles.statLabel}>{t('leads.list.available')}</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statTile}>
                <Text style={styles.statValue}>{convertedLeads.length}</Text>
                <Text style={styles.statLabel}>{t('leads.list.converted')}</Text>
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
                  placeholder={t('leads.list.searchPlaceholder')}
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
                <Text style={[styles.tabText, tab === 'my' && styles.tabTextActive]} numberOfLines={1}>
                  {t('leads.list.tabMy', { count: activeMy.length })}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, tab === 'available' && styles.tabActive]}
                onPress={() => setTab('available')}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabText, tab === 'available' && styles.tabTextActive]} numberOfLines={1}>
                  {t('leads.list.tabAvailable', { count: available.length })}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, tab === 'converted' && styles.tabActive]}
                onPress={() => setTab('converted')}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabText, tab === 'converted' && styles.tabTextActive]} numberOfLines={1}>
                  {t('leads.list.tabConverted', { count: convertedLeads.length })}
                </Text>
              </TouchableOpacity>
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </>
        }
        renderItem={({ item }) => (
          <LeadCard lead={item} onOpenDetail={handleOpenDetail} />
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={40} color={colors.border} />
            <Text style={styles.emptyTitle}>{t('leads.list.emptyTitle')}</Text>
            <Text style={styles.emptyText}>
              {tab === 'my'
                ? t('leads.list.emptyMy')
                : tab === 'converted'
                ? t('leads.list.emptyConverted')
                : t('leads.list.emptyAvailable')}
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

            {/* Idioma */}
            <View style={styles.menuLangRow}>
              <Text style={styles.menuLangLabel}>{t('common.language')}</Text>
              <LanguageSwitcher />
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
              <Text style={styles.menuItemTextDanger}>{t('leads.list.logout')}</Text>
            </TouchableOpacity>
          </Animated.View>
        </Pressable>
      </Modal>

      {/* FAB: nuevo lead */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/(app)/leads/new')}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={t('leads.list.newLeadAria')}
      >
        <Ionicons name="add" size={28} color={colors.white} />
      </TouchableOpacity>
      </SafeAreaView>
    </FadeInView>
  );
}

// ─── styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f8f9fb',
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
  // Indicadores (solo lectura). Panel plano con divisores: se lee como un
  // resumen, no como tres botones (antes eran tarjetas con borde y elevación).
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f3f8',
    borderRadius: 14,
    paddingVertical: 12,
    marginBottom: 18,
  },
  statTile: {
    flex: 1,
    gap: 2,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    alignSelf: 'stretch',
    marginVertical: 6,
    backgroundColor: colors.border,
  },
  statValue: {
    fontSize: 26,
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
    paddingHorizontal: 2,
    alignItems: 'center',
    borderRadius: 10,
  },
  tabActive: {
    backgroundColor: colors.navy,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.white,
  },
  // Cards
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.white,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  cardName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
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
  menuLangRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
  },
  menuLangLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  menuItemTextDanger: {
    fontSize: 15,
    fontWeight: '600',
    color: '#dc2626',
  },
});
