import { Alert, Share } from 'react-native';
import { Anecdote } from '../types';

/**
 * Page d'atterrissage du partage.
 *
 * Le lien pointe vers une page plutôt que vers une fiche de magasin : celui
 * qui reçoit l'anecdote est sur iOS ou sur Android, on ne le sait pas, et une
 * page hébergée par GitHub Pages depuis ce dépôt se corrige sans republier
 * l'application — l'identifiant App Store, par exemple, n'existera qu'après la
 * première validation d'Apple.
 */
export const PAGE_TELECHARGEMENT = 'https://nollier.github.io/anecto/telecharger/';

/**
 * L'invitation qui clôt tout partage.
 *
 * Elle est indispensable : l'anecdote voyage en texte brut, hors de
 * l'application, et son destinataire n'a le plus souvent pas de compte. Sans
 * cette phrase, il lit une anecdote sans jamais savoir d'où elle vient ni
 * comment en recevoir d'autres.
 */
const INVITATION =
  "Partagée depuis Anecto, qui envoie chaque jour une anecdote vraie et vérifiée sur ta ville.\n" +
  `Crée ton compte gratuit pour retrouver celle-ci et toutes les autres : ${PAGE_TELECHARGEMENT}`;

/**
 * Le texte partagé : l'anecdote entière, sa source, puis l'invitation.
 *
 * Entière, et non tronquée : une anecdote coupée en deux ne se lit pas, et
 * l'aguiche fait fuir plus qu'elle ne convertit. Ce qui protège le corpus,
 * c'est que le partage reste un geste unitaire — une anecdote à la fois,
 * choisie par un lecteur — là où l'ouverture de la lecture publique en base
 * l'exposerait en bloc.
 */
export function texteDePartage(anecdote: Anecdote): string {
  const entete = [`📖 ${anecdote.city}`, anecdote.period].filter(Boolean).join(' · ');

  // Comme à l'écran : l'accroche porte le titre, avec repli sur l'étiquette
  // courte pour les anecdotes générées avant l'accroche.
  const titre = anecdote.hook || anecdote.title;

  // L'URL est laissée nue sous la source : les messageries la transforment en
  // lien cliquable, ce qu'elles ne font pas d'un libellé.
  const source = anecdote.source_url
    ? `Source : ${anecdote.source}\n${anecdote.source_url}`
    : `Source : ${anecdote.source}`;

  return [entete, '', titre, '', anecdote.body, '', source, '', INVITATION].join('\n');
}

/**
 * Ouvre la feuille de partage du système sur une anecdote.
 *
 * Tout tient dans `message`, y compris le lien : sur iOS, un `url` fourni à
 * côté fait que certaines destinations ne reprennent que lui et jettent le
 * texte — l'anecdote disparaîtrait au profit d'un lien seul.
 */
export async function partagerAnecdote(anecdote: Anecdote): Promise<void> {
  const titre = anecdote.hook || anecdote.title;

  try {
    await Share.share(
      { message: texteDePartage(anecdote), title: titre },
      // `subject` sert d'objet quand la destination est un e-mail, `dialogTitle`
      // titre le sélecteur Android.
      { subject: `Anecto · ${titre}`, dialogTitle: 'Partager cette anecdote' }
    );
  } catch (erreur) {
    // Un partage abandonné n'est pas une erreur : la promesse se résout, on ne
    // passe ici que si le système a réellement échoué à ouvrir la feuille.
    console.error(erreur);
    Alert.alert('Partage impossible', 'Réessaie dans un instant.');
  }
}
