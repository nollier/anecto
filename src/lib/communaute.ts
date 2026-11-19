// Volet Communauté : formes de données et calculs d'affichage.
//
// Sans import de `supabase` : testé sous Node (`npm test`). Les appels RPC
// sont faits par les écrans.

/** Une ligne de `campagne_communaute()` : une par option. */
export interface LigneCampagne {
  campagne_id: string;
  numero: number;
  titre: string;
  debut: string;
  fin: string;
  ouverte: boolean;
  option_id: string;
  libelle: string;
  description: string | null;
  ordre: number;
  mon_choix: boolean;
}

export interface OptionVote {
  id: string;
  libelle: string;
  description: string | null;
}

export interface Campagne {
  id: string;
  numero: number;
  titre: string;
  debut: string;
  fin: string;
  ouverte: boolean;
  options: OptionVote[];
  /** L'option choisie par le lecteur, null s'il n'a pas voté. */
  monChoix: string | null;
}

export interface Resultat {
  option_id: string;
  pourcentage: number;
  en_tete: boolean;
}

export type CategorieIdee = 'anecdotes' | 'villes' | 'notifications' | 'partage' | 'autre';
export type StatutIdee = 'envoyee' | 'retenue' | 'au_vote' | 'livree' | 'ecartee';

export interface Idee {
  id: string;
  categorie: CategorieIdee;
  texte: string;
  statut: StatutIdee;
  cree_at: string;
}

export const CATEGORIES: { cle: CategorieIdee; libelle: string }[] = [
  { cle: 'anecdotes', libelle: 'Anecdotes' },
  { cle: 'villes', libelle: 'Villes' },
  { cle: 'notifications', libelle: 'Notifications' },
  { cle: 'partage', libelle: 'Partage' },
  { cle: 'autre', libelle: 'Autre' },
];

export const STATUTS: Record<StatutIdee, { libelle: string; couleur: string; fond: string }> = {
  envoyee: { libelle: 'Envoyée', couleur: '#555555', fond: '#f0eeec' },
  retenue: { libelle: 'Retenue', couleur: '#1d6b4f', fond: '#e6f3ed' },
  au_vote: { libelle: 'Au vote', couleur: '#b3402f', fond: '#fbeeeb' },
  livree: { libelle: 'Livrée', couleur: '#1d6b4f', fond: '#e6f3ed' },
  ecartee: { libelle: 'Écartée', couleur: '#666666', fond: '#f0eeec' },
};

export const TEXTE_IDEE_MIN = 10;
export const TEXTE_IDEE_MAX = 500;

/** Regroupe les lignes de la RPC en une campagne. Null si aucune. */
export function construireCampagne(lignes: LigneCampagne[]): Campagne | null {
  if (lignes.length === 0) return null;
  const premiere = lignes[0];
  const triees = [...lignes].sort((a, b) => a.ordre - b.ordre);
  return {
    id: premiere.campagne_id,
    numero: premiere.numero,
    titre: premiere.titre,
    debut: premiere.debut,
    fin: premiere.fin,
    ouverte: premiere.ouverte,
    options: triees.map((l) => ({ id: l.option_id, libelle: l.libelle, description: l.description })),
    monChoix: triees.find((l) => l.mon_choix)?.option_id ?? null,
  };
}

const MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

function jourMois(date: Date): string {
  const j = date.getDate();
  return `${j === 1 ? '1er' : j} ${MOIS[date.getMonth()]}`;
}

/**
 * « Vote n°1 · du 1er au 14 décembre ». `fin` est exclusive (minuit le
 * lendemain du dernier jour), d'où la seconde retirée.
 */
export function periode(c: Pick<Campagne, 'numero' | 'debut' | 'fin'>): string {
  const debut = new Date(c.debut);
  const dernier = new Date(new Date(c.fin).getTime() - 1000);
  const memeMois = debut.getMonth() === dernier.getMonth();
  const de = memeMois ? (debut.getDate() === 1 ? '1er' : String(debut.getDate())) : jourMois(debut);
  return `Vote n°${c.numero} · du ${de} au ${jourMois(dernier)}`;
}

/** Dernier jour de vote : « 14 décembre ». */
export function dernierJour(fin: string): string {
  return jourMois(new Date(new Date(fin).getTime() - 1000));
}

/** « Clôture ce soir », « Clôture demain », « Clôture dans 12 jours ». */
export function cloture(fin: string, maintenant: Date = new Date()): string {
  const ms = new Date(fin).getTime() - maintenant.getTime();
  if (ms <= 0) return 'Vote clos';
  const jours = Math.ceil(ms / 86_400_000);
  if (jours <= 1) return 'Clôture ce soir';
  if (jours === 2) return 'Clôture demain soir';
  return `Clôture dans ${jours} jours`;
}

/** Les options en tête d'une campagne close (plusieurs en cas d'égalité). */
export function gagnants(campagne: Campagne, resultats: Resultat[]): OptionVote[] {
  const enTete = new Set(resultats.filter((r) => r.en_tete).map((r) => r.option_id));
  return campagne.options.filter((o) => enTete.has(o.id));
}

/** Message d'erreur lisible depuis une exception Postgres levée par une RPC. */
export function messageErreur(erreur: { message?: string } | null | undefined, defaut: string): string {
  const m = erreur?.message ?? '';
  if (m.startsWith('Une idée par semaine') || m === 'Ce vote est clos') return m;
  return defaut;
}
