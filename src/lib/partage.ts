import { Alert, Share } from 'react-native';
import * as Sharing from 'expo-sharing';
import { Anecdote } from '../types';
import { monCodeParrainage } from './parrainage';
import { proposerAvisMagasin } from './avisMagasin';

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
 * Le lien vers la page de téléchargement, marqué de son canal et du code du
 * lecteur qui le partage.
 *
 * `src` dit par où le visiteur est arrivé, `p` qui l'a invité. La page les
 * compte, puis les transmet à Google Play dans le référent d'installation,
 * que l'app relit au premier lancement. Sans code — hors ligne, session
 * perdue — le lien reste valable, il n'est simplement rattaché à personne.
 */
export function lienTelechargement(source: string, code: string | null): string {
  const params = new URLSearchParams({ src: source });
  if (code) params.set('p', code);
  return `${PAGE_TELECHARGEMENT}?${params.toString()}`;
}

/**
 * L'invitation qui clôt tout partage.
 *
 * Elle est indispensable : l'anecdote voyage en texte brut, hors de
 * l'application, et son destinataire n'a le plus souvent pas de compte. Sans
 * cette phrase, il lit une anecdote sans jamais savoir d'où elle vient ni
 * comment en recevoir d'autres.
 */
function invitation(code: string | null): string {
  return (
    "Partagée depuis Anecto, qui envoie chaque jour une anecdote vraie et vérifiée sur ta ville.\n" +
    `Crée ton compte gratuit pour retrouver celle-ci et toutes les autres : ${lienTelechargement('partage', code)}`
  );
}

/**
 * Le texte partagé : l'anecdote entière, sa source, puis l'invitation.
 *
 * Entière, et non tronquée : une anecdote coupée en deux ne se lit pas, et
 * l'aguiche fait fuir plus qu'elle ne convertit. Ce qui protège le corpus,
 * c'est que le partage reste un geste unitaire — une anecdote à la fois,
 * choisie par un lecteur — là où l'ouverture de la lecture publique en base
 * l'exposerait en bloc.
 */
export function texteDePartage(anecdote: Anecdote, code: string | null = null): string {
  const entete = [`📖 ${anecdote.city}`, anecdote.period].filter(Boolean).join(' · ');

  // Comme à l'écran : l'accroche porte le titre, avec repli sur l'étiquette
  // courte pour les anecdotes générées avant l'accroche.
  const titre = anecdote.hook || anecdote.title;

  // L'URL est laissée nue sous la source : les messageries la transforment en
  // lien cliquable, ce qu'elles ne font pas d'un libellé.
  const source = anecdote.source_url
    ? `Source : ${anecdote.source}\n${anecdote.source_url}`
    : `Source : ${anecdote.source}`;

  return [entete, '', titre, '', anecdote.body, '', source, '', invitation(code)].join('\n');
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
  const code = await monCodeParrainage();

  try {
    const resultat = await Share.share(
      { message: texteDePartage(anecdote, code), title: titre },
      // `subject` sert d'objet quand la destination est un e-mail, `dialogTitle`
      // titre le sélecteur Android.
      { subject: `Anecto · ${titre}`, dialogTitle: 'Partager cette anecdote' }
    );
    // Qui vient d'envoyer une anecdote à un proche l'a aimée : c'est l'un des
    // deux moments où l'on propose de noter l'app. Sur Android, le système
    // répond « partagé » même si le sélecteur a été refermé sans choix.
    if (resultat.action === Share.sharedAction) proposerAvisMagasin();
  } catch (erreur) {
    // Un partage abandonné n'est pas une erreur : la promesse se résout, on ne
    // passe ici que si le système a réellement échoué à ouvrir la feuille.
    console.error(erreur);
    Alert.alert('Partage impossible', 'Réessaie dans un instant.');
  }
}

/**
 * Partage l'image d'une anecdote, déjà capturée dans un fichier local.
 *
 * `Share` de React Native ne sait pas envoyer un fichier sur Android, d'où
 * `expo-sharing` : c'est lui qui fait apparaître Instagram, WhatsApp ou les
 * stories dans le sélecteur. Le lien ne voyage pas avec l'image — aucune
 * destination ne garde les deux — c'est l'image elle-même qui nomme l'app.
 */
export async function partagerImage(uri: string): Promise<void> {
  try {
    if (!(await Sharing.isAvailableAsync())) {
      Alert.alert('Partage impossible', "Cet appareil ne permet pas de partager une image.");
      return;
    }
    await Sharing.shareAsync(uri, {
      mimeType: 'image/png',
      UTI: 'public.png',
      dialogTitle: 'Partager cette anecdote',
    });
  } catch (erreur) {
    console.error(erreur);
    Alert.alert('Partage impossible', 'Réessaie dans un instant.');
  }
}

/**
 * L'invitation seule, sans anecdote : le bouton « Inviter » des Réglages.
 */
export async function partagerInvitation(): Promise<void> {
  const code = await monCodeParrainage();
  const message =
    "Je lis chaque jour une anecdote vraie et vérifiée sur ma ville avec Anecto. " +
    `C'est gratuit, sans publicité : ${lienTelechargement('parrainage', code)}` +
    (code ? `\nSur iPhone, saisis mon code ${code} dans les Réglages de l'app.` : '');

  try {
    await Share.share(
      { message, title: 'Anecto' },
      { subject: 'Une anecdote sur ta ville, chaque jour', dialogTitle: 'Inviter un proche' }
    );
  } catch (erreur) {
    console.error(erreur);
    Alert.alert('Partage impossible', 'Réessaie dans un instant.');
  }
}
