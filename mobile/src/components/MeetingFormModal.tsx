import { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { colors } from '../theme/colors';
import type { MeetingFormValues } from '../lib/meeting-form';

interface LeadOption {
  id: string;
  name: string;
}

interface Props {
  visible: boolean;
  initial: MeetingFormValues;
  editingId: string | null;
  leads: LeadOption[];
  saving: boolean;
  deleting: boolean;
  onSave: (values: MeetingFormValues) => void;
  onDelete: () => void;
  onClose: () => void;
}

function fmt(d: Date): string {
  const day = d.toLocaleDateString('es-EC', { weekday: 'short', day: '2-digit', month: 'short' });
  const time = d.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
  return `${day} · ${time}`;
}

export default function MeetingFormModal({
  visible,
  initial,
  editingId,
  leads,
  saving,
  deleting,
  onSave,
  onDelete,
  onClose,
}: Props) {
  const [form, setForm] = useState<MeetingFormValues>(initial);
  const [leadPickerOpen, setLeadPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<'start' | 'end' | null>(null);
  const [pickerMode, setPickerMode] = useState<'date' | 'time'>('date');
  const [draft, setDraft] = useState<Date>(new Date());

  // Animaciones: el fondo hace fade-in y la hoja sube por separado.
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const sheetY = useRef(new Animated.Value(600)).current;

  // Reinicia el form y anima la entrada cada vez que se abre.
  useEffect(() => {
    if (visible) {
      setForm(initial);
      backdropOpacity.setValue(0);
      sheetY.setValue(600);
      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
        Animated.spring(sheetY, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }),
      ]).start();
    }
  }, [visible, initial, backdropOpacity, sheetY]);

  const set = <K extends keyof MeetingFormValues>(k: K, v: MeetingFormValues[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  function openPicker(target: 'start' | 'end') {
    setDraft(form[target]);
    setPickerTarget(target);
    setPickerMode('date');
  }

  function onPickerChange(event: DateTimePickerEvent, date?: Date) {
    if (event.type === 'dismissed' || !date) {
      setPickerTarget(null);
      return;
    }
    if (pickerMode === 'date') {
      const d = new Date(draft);
      d.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
      setDraft(d);
      setPickerMode('time');
    } else {
      const d = new Date(draft);
      d.setHours(date.getHours(), date.getMinutes(), 0, 0);
      const target = pickerTarget!;
      setPickerTarget(null);
      setForm((f) => {
        const next = { ...f, [target]: d };
        // Si el fin queda antes/igual que el inicio, lo empuja a +30 min.
        if (target === 'start' && next.end.getTime() <= d.getTime()) {
          next.end = new Date(d.getTime() + 30 * 60 * 1000);
        }
        return next;
      });
    }
  }

  const invalid =
    !form.title.trim() || !form.lead || form.end.getTime() <= form.start.getTime();

  return (
    <Modal visible={visible} animationType="none" transparent onRequestClose={onClose}>
      <View style={s.root}>
        <Animated.View style={[s.backdrop, { opacity: backdropOpacity }]} />
        <Animated.View style={[s.sheet, { transform: [{ translateY: sheetY }] }]}>
          <View style={s.header}>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Text style={s.cancel}>Cancelar</Text>
            </TouchableOpacity>
            <Text style={s.title}>{editingId ? 'Editar reunión' : 'Nueva reunión'}</Text>
            <TouchableOpacity onPress={() => onSave(form)} disabled={invalid || saving} hitSlop={8}>
              {saving ? (
                <ActivityIndicator size="small" color={colors.navy} />
              ) : (
                <Text style={[s.save, invalid && s.saveDisabled]}>Guardar</Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
            <Text style={s.label}>Título</Text>
            <TextInput
              style={s.input}
              value={form.title}
              onChangeText={(v) => set('title', v)}
              placeholder="Reunión con…"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={s.label}>Descripción</Text>
            <TextInput
              style={[s.input, s.textarea]}
              value={form.description}
              onChangeText={(v) => set('description', v)}
              placeholder="Detalles, próxima acción…"
              placeholderTextColor={colors.textMuted}
              multiline
            />

            <Text style={s.label}>Inicio</Text>
            <TouchableOpacity style={s.pickerBtn} onPress={() => openPicker('start')} activeOpacity={0.7}>
              <Ionicons name="time-outline" size={16} color={colors.navy} />
              <Text style={s.pickerText}>{fmt(form.start)}</Text>
            </TouchableOpacity>

            <Text style={s.label}>Fin</Text>
            <TouchableOpacity style={s.pickerBtn} onPress={() => openPicker('end')} activeOpacity={0.7}>
              <Ionicons name="time-outline" size={16} color={colors.navy} />
              <Text style={s.pickerText}>{fmt(form.end)}</Text>
            </TouchableOpacity>

            <Text style={s.label}>Lead</Text>
            <TouchableOpacity style={s.pickerBtn} onPress={() => setLeadPickerOpen(true)} activeOpacity={0.7}>
              <Ionicons name="person-outline" size={16} color={colors.navy} />
              <Text style={[s.pickerText, !form.lead && { color: colors.textMuted }]}>
                {form.leadName || 'Selecciona un lead'}
              </Text>
              <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={s.notifyRow}
              onPress={() => set('notifyLead', !form.notifyLead)}
              activeOpacity={0.7}
            >
              <View style={[s.checkbox, form.notifyLead && s.checkboxOn]}>
                {form.notifyLead && <Ionicons name="checkmark" size={14} color={colors.white} />}
              </View>
              <Text style={s.notifyText}>Invitar al lead por correo</Text>
            </TouchableOpacity>

            {editingId && (
              <TouchableOpacity style={s.deleteBtn} onPress={onDelete} disabled={deleting} activeOpacity={0.8}>
                {deleting ? (
                  <ActivityIndicator size="small" color={colors.error} />
                ) : (
                  <Text style={s.deleteText}>Eliminar reunión</Text>
                )}
              </TouchableOpacity>
            )}
          </ScrollView>
        </Animated.View>
      </View>

      {pickerTarget && (
        <DateTimePicker value={draft} mode={pickerMode} onChange={onPickerChange} />
      )}

      {/* Selector de lead */}
      <Modal visible={leadPickerOpen} transparent animationType="fade" onRequestClose={() => setLeadPickerOpen(false)}>
        <Pressable style={s.overlay} onPress={() => setLeadPickerOpen(false)}>
          <View style={s.leadSheet}>
            <Text style={s.leadTitle}>Elegir lead</Text>
            <ScrollView>
              {leads.length === 0 ? (
                <Text style={s.leadEmpty}>No hay leads disponibles.</Text>
              ) : (
                leads.map((l) => (
                  <TouchableOpacity
                    key={l.id}
                    style={s.leadRow}
                    onPress={() => {
                      set('lead', l.id);
                      set('leadName', l.name);
                      setLeadPickerOpen(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={s.leadName}>{l.name}</Text>
                    {form.lead === l.id && <Ionicons name="checkmark" size={18} color={colors.navy} />}
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#f8f9fb',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '92%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  cancel: { fontSize: 15, color: colors.textMuted },
  title: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  save: { fontSize: 15, fontWeight: '700', color: colors.navy },
  saveDisabled: { color: colors.border },
  body: { padding: 16, gap: 6, paddingBottom: 40 },
  label: { fontSize: 13, fontWeight: '600', color: colors.textPrimary, marginTop: 10 },
  input: {
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.textPrimary,
  },
  textarea: { minHeight: 80, textAlignVertical: 'top' },
  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  pickerText: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  notifyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  notifyText: { fontSize: 14, color: colors.textPrimary },
  deleteBtn: {
    marginTop: 24,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  deleteText: { color: colors.error, fontWeight: '700', fontSize: 14 },
  leadSheet: {
    backgroundColor: colors.white,
    marginTop: 'auto',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '70%',
  },
  leadTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 12 },
  leadEmpty: { fontSize: 14, color: colors.textMuted, paddingVertical: 20, textAlign: 'center' },
  leadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  leadName: { fontSize: 15, color: colors.textPrimary },
});
