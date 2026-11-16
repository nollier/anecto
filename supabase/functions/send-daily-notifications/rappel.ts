// Textes du rappel : l'anecdote du jour n'a pas été ouverte.
//
// Courts, chaleureux, et sans rien dévoiler : le titre n'apparaît pas, pour
// que la curiosité reste entière. Cinq formulations en rotation selon le
// jour, si bien qu'un lecteur rappelé trois soirs de suite ne lit jamais deux
// fois la même phrase.

const RAPPELS: ((ville: string) => { title: string; body: string })[] = [
  (ville) => ({
    title: `Ton histoire du jour sur ${ville} t'attend encore`,
    body: 'Deux minutes de lecture, rien de plus.',
  }),
  (ville) => ({
    title: `Une petite pause ? ${ville} a une histoire pour toi`,
    body: "Elle est vraie, et elle t'attend dans l'app.",
  }),
  (ville) => ({
    title: `Pas encore lue : l'anecdote du jour sur ${ville}`,
    body: 'Tu vas sûrement apprendre quelque chose.',
  }),
  (ville) => ({
    title: `${ville} garde un secret pour toi aujourd'hui`,
    body: "Ouvre Anecto pour le découvrir.",
  }),
  (ville) => ({
    title: `Ton anecdote sur ${ville} est toujours là`,
    body: 'Une histoire vraie, à lire tranquillement.',
  }),
];

export const NOMBRE_DE_VARIANTES = RAPPELS.length;

/** `jour` au format AAAA-MM-JJ : la variante change chaque jour. */
export function texteRappel(ville: string, _userId: string, jour: string): { title: string; body: string } {
  const n = Math.floor(Date.parse(`${jour}T00:00:00Z`) / 86_400_000);
  const index = ((Number.isFinite(n) ? n : 0) % RAPPELS.length + RAPPELS.length) % RAPPELS.length;
  return RAPPELS[index](ville);
}
