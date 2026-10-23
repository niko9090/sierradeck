import type { PartiDomanda } from '@shared/domanda-strutturata'
import type { Autopilota, ChatGovernata } from '@shared/autopilota'
import { RIFACIMENTI_MAX } from '@shared/ruoli-agenti'

/**
 * **Oltre i rifacimenti decide il programma** (0.84.4).
 *
 * Fino alla 0.84.3, dopo `RIFACIMENTI_MAX` «da rifare» della Revisione sullo
 * stesso compito, il programma chiedeva a Nicholas «Come vado avanti con …,
 * che la Revisione ha già rimandato indietro N volte?» (rifallo ancora /
 * uniscilo così / lascialo fuori). Il 23/10 ne sono arrivate di continuo, sul
 * Punto, sulle domande del programma, sul Gestore RDP, e Nicholas: «sei tu
 * che devi trovare le soluzioni, non io». Adesso la strada la sceglie qui il
 * programma, in quest'ordine:
 *
 * 1. il ramo non porta niente di nuovo rispetto al principale → si chiude come doppione;
 * 2. la Revisione ha detto OK ma i criteri non passano nella copia → si
 *    rimisurano nella cartella principale su un'unione di prova e, se passano,
 *    il ramo si unisce;
 * 3. il lavoro è davvero da rifare → una chat nuova, da capo dal ramo
 *    principale, con tutte le note della Revisione;
 * 4. se anche quella viene rimandata indietro troppe volte → il lavoro si
 *    mette da parte: le altre chat continuano, a Nicholas una riga con cosa
 *    non è entrato e perché, e il compito resta nella lista dei lavori.
 */
export type StradaOltre = 'doppione' | 'rimisura' | 'da-capo' | 'da-parte'

export function oltreIlTetto(rifacimenti: number): boolean {
  return rifacimenti > RIFACIMENTI_MAX
}

/**
 * La strada per un compito rimandato indietro troppe volte. `rimisura` solo
 * se non si è già provata (`rimisurata`): un'unione di prova che non passa
 * vuol dire lavoro davvero sbagliato.
 */
export function stradaOltre(p: { senzaNovita: boolean; revisioneOk: boolean; criteriNellaCopia: boolean; rimisurata?: boolean; daCapo: boolean }): StradaOltre {
  if (p.senzaNovita) return 'doppione'
  if (p.revisioneOk && p.criteriNellaCopia && p.rimisurata !== true) return 'rimisura'
  return p.daCapo ? 'da-parte' : 'da-capo'
}

/** La domanda che fino alla 0.84.3 il programma faceva a Nicholas: se è ancora aperta, è superata. */
export function eDomandaRifacimenti(p: Pick<PartiDomanda, 'domanda'>): boolean {
  return /^Come vado avanti con «[\s\S]*», che la Revisione ha già rimandato indietro \d+ volte\?$/i.test(p.domanda.trim())
}

/** Le note della Revisione scritte nel «perché» di quella domanda. */
export function noteDallaDomanda(p: Pick<PartiDomanda, 'perche'>): string {
  return (p.perche ?? '').replace(/^L[’']ultima richiesta della Revisione:\s*/i, '').trim()
}

/** Le note di un OK della Revisione respinto perché i criteri non passavano nella copia (`verdettoAccettato`). */
export function okRespintoDaiCriteri(note: string): boolean {
  return /^La revisione diceva OK, ma il ramo rompe quello che sul ramo principale passava/i.test(note.trim())
}

/** Il nome del lavoro fra « » nella domanda, per ritrovare la chat se il contesto è andato perso. */
export function compitoDallaDomanda(p: Pick<PartiDomanda, 'domanda'>): string | undefined {
  return /^Come vado avanti con «([\s\S]*)», che la Revisione/i.exec(p.domanda.trim())?.[1]
}

/**
 * La chat ferma su quella domanda: quella del contesto, se c'è, altrimenti
 * l'unica bloccata oltre il tetto il cui compito comincia come il nome.
 */
export function chatDellaDomandaRifacimenti(a: Autopilota, chatId: string | undefined, nome: string | undefined): ChatGovernata | undefined {
  if (chatId !== undefined) return a.chats.find((c) => c.id === chatId)
  const inizio = (nome ?? '').replace(/…$/, '').trim()
  const candidate = a.chats.filter((c) => c.stato === 'bloccata' && oltreIlTetto(c.rifacimenti ?? 0) && (inizio === '' || c.compito.replace(/\s+/g, ' ').startsWith(inizio.slice(0, 40))))
  return candidate.length === 1 ? candidate[0] : undefined
}

/** Il primo messaggio della chat che rifà il compito da capo, dal ramo principale. */
export function testoDaCapo(vecchia: ChatGovernata, volte: number, note: string): string {
  return [
    `Rifai da capo il compito della chat ${vecchia.id}: la Revisione ha rimandato indietro il suo lavoro ${volte} volte e il programma riparte da zero, dal ramo principale, invece di girare in tondo. Non è un tuo errore e non serve chiedere niente a Nicholas.`,
    `Il suo ramo${vecchia.ramo !== undefined ? ` ${vecchia.ramo}` : ''} resta lì: puoi leggerlo (git log, git diff) per prendere quello che va, ma il tuo lavoro parte dal ramo principale, nella tua cartella.`,
    '',
    `Le note della Revisione, da rispettare tutte:\n${note.trim() !== '' ? note.trim() : '(nessuna nota scritta: rileggi il compito e i criteri)'}`
  ].join('\n')
}

/** La riga per Nicholas quando il lavoro si mette da parte: cosa non è entrato e perché. */
export function rigaDaParte(compito: string, perche: string): string {
  return `Non è entrato «${compito.replace(/\s+/g, ' ').slice(0, 80)}»: ${perche.replace(/\s+/g, ' ').slice(0, 200)}. L’ho messo da parte, le altre chat continuano e il compito resta nella lista dei lavori.`
}
