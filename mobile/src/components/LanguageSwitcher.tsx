import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { setLanguage } from '../i18n';

interface Props {
  variant?: 'light' | 'dark';
}

/** Selector de idioma ES/EN. `variant="dark"` para fondos oscuros (auth). */
export default function LanguageSwitcher({ variant = 'light' }: Props) {
  const { i18n } = useTranslation();
  const current = i18n.resolvedLanguage || i18n.language;
  const dark = variant === 'dark';

  return (
    <View style={s.row}>
      {(['es', 'en'] as const).map((lng) => {
        const active = current === lng;
        return (
          <TouchableOpacity
            key={lng}
            onPress={() => setLanguage(lng)}
            style={[
              s.btn,
              active && (dark ? s.activeDark : s.activeLight),
            ]}
            activeOpacity={0.8}
          >
            <Text
              style={[
                s.text,
                dark ? s.textDark : s.textLight,
                active && s.textActive,
              ]}
            >
              {lng.toUpperCase()}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 4 },
  btn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  activeDark: { backgroundColor: 'rgba(255,255,255,0.2)' },
  activeLight: { backgroundColor: '#213A8E' },
  text: { fontSize: 12, fontWeight: '700' },
  textDark: { color: 'rgba(255,255,255,0.6)' },
  textLight: { color: '#64748b' },
  textActive: { color: '#ffffff' },
});
