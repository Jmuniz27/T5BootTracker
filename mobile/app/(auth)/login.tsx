import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter, Link } from 'expo-router';
import { colors } from '../../src/theme/colors';
import { useAuth } from '../../src/context/AuthContext';

const LOGO_SIZE = 46;

function BrandLogo() {
  return (
    <View style={styles.logoRow}>
      <View style={styles.logoBox}>
        <Image
          source={require('../../assets/logo.png')}
          style={styles.logoImage}
          resizeMode="contain"
        />
      </View>
      <View style={styles.brandTextCol}>
        <View style={styles.brandPill}>
          <Text style={styles.brandName}>BOOT-TRACKER</Text>
        </View>
        <Text style={styles.brandSub}>Coding Bootcamps ESPOL</Text>
      </View>
    </View>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address';
}

function Field({ label, value, onChangeText, secureTextEntry, keyboardType }: FieldProps) {
  return (
    <View style={styles.fieldWrapper}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType ?? 'default'}
        autoCapitalize={secureTextEntry ? 'none' : keyboardType === 'email-address' ? 'none' : 'sentences'}
        style={styles.input}
        placeholderTextColor="#aaa"
      />
    </View>
  );
}

export default function LoginScreen() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const { login } = useAuth();
  const router = useRouter();

  async function handleLogin() {
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      router.replace('/(app)/home');
    } catch {
      setError('No pudimos iniciar tu sesión. Verifica tus datos e intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = email.trim() !== '' && password !== '' && !loading;

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
          <BrandLogo />
          <Text style={styles.subtitle}>Inicia sesión para continuar</Text>
          <Field
            label="Correo electrónico"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
          />
          <Field
            label="Contraseña"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          {error && <Text style={styles.errorText}>{error}</Text>}
          <Link href="/(auth)/forgot-password" style={styles.forgotLink}>
            ¿Olvidaste tu contraseña?
          </Link>
          <TouchableOpacity
            style={[styles.button, !canSubmit && styles.buttonDisabled]}
            disabled={!canSubmit}
            onPress={handleLogin}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color={colors.white} />
              : <Text style={styles.buttonLabel}>Iniciar sesión</Text>
            }
          </TouchableOpacity>
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
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 4,
  },
  brandTextCol: {
    alignItems: 'center',
    gap: 4,
  },
  logoBox: {
    width: 59,
    height: 57,
    borderRadius: 5,
    backgroundColor: colors.navy,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoImage: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
  },
  brandPill: {
    backgroundColor: colors.navy,
    borderRadius: 5,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  brandName: {
    color: colors.white,
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 0.8,
  },
  brandSub: {
    color: colors.navy,
    fontSize: 11,
    fontWeight: '500',
  },
  subtitle: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 14,
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
  errorText: {
    color: colors.error,
    fontSize: 13,
    textAlign: 'center',
  },
  forgotLink: {
    color: colors.navy,
    fontSize: 13,
    textAlign: 'right',
    fontWeight: '500',
  },
  buttonLabel: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
