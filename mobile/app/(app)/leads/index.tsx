import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../../src/theme/colors';
import { fetchLeads, assignLead } from '../../../src/api/leads.api';
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
  SALESPERSON:   'Salesperson',
  ADMINISTRATOR: 'Administrator',
  COORDINATOR:   'Coordinator',
  BOOTCAMPER:    'Bootcamper',
};

const STATUS_CONFIG: Record<LeadStatus, { bg: string; color: string; label: string }> = {
  NEW:               { bg: '#f3f4f6', color: '#6b7280', label: 'New' },
  CONTACTED:         { bg: '#fef3c7', color: '#d97706', label: 'Contacted' },
  INTERESTED:        { bg: '#dbeafe', color: '#1d4ed8', label: 'Interested' },
  NOT_INTERESTED:    { bg: '#fee2e2', color: '#dc2626', label: 'Not Interested' },
  SPEAK_COORDINATOR: { bg: '#ede9fe', color: '#7c3aed', label: 'Speak Coordinator' },
  CONVERTED:         { bg: '#dcfce7', color: '#16a34a', label: 'Converted' },
};

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

interface CardProps {
  lead: Lead;
  isAvailable: boolean;
  onAssign: (id: string) => void;
  onViewHistory: (lead: Lead) => void;
  onLogInteraction: (lead: Lead) => void;
}

function LeadCard({ lead, isAvailable, onAssign, onViewHistory, onLogInteraction }: CardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.cardBody}>
        <View style={styles.cardLeft}>
          <Avatar name={lead.name} />
          <View style={styles.cardInfo}>
            <Text style={styles.cardName}>{lead.name}</Text>
            {lead.email ? (
              <View style={styles.cardRow}>
                <Ionicons name="mail-outline" size={12} color={colors.textMuted} />
                <Text style={styles.cardDetail} numberOfLines={1}>{lead.email}</Text>
              </View>
            ) : null}
            <View style={styles.cardRow}>
              <Ionicons name="call-outline" size={12} color={colors.textMuted} />
              <Text style={styles.cardDetail}>{lead.phone}</Text>
            </View>
            <View style={styles.cardMeta}>
              <StatusBadge status={lead.status} />
              <Text style={styles.interactionCount}>
                {lead.interaction_count} interactions
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.cardActions}>
          {isAvailable ? (
            <TouchableOpacity style={styles.btnPrimary} onPress={() => onAssign(lead.id)}>
              <Text style={styles.btnPrimaryText}>Claim Lead</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity style={styles.btnGhost} onPress={() => onViewHistory(lead)}>
                <Ionicons name="time-outline" size={14} color={colors.navy} />
                <Text style={styles.btnGhostText}>View history</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnPrimary} onPress={() => onLogInteraction(lead)}>
                <Text style={styles.btnPrimaryText}>Log Interaction</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

// ─── screen ──────────────────────────────────────────────────────────────────

type Tab = 'my' | 'available';

export default function LeadsScreen() {
  const router = useRouter();

  const [me, setMe]                 = useState<MeData | null>(null);
  const [tab, setTab]               = useState<Tab>('my');
  const [search, setSearch]         = useState('');
  const [myLeads, setMyLeads]       = useState<Lead[]>([]);
  const [available, setAvailable]   = useState<Lead[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function loadLeads(q?: string) {
    try {
      const data = await fetchLeads(q ? { search: q } : undefined);
      setMyLeads(data.my_leads);
      setAvailable(data.available_leads);
      setError(null);
    } catch {
      setError('Could not load leads. Please try again.');
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
      setError('Could not claim lead. It may have been taken already.');
    }
  }

  function handleViewHistory(lead: Lead) {
    router.push({ pathname: '/(app)/leads/[id]/history', params: { id: lead.id } });
  }

  function handleLogInteraction(lead: Lead) {
    router.push({ pathname: '/(app)/leads/[id]/log-interaction', params: { id: lead.id } });
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
              <View style={styles.titleRow}>
                <Text style={styles.titleIcon}>💬</Text>
                <Text style={styles.title}>My leads</Text>
              </View>
              <Text style={styles.subtitle}>Manage and track your leads</Text>
            </View>

            {/* Search */}
            <View style={styles.searchRow}>
              <View style={styles.searchBox}>
                <Ionicons name="search-outline" size={18} color={colors.textMuted} />
                <TextInput
                  style={styles.searchInput}
                  value={search}
                  onChangeText={handleSearchChange}
                  placeholder="Search by name, email or phone"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  returnKeyType="search"
                />
              </View>
              <TouchableOpacity style={styles.filterBtn}>
                <Ionicons name="funnel-outline" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            {/* Tabs */}
            <View style={styles.tabs}>
              <TouchableOpacity
                style={[styles.tab, tab === 'my' && styles.tabActive]}
                onPress={() => setTab('my')}
              >
                <Text style={[styles.tabText, tab === 'my' && styles.tabTextActive]}>
                  My Leads ({myLeads.length})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, tab === 'available' && styles.tabActive]}
                onPress={() => setTab('available')}
              >
                <Text style={[styles.tabText, tab === 'available' && styles.tabTextActive]}>
                  Available ({available.length})
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
            onViewHistory={handleViewHistory}
            onLogInteraction={handleLogInteraction}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>
              {tab === 'my'
                ? 'You have no assigned leads.'
                : 'No leads available to claim.'}
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  titleIcon: {
    fontSize: 28,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
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
  },
  cardBody: {
    flexDirection: 'row',
    gap: 12,
  },
  cardLeft: {
    flex: 1,
    flexDirection: 'row',
    gap: 12,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.navy,
  },
  cardInfo: {
    flex: 1,
    gap: 3,
  },
  cardName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
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
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  badge: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  interactionCount: {
    fontSize: 12,
    color: colors.textMuted,
  },
  // Card buttons
  cardActions: {
    gap: 8,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  btnGhost: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1.5,
    borderColor: colors.navy,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
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
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimaryText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
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
