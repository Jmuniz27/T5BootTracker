import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../../../src/theme/colors';

/**
 * Placeholder for the lead interaction history screen.
 * The full timeline lands in CB-53 (S3-6 — Logging post-llamada).
 */
export default function LeadHistoryScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity hitSlop={8} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Interaction history</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.body}>
        <Ionicons name="time-outline" size={48} color={colors.textMuted} />
        <Text style={styles.title}>Coming soon</Text>
        <Text style={styles.subtitle}>
          The interaction history for this lead will be available soon (CB-53).
        </Text>
        <Text style={styles.meta}>Lead ID: {id}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  headerSpacer: {
    width: 26,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },
  meta: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 6,
  },
});
