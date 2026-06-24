import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Animated,
  Keyboard,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/lib/api';

// ─── constants ───────────────────────────────────────────────────────────────

const BG          = '#111c42';
const PRIMARY     = '#213A8E';
const ACCENT      = '#5B9BD5';
const INPUT_BG    = 'rgba(255,255,255,0.06)';
const INPUT_BD    = 'rgba(255,255,255,0.12)';
const INPUT_FOCUS = 'rgba(91,155,213,0.6)';

// ─── field ───────────────────────────────────────────────────────────────────

interface FieldProps {
  icon: React.ReactNode;
  placeholder: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: 'default' | 'email-address';
}

function Field({ icon, placeholder, value, onChangeText, keyboardType }: FieldProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.inputWrap, { borderColor: focused ? INPUT_FOCUS : INPUT_BD }]}>
      <View style={styles.inputIcon}>{icon}</View>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="rgba(255,255,255,0.28)"
        keyboardType={keyboardType ?? 'default'}
        autoCapitalize="none"
        style={styles.inputText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </View>
  );
}

// ─── screen ──────────────────────────────────────────────────────────────────

export default function ForgotPasswordScreen() {
  const [email, setEmail]     = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent]       = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const router = useRouter();

  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        Animated.timing(slideAnim, {
          toValue: -(e.endCoordinates.height / 2),
          duration: e.duration || 250,
          useNativeDriver: true,
        }).start();
      },
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      (e) => {
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: e.duration || 250,
          useNativeDriver: true,
        }).start();
      },
    );
    return () => { show.remove(); hide.remove(); };
  }, []);

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
    <View style={styles.screen}>
      <Animated.View style={[styles.inner, { transform: [{ translateY: slideAnim }] }]}>
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

          {sent ? (
            /* ── Success state ── */
            <View style={styles.successBox}>
              <View style={styles.successIcon}>
                <Ionicons name="mail-outline" size={32} color={ACCENT} />
              </View>
              <Text style={styles.headline}>Revisa tu correo</Text>
              <Text style={styles.subtext}>
                Si <Text style={{ color: ACCENT }}>{email}</Text> está registrado, recibirás
                un enlace para restablecer tu contraseña.
              </Text>
              <TouchableOpacity
                style={styles.button}
                onPress={() => router.replace('/(auth)/login')}
                activeOpacity={0.88}
              >
                <Text style={styles.buttonLabel}>Volver al inicio de sesión</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* ── Form state ── */
            <View style={styles.form}>
              <Text style={styles.headline}>
                Recuperar{' '}
                <Text style={{ color: ACCENT }}>contraseña</Text>
              </Text>
              <Text style={styles.subtext}>
                Ingresa tu correo y te enviaremos instrucciones para recuperar tu acceso.
              </Text>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Correo electrónico</Text>
                <Field
                  icon={<Ionicons name="mail-outline" size={18} color="rgba(255,255,255,0.35)" />}
                  placeholder="correo@ejemplo.com"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                />
              </View>

              {error && <Text style={styles.errorText}>{error}</Text>}

              <TouchableOpacity
                style={[styles.button, !canSubmit && styles.buttonDisabled]}
                disabled={!canSubmit}
                onPress={handleSend}
                activeOpacity={0.88}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.buttonLabel}>Enviar instrucciones</Text>
                }
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => router.back()}
                activeOpacity={0.7}
                style={styles.backLink}
              >
                <Ionicons name="chevron-back" size={14} color="rgba(255,255,255,0.5)" />
                <Text style={styles.backLinkText}>Volver al inicio de sesión</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

// ─── styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  inner:  { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingTop: 32,
    paddingBottom: 56,
    gap: 32,
  },
  // Logo
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    justifyContent: 'center',
  },
  logo:      { width: 44, height: 44 },
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
  // Form
  form:       { gap: 24 },
  headline: {
    fontSize: 28,
    fontWeight: '800',
    color: '#ffffff',
    lineHeight: 34,
    textAlign: 'center',
  },
  subtext: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    lineHeight: 21,
  },
  fieldGroup:  { gap: 8 },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.65)',
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
  inputIcon: { marginRight: 10 },
  inputText: {
    flex: 1,
    fontSize: 14,
    color: '#ffffff',
    paddingVertical: 13,
  },
  // Button
  button: {
    borderRadius: 50,
    paddingVertical: 15,
    alignItems: 'center',
    backgroundColor: PRIMARY,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonLabel: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  // Back link
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  backLinkText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    fontWeight: '500',
  },
  // Error
  errorText: {
    color: '#fca5a5',
    fontSize: 13,
    textAlign: 'center',
  },
  // Success
  successBox: {
    alignItems: 'center',
    gap: 20,
  },
  successIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(91,155,213,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
