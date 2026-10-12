import type { Autopilota } from './autopilota'

/**
 * Si vede sempre chi lavora (0.69.0). Nicholas, 12/10: «in realtà stava
 * funzionando, ma lavora in background; io voglio sempre vedere tutto, almeno
 * vedere che stanno lavorando». Le stesse parole su PC, pagina e app: le
 * calcola il PC, la pagina e l'app le mostrano.
 */

export type EtichettaDalVivo = 'al lavoro' | 'aspetta te' | 'fermo' | 'finito'

export type StatoDalVivo = {
  etichetta: EtichettaDalVivo
  /** «da 12 min», «da 2 h». */
  da: string
  /** L'ultima cosa fatta, una riga. */
  ultimaAzione: string
  /** Al lavoro ma senza un segno di vita da almeno `SENZA_SEGNI_MS`. */
  senzaSegni?: string
}

/** Dopo quanto una chat «al lavoro» che non fa niente si segnala. */
export const SENZA_SEGNI_MS = 10 * 60_000

export function durata(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return ''
  const min = Math.floor(ms / 60_000)
  if (min < 1) return 'meno di un minuto'
  if (min < 60) return `${min} min`
  const ore = Math.floor(min / 60)
  return ore < 24 ? `${ore} h${min % 60 > 0 ? ` ${min % 60} min` : ''}` : `${Math.floor(ore / 24)} g`
}

const UNA_RIGA = (t: string): string => t.replace(/\s+/g, ' ').trim().slice(0, 140)

/**
 * Lo stato di un autopilota dal vivo. `ultimoSegno` è l'ultima volta che una
 * sua chat ha scritto qualcosa sullo schermo (o un segnale di Claude Code).
 */
export function statoAutopilotaDalVivo(a: Pick<Autopilota, 'stato' | 'ultimoEvento' | 'decisioni'> & { domanda?: unknown }, ora: number, ultimoSegno?: number): StatoDalVivo {
  const etichetta: EtichettaDalVivo = a.stato === 'finito'
    ? 'finito'
    // Solo una domanda vera: `haDomandaAperta` dice `false` quando non c'è (visto dal vero il 12/10).
    : a.stato === 'attesa' || (a.stato === 'lavoro' && a.domanda !== undefined && a.domanda !== null && a.domanda !== false)
      ? 'aspetta te'
      : a.stato === 'lavoro' || a.stato === 'intervista'
        ? 'al lavoro'
        : 'fermo'
  const ultima = a.decisioni.at(-1)
  const dal = Date.parse(a.ultimoEvento)
  const fuori: StatoDalVivo = {
    etichetta,
    da: Number.isNaN(dal) ? '' : durata(ora - dal),
    ultimaAzione: ultima !== undefined ? UNA_RIGA(ultima.cosa) : ''
  }
  const segno = ultimoSegno ?? (Number.isNaN(dal) ? undefined : dal)
  if (etichetta === 'al lavoro' && segno !== undefined && ora - segno >= SENZA_SEGNI_MS) fuori.senzaSegni = `nessun segno da ${durata(ora - segno)}`
  return fuori
}

/** Le fasi di una chat in sottofondo, nelle stesse quattro parole. */
export function etichettaSottofondo(fase: string): EtichettaDalVivo {
  if (fase === 'lavora' || fase === 'consegna' || fase === 'avvio' || fase === 'lenta') return 'al lavoro'
  if (fase === 'scelta' || fase === 'aspetta' || fase === 'pronta') return 'aspetta te'
  if (fase === 'chiusa') return 'finito'
  return 'fermo'
}

export type StatoMessaggio = { id: string; testo: string; stato: 'in attesa' | 'in consegna' | 'consegnato'; dettaglio: string; mandaAdesso?: true }

/**
 * Lo stato vero di ogni messaggio verso la chat: «consegnato alle hh:mm»,
 * «in consegna», oppure «in attesa da N min» con «Manda adesso».
 */
export function statoMessaggi(a: Pick<Autopilota, 'daConsegnare' | 'inVolo' | 'consegnatiDi' | 'stato'>, ora: number, fuso: (iso: string) => string): StatoMessaggio[] {
  const fuori: StatoMessaggio[] = []
  for (const m of a.daConsegnare) {
    const t = Date.parse(m.quando)
    fuori.push({ id: m.id, testo: UNA_RIGA(m.testo), stato: 'in attesa', dettaglio: `in attesa da ${Number.isNaN(t) ? '?' : durata(ora - t)}`, ...(a.stato === 'lavoro' ? { mandaAdesso: true as const } : {}) })
  }
  for (const v of a.inVolo ?? []) for (const m of v.messaggi) fuori.push({ id: m.id, testo: UNA_RIGA(m.testo), stato: 'in consegna', dettaglio: 'in consegna alla chat' })
  for (const m of [...(a.consegnatiDi ?? [])].reverse().slice(0, 10)) fuori.push({ id: m.id, testo: UNA_RIGA(m.testo), stato: 'consegnato', dettaglio: `consegnato alle ${fuso(m.consegnatoIl)}` })
  return fuori
}

/** L'ora come la legge Nicholas: «20:31». */
export function oraBreve(iso: string): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return '?'
  return new Date(t).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' })
}
