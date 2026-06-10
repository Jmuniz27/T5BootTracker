import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { api } from '../../src/lib/api';
import { colors } from '../../src/theme/colors';

export default function ForgotPasswordScreen() {
  const [email, setEmail]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [sent, setSent]         = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const router = useRouter();

  async function handleSend() {
    setError(null);
    setLoading(true);
    try {
      await api.post('/auth/password-reset/', { email: email.trim() });
      setSent(true);
    } catch {
      setError('No pudimos procesar tu solicitud. Intenta de nuevo más tarde.');
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = email.trim() !== '' && !loading;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          <Text style={styles.title}>Recuperar contraseña</Text>

          {sent ? (
            <>
              <Text style={styles.successText}>
                Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.
              </Text>
              <TouchableOpacity style={styles.button} onPress={() => router.back()}>
                <Text style={styles.buttonLabel}>Volver al inicio de sesión</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.subtitle}>
                Ingresa tu correo y te enviaremos instrucciones para recuperar tu acceso.
              </Text>
              <View style={styles.fieldWrapper}>
                <Text style={styles.label}>Correo electrónico</Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  style={styles.input}
                  placeholderTextColor="#aaa"
                />
              </View>
              {error && <Text style={styles.errorText}>{error}</Text>}
              <TouchableOpacity
                style={[styles.button, !canSubmit && styles.buttonDisabled]}
                disabled={!canSubmit}
                onPress={handleSend}
                activeOpacity={0.85}
              >
                {loading
                  ? <ActivityIndicator color={colors.white} />
                  : <Text style={styles.buttonLabel}>Enviar instrucciones</Text>
                }
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.back()} style={styles.backLink}>
                <Text style={styles.backLinkText}>Volver al inicio de sesión</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.navy,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 60,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 24,
    padding: 28,
    gap: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  successText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
  fieldWrapper: {
    gap: 6,
  },
  label: {
    fontSize: 14,
    color: colors.textLabel,
    fontWeight: '500',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.white,
  },
  button: {
    backgroundColor: colors.navy,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonLabel: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  errorText: {
    color: colors.error,
    fontSize: 13,
    textAlign: 'center',
  },
  backLink: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  backLinkText: {
    color: colors.navy,
    fontSize: 14,
    fontWeight: '500',
  },
});
