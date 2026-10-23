import type { Autopilota, ChatGovernata } from '@shared/autopilota'
import { cosaFallisce, nomeControllo } from '@shared/domanda-strutturata'
import type { Bloccato } from './decisione'
import { STRATEGIE } from './strategie'

/**
 * **Un'ultima strada prima di «sono bloccato»** (0.84.3).
 *
 * Quando le strategie a gradini sono finite (`strategie.ts`) la chat ferma ha
 * in testa le sue idee sbagliate: le ha provate tutte, e ogni giro le
 * ripropone. Prima di chiedere a Nicholas il compito passa a una **chat
 * nuova**, nella stessa cartella e sullo stesso ramo, che rilegge gli errori
 * da capo. La vecchia va nel recupero di 30 giorni. Se anche la nuova si
 * blocca, allora si chiede; e intanto lei continua con il resto del lavoro
 * (`server.ts`, la domanda «che non ferma»).
 *
 * Con una chat sola (niente flotta) la sessione nuova non c'è: la stessa chat
 * riceve l'istruzione di rileggere tutto da capo, una volta.
 */

/** L'inizio della riga di diario: serve anche a riconoscere che l'ultima strada c'è già stata. */
export const RIGA_ULTIMA_STRADA = 'ultima strada — '

/** Da dove contare: dopo l'ultima risposta di Nicholas una strada nuova si può riprovare. */
function dopoUltimaRisposta(a: Pick<Autopilota, 'decisioni'>): Autopilota['decisioni'] {
  let i = a.decisioni.length - 1
  while (i >= 0 && !(a.decisioni[i]?.cosa ?? '').startsWith('risposta dell')) i -= 1
  return a.decisioni.slice(i + 1)
}

/** Serve ancora l'ultima strada, o è già stata tentata e adesso si chiede. */
export function serveUltimaStrada(a: Pick<Autopilota, 'chats' | 'decisioni'>, chatId: string | undefined): boolean {
  if (chatId !== undefined) {
    const c = a.chats.find((x) => x.id === chatId)
    return c !== undefined && c.ultimaStrada !== true
  }
  return !dopoUltimaRisposta(a).some((d) => d.cosa.startsWith(RIGA_ULTIMA_STRADA))
}

/** La chat che fa l'ultima strada: è quella che, se si blocca, fa la domanda. */
export function conUltimaStrada(c: ChatGovernata): ChatGovernata {
  return { ...c, ultimaStrada: true }
}

/** La riga per il diario e per la conversazione dell'autopilota. */
export function rigaUltimaStrada(b: Bloccato, chi: { vecchia?: string; nuova?: string }): string {
  const dove = chi.nuova !== undefined
    ? `il compito passa a una chat nuova (${chi.nuova}) che rilegge gli errori da capo; ${chi.vecchia ?? 'la chat di prima'} va nel recupero per 30 giorni`
    : 'la chat rilegge gli errori da capo, con un’ultima strada diversa da quelle già tentate'
  return `${RIGA_ULTIMA_STRADA}${cosaFallisce(b.falliti)} dopo ${b.tentativi} tentativi: prima di chiedere a Nicholas ${dove}`
}

/** Le istruzioni per chi fa l'ultima strada. */
export function testoUltimaStrada(b: Bloccato, p: { nuova: boolean; ramo?: string; compito: string }): string {
  const controlli = b.falliti.map((f) => `«${nomeControllo(f.descrizione, 160)}»`).join(', ')
  return [
    p.nuova
      ? `Sei una chat nuova: prendi il compito di una chat che si è bloccata dopo ${b.tentativi} tentativi. ${p.ramo !== undefined ? `Sei nella sua cartella, sul suo ramo ${p.ramo}` : 'Sei nella sua cartella'}: guarda cosa ha già fatto (git log, git status, i file cambiati) e riparti da lì.`
      : `Sono ${b.tentativi} giri che l’esito è identico e le strade che conosco sono finite. Prima di chiedere a Nicholas, un’ultima strada.`,
    '',
    `Non passano: ${controlli}. Gli errori, per intero:`,
    b.errori,
    '',
    'Rileggi gli errori da capo, riga per riga, senza dare per buone le idee di prima: ' +
      `le strade già tentate (${STRATEGIE.map((s) => s.nome).join(', ')}) non hanno cambiato niente. ` +
      'Scrivi in una frase la causa vera e come lo sai, poi prova una strada diversa e applicala per intero.',
    'Se dopo questo tentativo non passa ancora, chiudi il turno dicendo cosa hai scoperto: la domanda a Nicholas la fa l’autopilota, tu non chiedere niente.',
    '',
    `Il compito: ${p.compito}`
  ].join('\n')
}

/** Le istruzioni alla chat che ha fatto la domanda ma non resta ferma ad aspettare. */
export function testoMentreAspetti(b: Bloccato): string {
  return [
    `Ho chiesto a Nicholas come andare avanti: ${cosaFallisce(b.falliti)}.`,
    'Mentre aspetti la sua risposta non restare ferma: lavora al resto del tuo compito che non dipende da questo controllo.',
    'Quando la risposta arriva te la passo io. Se non c’è altro da fare, chiudi il turno con «SEGNALE: aspetto — la risposta di Nicholas».'
  ].join('\n')
}
