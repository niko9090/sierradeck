import { randomUUID } from 'node:crypto'
import type { Autopilota, ChatGovernata } from '@shared/autopilota'
import type { Consegne } from './consegne'

/**
 * L'autopilota che lavora **attraverso** le chat, invece che al posto loro.
 *
 * Ha la stessa forma dell'esecutore che lancia processi — `avvia`, `ferma`,
 * `attivi` — e questo è il punto: il ragionamento non cambia di una riga.
 * Cambia chi tiene la tastiera. Prima era un `claude.exe` headless di cui si
 * vedeva un riassunto; adesso è una chat del mosaico, dove l'istruzione
 * compare scritta come se l'avessi digitata tu, e la risposta si legge mentre
 * arriva.
 *
 * Il guadagno non è estetico. Da lì dentro si può interrompere, correggere,
 * aggiungere un vincolo che era rimasto implicito — e l'autopilota lo legge
 * come tutto il resto della conversazione, perché è nella stessa conversazione.
 */
export function esecutoreNelMosaico(p: {
  consegne: Consegne
  /**
   * L'identificatore di sessione per una chat che non ne ha ancora uno.
   *
   * Deciso da noi e non da Claude Code: imporlo fin dall'inizio è ciò che
   * permette di aprire **quella** conversazione. Senza, l'id si scoprirebbe
   * solo al primo hook, cioè dopo minuti in cui non si sa cosa mostrare.
   */
  nuovaSessione?: () => string
  /** Dice al servizio quale sessione ha preso una chat, perché la ricordi. */
  ricorda: (autopilotaId: string, chatId: string, sessionId: string) => void
}): {
  avvia: (a: Autopilota, messaggio?: string, chat?: ChatGovernata) => Promise<void>
  ferma: (id: string, chatId?: string) => void
  attivi: () => string[]
} {
  const nuovaSessione = p.nuovaSessione ?? ((): string => randomUUID())
  /**
   * Le chat che stiamo governando adesso, con la sessione che hanno preso e il
   * workspace in cui devono stare. Il workspace serve anche a `ferma`, che
   * scrive nella chat come `avvia` e senza non saprebbe dove trovarla.
   */
  const vive = new Map<string, { autopilotaId: string; sessionId: string; workspace?: string }>()

  const chiave = (autopilotaId: string, chatId?: string): string =>
    chatId === undefined ? autopilotaId : `${autopilotaId}::${chatId}`

  return {
    avvia(a, messaggio, chat) {
      const chatId = chat?.id ?? a.id
      const k = chiave(a.id, chat?.id)

      // La sessione di prima se c'è: una chat che riprende ha già in memoria
      // l'obiettivo e il lavoro fatto, e ricominciare da capo vorrebbe dire
      // buttarlo via. Quella dell'autopilota vale per la chat singola, quella
      // della `ChatGovernata` per ciascuna della flotta.
      const gia = vive.get(k)?.sessionId ?? chat?.sessionId ?? (chat === undefined ? a.sessionId : undefined)
      const sessionId = gia ?? nuovaSessione()
      if (gia === undefined) p.ricorda(a.id, chatId, sessionId)
      vive.set(k, {
        autopilotaId: a.id,
        sessionId,
        ...(a.workspace !== undefined ? { workspace: a.workspace } : {})
      })

      p.consegne.metti({
        autopilotaId: a.id,
        chatId,
        cwd: a.cwd,
        sessionId,
        titolo: a.nome !== '' ? a.nome : a.obiettivo.slice(0, 40),
        cosa: 'scrivi',
        // **Riprendere non e ricominciare.** Senza messaggio ci sono due casi
        // molto diversi, e finora ricevevano lo stesso testo: la prima partenza
        // e il ritorno dopo un'interruzione. Al ritorno arrivava il compito
        // iniziale parola per parola - dentro la conversazione di prima, con
        // tutto il lavoro gia fatto sopra - e la chat lo leggeva per quello che
        // e: l'ordine di cominciare. Rifaceva da capo.
        testo: messaggio ?? (riprende(a, gia, chat) ? ripartiDaDove(a, chat) : primoCompito(a, chat)),
        // **Dove**, deciso da lui. Dedurlo cercando la sessione nei workspace
        // salvati funziona solo per una chat ripresa: quella che deve ancora
        // nascere lì dentro non c'è, e finiva nel workspace che avevi davanti.
        ...(a.workspace !== undefined ? { workspace: a.workspace } : {})
      })
      return Promise.resolve()
    },

    ferma(id, chatId) {
      const chiavi = chatId === undefined
        ? [...vive.keys()].filter((k) => k === id || k.startsWith(`${id}::`))
        : [chiave(id, chatId)]
      // Prima si tolgono gli ordini non ancora ritirati: consegnarli dopo aver
      // fermato l'autopilota vorrebbe dire farlo ripartire da solo.
      p.consegne.dimentica(id)
      for (const k of chiavi) {
        const viva = vive.get(k)
        if (viva === undefined) continue
        vive.delete(k)
        p.consegne.metti({
          autopilotaId: id,
          chatId: k === id ? id : k.slice(id.length + 2),
          cwd: '',
          sessionId: viva.sessionId,
          titolo: '',
          cosa: 'interrompi',
          testo: '',
          // Interrompere vuol dire scrivere dentro quella chat: senza sapere
          // dov'è, il messaggio finirebbe in una copia aperta altrove.
          ...(viva.workspace !== undefined ? { workspace: viva.workspace } : {})
        })
      }
    },

    attivi: () => [...vive.keys()]
  }
}

