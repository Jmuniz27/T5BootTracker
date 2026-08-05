import * as Clipboard from 'expo-clipboard';
import { Share } from 'react-native';

/** Copia el link de invitación al portapapeles. */
export async function copyInvitationLink(link: string): Promise<void> {
  await Clipboard.setStringAsync(link);
}

/**
 * Abre el selector nativo de apps para compartir el link (WhatsApp, SMS, etc).
 * Devuelve `true` si el usuario completó el share, `false` si lo canceló.
 */
export async function shareInvitationLink(link: string, leadName?: string): Promise<boolean> {
  const message = leadName
    ? `Hola ${leadName}, activa tu cuenta de bootcamper en Coding Bootcamps ESPOL: ${link}`
    : link;
  const result = await Share.share({ message });
  return result.action === Share.sharedAction;
}
