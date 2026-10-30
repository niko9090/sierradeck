import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { cartellaMittente, nomeFileArrivo, storicoPerLInvio, type InvioErrori, type StoricoErrori } from '@shared/storico-errori'

/**
 * Gli errori che arrivano da un altro PC o dal telefono (0.81.0), sul PC di
 * sviluppo: in `<cartella di SierraDeck>/.sierradeck/errori-arrivati/<mittente>/`,
 * un file per arrivo. La cartella è esclusa da git: gli errori restano qui.
 */

export const CARTELLA_ARRIVI = join('.sierradeck', 'errori-arrivati')

/** Il nome nel `package.json` che dice «questa è la cartella di SierraDeck». */
const NOME_PACCHETTO = 'sierradeck'

function eSierraDeck(cartella: string): boolean {
  try {
    const pkg = JSON.parse(readFileSync(join(cartella, 'package.json'), 'utf8')) as { name?: unknown }
    return pkg.name === NOME_PACCHETTO
  } catch {
    return false
  }
}

/**
 * La cartella di SierraDeck su questo PC, fra quelle candidate (il progetto
 * nel registro, le cartelle delle chat e degli autopiloti). Le copie di lavoro
 * degli autopiloti (`….sierradeck-wt/…`) no: sparirebbero con il ramo. Prima
 * quella che si chiama proprio «SierraDeck».
 */
export function cartellaDiSierraDeck(candidati: readonly string[], controlla: (c: string) => boolean = eSierraDeck): string | undefined {
  const buone = [...new Set(candidati.filter((c) => c !== ''))].filter((c) => !/\.sierradeck-wt([\\/]|$)/i.test(c) && controlla(c))
  return buone.find((c) => basename(c).toLowerCase() === NOME_PACCHETTO) ?? buone[0]
}

/**
 * Scrive un arrivo. Il nome del file è l'ora; se c'è già un file con quel nome
 * (due invii nello stesso secondo) si aggiunge `-2`, `-3`…: `wx` non
 * sovrascrive mai niente.
 */
export function salvaErroriArrivati(radice: string, invio: InvioErrori, quando: Date = new Date()): { ok: true; file: string } | { ok: false; errore: string } {
  const cartella = join(radice, CARTELLA_ARRIVI, cartellaMittente(invio.da))
  try {
    mkdirSync(cartella, { recursive: true })
  } catch (err) {
    return { ok: false, errore: `Non riesco a creare la cartella degli errori arrivati: ${err instanceof Error ? err.message : String(err)}` }
  }
  const testo = JSON.stringify({ da: invio.da, ...(invio.versione !== undefined ? { versione: invio.versione } : {}), arrivato: quando.toISOString(), voci: invio.voci }, null, 2)
  for (let n = 1; n <= 100; n += 1) {
    const file = join(cartella, nomeFileArrivo(quando, n))
    if (existsSync(file)) continue
    try {
      writeFileSync(file, testo, { encoding: 'utf8', flag: 'wx' })
      return { ok: true, file }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') continue
      return { ok: false, errore: `Non riesco a scrivere gli errori arrivati: ${err instanceof Error ? err.message : String(err)}` }
    }
  }
  return { ok: false, errore: 'Troppi arrivi nello stesso secondo: riprova.' }
}

/** Quanto storico va nella posta del Drive, al più (0.88.2). */
export const BYTE_POSTA = 48 * 1024

/**
 * «Manda al PC di sviluppo» (0.81.0), dal lato di chi manda: lo storico,
 * stretto per stare nel tetto del server, al PC scelto. Se il PC scelto è
 * questo, si salva qui senza passare dalla rete.
 */
export async function mandaErrori(p: {
  pcSviluppo: string | undefined
  io: { id: string; nome: string }
  versione: string
  storico: StoricoErrori
  /** Il nome da mostrare di un altro PC, se si conosce. */
  nomeDi: (pcId: string) => string | undefined
  chiama: (pcId: string, percorso: string, corpo: InvioErrori) => Promise<unknown>
  salvaQui: (invio: InvioErrori) => { ok: true; file: string } | { ok: false; errore: string }
  /**
   * Il PC di sviluppo non risponde (0.88.2): gli errori restano sul Drive, nella
   * sua posta, e arrivano appena si accende. `false` se l'errore non è di rete
   * (lì ha risposto, e ha detto di no) o se il Drive non prende la voce.
   */
  perPosta?: (pcId: string, invio: InvioErrori, err: unknown) => Promise<boolean>
  log: (riga: string) => void
}): Promise<{ ok: boolean; messaggio: string }> {
  if (p.pcSviluppo === undefined) return { ok: false, messaggio: 'Prima scegli il PC di sviluppo.' }
  const storico = storicoPerLInvio(p.storico)
  if (storico.voci.length === 0) return { ok: false, messaggio: 'Non c’è nessun errore da mandare.' }
  const invio: InvioErrori = { da: p.io.nome || p.io.id, versione: p.versione, voci: storico.voci }
  const quanti = `${invio.voci.length} ${invio.voci.length === 1 ? 'errore' : 'errori'}`
  if (p.pcSviluppo === p.io.id) {
    const e = p.salvaQui(invio)
    return e.ok ? { ok: true, messaggio: `Fatto: ${quanti} nella cartella degli errori arrivati di questo PC.` } : { ok: false, messaggio: e.errore }
  }
  const chiamato = p.nomeDi(p.pcSviluppo) ?? 'il PC di sviluppo'
  try {
    await p.chiama(p.pcSviluppo, '/api/errori/arrivati', invio)
    p.log(`[errori] mandati ${quanti} a ${chiamato}`)
    return { ok: true, messaggio: `Mandati a ${chiamato}: ${quanti}.` }
  } catch (err) {
    const perche = err instanceof Error ? err.message : String(err)
    // Nella posta va meno: la cassetta sul Drive è di tutti i mittenti.
    const piccolo: InvioErrori = { ...invio, voci: storicoPerLInvio(p.storico, BYTE_POSTA).voci }
    if (p.perPosta !== undefined && await p.perPosta(p.pcSviluppo, piccolo, err).catch(() => false)) {
      p.log(`[errori] ${chiamato} non risponde (${perche}): ${quanti} lasciati sul Drive`)
      return { ok: true, messaggio: `${chiamato} adesso non risponde: ${quanti} lasciati sul Drive, arrivano appena si accende.` }
    }
    p.log(`[errori] NON mandati a ${chiamato}: ${perche}`)
    return { ok: false, messaggio: `Non mandati a ${chiamato}: ${perche}` }
  }
}
