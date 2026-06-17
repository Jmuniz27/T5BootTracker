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
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';

// ─── constants ───────────────────────────────────────────────────────────────

const BG         = '#111c42';
const PRIMARY    = '#213A8E';
const ACCENT     = '#5B9BD5';
const INPUT_BG   = 'rgba(255,255,255,0.06)';
const INPUT_BD   = 'rgba(255,255,255,0.12)';
const INPUT_FOCUS= 'rgba(91,155,213,0.6)';

// ─── sub-components ──────────────────────────────────────────────────────────

function EmailIcon() {
  return (
    <Ionicons name="mail-outline" size={18} color="rgba(255,255,255,0.35)" />
  );
}

function LockIcon() {
  return (
    <Ionicons name="lock-closed-outline" size={18} color="rgba(255,255,255,0.35)" />
  );
}

interface FieldProps {
  icon: React.ReactNode;
  placeholder: string;
  value: string;
  onChangeText: (v: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address';
}

function Field({ icon, placeholder, value, onChangeText, secureTextEntry, keyboardType }: FieldProps) {
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);

  return (
    <View style={[styles.inputWrap, { borderColor: focused ? INPUT_FOCUS : INPUT_BD }]}>
      <View style={styles.inputIcon}>{icon}</View>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="rgba(255,255,255,0.28)"
        secureTextEntry={secureTextEntry && !visible}
        keyboardType={keyboardType ?? 'default'}
        autoCapitalize="none"
        style={styles.inputText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {secureTextEntry && (
        <TouchableOpacity onPress={() => setVisible(v => !v)} hitSlop={8} style={styles.eyeBtn}>
          <Ionicons
            name={visible ? 'eye-off-outline' : 'eye-outline'}
            size={18}
            color="rgba(255,255,255,0.35)"
          />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── screen ──────────────────────────────────────────────────────────────────

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
      router.replace('/(app)/leads');
    } catch {
      setError('Credenciales inválidas. Verifica e intenta de nuevo.');
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
        showsVerticalScrollIndicator={false}
      >
        {/* Logo */}
        <View style={styles.logoRow}>
          <Image
            source={require('../../assets/logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <View>
            <Text style={styles.logoTitle}>CODING</Text>
            <Text style={styles.logoTitle}>BOOTCAMPS</Text>
            <Text style={styles.logoSub}>espol</Text>
          </View>
        </View>

        {/* Headline */}
        <View style={styles.headlineWrap}>
          <Text style={styles.headline}>
            Inicia sesión para{' '}
            <Text style={{ color: ACCENT }}>continuar</Text>
          </Text>
          <Text style={styles.subheadline}>¡Continúa donde lo dejaste!</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <View>
            <Text style={styles.fieldLabel}>Correo electrónico</Text>
            <Field
              icon={<EmailIcon />}
              placeholder="correo@ejemplo.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
            />
          </View>

          <View>
            <View style={styles.passwordLabelRow}>
              <Text style={styles.fieldLabel}>Contraseña</Text>
              <Link href="/(auth)/forgot-password" style={styles.forgotLink}>
                ¿Olvidaste tu contraseña?
              </Link>
            </View>
            <Field
              icon={<LockIcon />}
              placeholder="••••••••••"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          {error && <Text style={styles.errorText}>{error}</Text>}

          <TouchableOpacity
            style={[styles.button, !canSubmit && styles.buttonDisabled]}
            disabled={!canSubmit}
            onPress={handleLogin}
            activeOpacity={0.88}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.buttonLabel}>Iniciar sesión</Text>
            }
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BG,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 60,
    gap: 32,
  },
  // Logo
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    justifyContent: 'center',
  },
  logo: {
    width: 44,
    height: 44,
  },
  logoTitle: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
  },
  logoSub: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 3,
  },
  // Headline
  headlineWrap: {
    gap: 6,
  },
  headline: {
    fontSize: 28,
    fontWeight: '800',
    color: '#ffffff',
    lineHeight: 34,
  },
  subheadline: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.45)',
  },
  // Form
  form: {
    gap: 18,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.65)',
    marginBottom: 8,
  },
  passwordLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  forgotLink: {
    fontSize: 13,
    color: ACCENT,
  },
  // Input
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 50,
    borderWidth: 1,
    backgroundColor: INPUT_BG,
    paddingHorizontal: 16,
    paddingVertical: 2,
  },
  inputIcon: {
    marginRight: 10,
  },
  inputText: {
    flex: 1,
    fontSize: 14,
    color: '#ffffff',
    paddingVertical: 13,
  },
  eyeBtn: {
    paddingLeft: 10,
  },
  // Button
  button: {
    borderRadius: 50,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 6,
    backgroundColor: PRIMARY,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonLabel: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 13,
    textAlign: 'center',
  },
});
