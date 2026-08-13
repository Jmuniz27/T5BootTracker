import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors } from '../theme/colors';

export interface ProgramOption {
  id: string;
  name: string;
}

interface Props {
  programs: ProgramOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  placeholder?: string;
}

export default function ProgramSelect({ programs, selectedId, onSelect, placeholder }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const selected = programs.find((p) => p.id === selectedId);
  const empty = programs.length === 0;
  const ph = placeholder ?? t('leads.programSelect.placeholder');

  return (
    <>
      <TouchableOpacity style={s.control} onPress={() => setOpen(true)} activeOpacity={0.7} disabled={empty}>
        <Text style={[s.controlText, !selected && s.placeholder]} numberOfLines={1}>
          {empty ? t('leads.programSelect.loading') : selected ? selected.name : ph}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.overlay} onPress={() => setOpen(false)}>
          <View style={s.sheet}>
            <View style={s.handle} />
            <Text style={s.title}>{t('leads.programSelect.title')}</Text>
            <ScrollView style={{ maxHeight: 340 }}>
              {programs.map((p) => {
                const active = p.id === selectedId;
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[s.option, active && s.optionActive]}
                    onPress={() => { onSelect(p.id); setOpen(false); }}
                    activeOpacity={0.8}
                  >
                    <Text style={[s.optionText, active && s.optionTextActive]}>{p.name}</Text>
                    {active && <Ionicons name="checkmark" size={18} color={colors.navy} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  control: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    backgroundColor: '#f8f9fb',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  controlText: { flex: 1, fontSize: 14, color: colors.textPrimary },
  placeholder: { color: colors.textMuted },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingBottom: 36,
    paddingHorizontal: 20,
  },
  handle: { width: 36, height: 4, backgroundColor: colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  title: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, textAlign: 'center', marginBottom: 12 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 8,
    backgroundColor: '#f8f9fb',
  },
  optionActive: { borderColor: colors.navy, backgroundColor: '#eff2fb' },
  optionText: { flex: 1, fontSize: 14, fontWeight: '500', color: colors.textMuted },
  optionTextActive: { color: colors.navy, fontWeight: '700' },
});
