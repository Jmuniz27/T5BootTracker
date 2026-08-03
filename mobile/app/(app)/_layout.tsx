import { Redirect, Stack } from 'expo-router';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth, isMobileRole } from '../../src/context/AuthContext';
import { colors } from '../../src/theme/colors';

export default function AppLayout() {
  const { token, user, logout } = useAuth();

  if (!token) return <Redirect href="/(auth)/login" />;

  // La app mobile es para el equipo comercial (vendedores y finanzas). Un rol
  // distinto (admin, coordinador, bootcamper) con sesión guardada queda bloqueado acá.
  if (user && !isMobileRole(user.role)) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.card}>
          <Ionicons name="lock-closed-outline" size={40} color={colors.navy} />
          <Text style={styles.title}>Acceso restringido</Text>
          <Text style={styles.msg}>
            Esta aplicación es para el equipo comercial (vendedores y finanzas). Ingresa con una cuenta autorizada.
          </Text>
          <TouchableOpacity style={styles.btn} onPress={logout} activeOpacity={0.85}>
            <Text style={styles.btnText}>Cerrar sesión</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f8f9fb', justifyContent: 'center', padding: 24 },
  card: {
    backgroundColor: colors.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 28,
    alignItems: 'center',
    gap: 12,
  },
  title: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  msg: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  btn: {
    marginTop: 8,
    backgroundColor: colors.navy,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  btnText: { color: colors.white, fontWeight: '700', fontSize: 14 },
});