/**
 * Il primo messaggio: l'obiettivo, i criteri, e cosa tocca a questa chat.
 *
 * Lo stesso testo che prima finiva in `claude -p`, e non è un caso: quello che
 * cambia è la strada, non le istruzioni. Scritto però come si scrive a
 * qualcuno — perché adesso arriva in una conversazione che qualcuno legge.
 */
export function primoCompito(a: Autopilota, chat?: ChatGovernata): string {
  const intestazione =
    chat !== undefined && chat.compito !== ''
      ? [a.obiettivo, '', `Il tuo compito, dentro questo obiettivo: ${chat.compito}`].join('\n')
      : a.obiettivo

  return [
    intestazione,
    '',
    'Criteri di fine:',
    ...criteriScritti(a),
    '',
    'Lavora fino a soddisfarli tutti.',
    '',
    // Questa chat è aperta sotto gli occhi di qualcuno che può scriverci in
    // qualunque momento. Dirglielo cambia cosa fa di quei messaggi: senza,
    // un'osservazione buttata lì in mezzo verrebbe trattata come una
    // digressione da chiudere in fretta invece che come la correzione di rotta
    // che quasi sempre è — nessuno interrompe un lavoro per fare conversazione.
    'Questa conversazione è aperta davanti a chi ti ha dato il compito: se',
    'scrive qualcosa mentre lavori, è la cosa più importante che leggerai.',
    'Sa del compito più di quanto sia riuscito a scriverne, e quello che',
    'aggiunge vale più delle istruzioni qui sopra, non meno.'
  ].join('\n')
}

/** I criteri, uno per riga, con il comando che li misura quando ce l'hanno. */
function criteriScritti(a: Autopilota): string[] {
  return a.criteri.map(
    (c) => `- ${c.descrizione}${c.comando !== undefined ? ` (si verifica con: ${c.comando})` : ''}`
  )
}

/**
 * Se questa non e' una partenza ma un ritorno.
 *
 * Due condizioni, ed entrambe servono. **La sessione c'era gia'**: senza, la
 * conversazione deve ancora nascere e non c'e' niente da riprendere. **E ha
 * gia' chiuso almeno un turno**: una sessione decisa un istante prima di
 * partire esiste come identificativo ma e' vuota, e mandarle «riprendi da dove
 * eri» significherebbe chiedere di continuare un lavoro che non e' cominciato.
 *
 * Il conto dei turni e' quello della chat quando c'e' - in una flotta ognuna ha
 * il suo, e una che non ha ancora aperto bocca non va trattata come ripresa
 * solo perche' una sorella ha lavorato - e quello dell'autopilota quando la
 * chat e' una sola.
 */
export function riprende(a: Autopilota, sessioneGiaEsistente: string | undefined, chat?: ChatGovernata): boolean {
  if (sessioneGiaEsistente === undefined) return false
  return (chat === undefined ? a.cicli : chat.cicli) > 0
}

/**
 * Il messaggio con cui si torna dentro una conversazione interrotta.
 *
 * Non e' il compito: il compito e' gia' li' sopra, insieme a tutto quello che
 * e' stato fatto dopo. Quello che manca a chi riprende e' sapere **che** sta
 * riprendendo - altrimenti l'unica cosa che vede e' un ordine di partire,
 * identico a quello di ore prima, e l'unica lettura sensata di un ordine di
 * partire e' partire.
 *
 * L'obiettivo e i criteri si riscrivono lo stesso, ma dichiarati per quello che
 * sono: un promemoria. Servono nei due casi in cui la conversazione non basta -
 * una trascrizione talmente lunga che l'inizio e' stato riassunto via, e un
 * obiettivo cambiato a parole mentre si lavorava - e in entrambi costano poche
 * righe contro il rischio di continuare verso una fine che non e' piu' quella.
 */
export function ripartiDaDove(a: Autopilota, chat?: ChatGovernata): string {
  return [
    'Riprendi da dove eri: questa conversazione si e interrotta perche il',
    'programma si e riavviato, non perche il lavoro fosse finito.',
    '',
    'Prima di scrivere qualunque cosa, guarda qui sopra cosa hai gia fatto e',
    'riparti da li. Non ricominciare da capo e non rifare quello che risulta',
    'gia fatto: se un criterio e gia soddisfatto, verificalo e passa oltre.',
    '',
    `Promemoria dell'obiettivo: ${a.obiettivo}`,
    ...(chat !== undefined && chat.compito !== ''
      ? [`Il tuo compito, dentro questo obiettivo: ${chat.compito}`]
      : []),
    '',
    'Criteri di fine:',
    ...criteriScritti(a),
    '',
    'Lavora fino a soddisfarli tutti.'
  ].join('\n')
}
