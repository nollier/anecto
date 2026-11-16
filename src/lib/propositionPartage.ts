import AsyncStorage from '@react-native-async-storage/async-storage';

const CLE = 'anecto.partage-adore.jour';

/** Le jour local au format AAAA-MM-JJ. */
export function jourLocal(date = new Date()): string {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const j = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${j}`;
}

/**
 * Vrai si la proposition « Envoyer à un proche ? » n'a pas encore été faite
 * aujourd'hui, et la marque comme faite : une fois par jour au plus.
 */
export async function reserverPropositionDuJour(): Promise<boolean> {
  try {
    const aujourdhui = jourLocal();
    if ((await AsyncStorage.getItem(CLE)) === aujourdhui) return false;
    await AsyncStorage.setItem(CLE, aujourdhui);
    return true;
  } catch {
    return false;
  }
}
