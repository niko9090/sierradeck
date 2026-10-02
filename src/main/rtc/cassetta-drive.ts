import type { Scatola } from '../progetti/presenza'
import {
  RINNOVA_RICHIESTA_OGNI_MS, SCHERMO_VECCHIO_MS, leggiSchermo, nomeRichiestaSchermo, nomeSchermo, nonViaDrive,
  statoDaSchermo, storiaDaSchermo, type RichiestaSchermo, type SchermoPc
} from '@shared/strada-pc'
import type { EsitoCanale } from './collegamento-rtc'

/**
 * La quarta strada (0.40.0): la **cassetta sul Drive**, quando nessuna strada
 * diretta arriva a quel PC. Lenta e dichiarata: solo per leggere lo schermo e
 * mandare un messaggio.
 *
 * - Lo schermo: chi guarda scrive sul Drive una richiesta
 *   (`schermo-chiesto-<id>`, rinnovata al massimo una volta al minuto); quel
 *   PC, al suo giro, scrive le ultime righe delle sue chat aperte
 *   (`schermo-<id>`). Arriva in dieci-trenta secondi, se quel PC è acceso e
 *   ha la 0.40.0.
 * - Il messaggio: una voce nella sua cassetta della posta, con la chat
 *   precisa; la consegna il suo postino al giro dopo.
 *
 * Risponde come risponderebbe il Client di quel PC (stato HTTP e corpo), così
 * il riquadro remoto non deve sapere da che strada arriva. Due stati in più:
 * 425 «ancora niente, aspetta» e 405 «via Drive non si può».
 */

export const ATTESA_DRIVE = 425
export const NON_VIA_DRIVE = 405
/** Lo schermo si rilegge dal Drive al massimo così spesso: quel PC lo riscrive ogni dieci secondi circa. */
const RILEGGI_SCHERMO_MS = 8000

export function creaCassettaDrive(deps: {
  scatola: () => Scatola | undefined
  io: () => string
  mioNome: () => string
  nomeDi: (pcId: string) => string
  /** Una voce nella cassetta della posta di quel PC (il postino). */
  aggiungiPosta: (pcId: string, voce: { cwd: string; testo: string; sessione?: string; daVisore?: string }) => Promise<unknown>
  adesso?: () => number
}): { chiama: (pcId: string, percorso: string, corpo?: unknown, visore?: string) => Promise<EsitoCanale>; ultimoSchermo: (pcId: string) => string | undefined } {
  const adesso = deps.adesso ?? ((): number => Date.now())
  const rinnovate = new Map<string, number>()
  const letti = new Map<string, { s: SchermoPc | undefined; il: number }>()

  const chiedi = async (s: Scatola, pcId: string): Promise<void> => {
    const prima = rinnovate.get(pcId)
    if (prima !== undefined && adesso() - prima < RINNOVA_RICHIESTA_OGNI_MS) return
    rinnovate.set(pcId, adesso())
    const r: RichiestaSchermo = { da: deps.io(), daNome: deps.mioNome(), il: new Date(adesso()).toISOString() }
    await s.scrivi(nomeRichiestaSchermo(pcId), r).catch(() => { rinnovate.delete(pcId) })
  }
  const schermo = async (s: Scatola, pcId: string): Promise<SchermoPc | undefined> => {
    const l = letti.get(pcId)
    if (l !== undefined && adesso() - l.il < RILEGGI_SCHERMO_MS) return l.s
    const x = leggiSchermo(await s.leggi<unknown>(nomeSchermo(pcId)).catch(() => undefined))
    letti.set(pcId, { s: x, il: adesso() })
    return x
  }

  return {
    ultimoSchermo: (pcId) => letti.get(pcId)?.s?.scritto,
    async chiama(pcId, percorso, corpo, visore) {
      const nome = deps.nomeDi(pcId)
      const s = deps.scatola()
      if (s === undefined) return { stato: 503, corpo: { errore: 'il Drive di questo PC non è collegato: niente cassetta' } }
      const via = percorso.split('?')[0] ?? ''
      if (!['/api/pc', '/api/stato', '/api/storia', '/api/scrivi'].includes(via)) return { stato: NON_VIA_DRIVE, corpo: { errore: nonViaDrive(via, nome) } }
      await chiedi(s, pcId)
      const sch = await schermo(s, pcId)
      const fresco = sch !== undefined && adesso() - Date.parse(sch.scritto) < SCHERMO_VECCHIO_MS
      const aspetta = { stato: ATTESA_DRIVE, corpo: { errore: `Ho chiesto a ${nome} lo schermo via Drive: arriva al suo prossimo giro (dieci-trenta secondi), se è acceso, con il Drive collegato e la 0.40.0 o successiva.` } }
      if (via === '/api/pc') return fresco ? { stato: 200, corpo: { nome: sch.nome, viaDrive: true } } : aspetta
      if (via === '/api/stato') return fresco ? { stato: 200, corpo: statoDaSchermo(sch) } : aspetta
      const chat = typeof (corpo as { chat?: unknown } | undefined)?.chat === 'string' ? (corpo as { chat: string }).chat : ''
      if (sch === undefined) return aspetta
      if (via === '/api/storia') {
        const st = storiaDaSchermo(sch, chat)
        return st === undefined ? { stato: 404, corpo: { errore: 'chat non più fra quelle aperte' } } : { stato: 200, corpo: st }
      }
      // `/api/scrivi`: una voce nella sua cassetta, per quella chat precisa.
      const c = sch.chat.find((x) => x.id === chat)
      const testo = typeof (corpo as { testo?: unknown } | undefined)?.testo === 'string' ? (corpo as { testo: string }).testo : ''
      if (c === undefined) return { stato: 404, corpo: { errore: 'chat non più fra quelle aperte' } }
      if (testo.trim() === '') return { stato: 400, corpo: { errore: 'testo vuoto' } }
      await deps.aggiungiPosta(pcId, { cwd: c.cwd, testo, ...(c.sessione !== undefined ? { sessione: c.sessione } : {}), ...(visore !== undefined ? { daVisore: visore } : {}) })
      return { stato: 200, corpo: { fatto: true, viaDrive: true } }
    }
  }
}
