import type { Autopilota } from './autopilota'
import type { Colore } from './stato-vista'
import { durata as durataAdesso } from './adesso'

/**
 * Si vede sempre chi lavora (0.69.0). Nicholas, 12/10: «in realtà stava
 * funzionando, ma lavora in background; io voglio sempre vedere tutto, almeno
 * vedere che stanno lavorando». Le stesse parole su PC, pagina e app: le
 * calcola il PC, la pagina e l'app le mostrano.
 */

export type EtichettaDalVivo = 'al lavoro' | 'aspetta te' | 'fermo' | 'finito'

/**
 * Il colore di ogni parola (0.80.0), uguale su PC, pagina e app. «Fermo» è
 * rosso come il LED (`ledDi`) e la palette di DESIGN.md: prima era grigio sul
 * PC e rosso sulla pagina e nell'app. «Finito» si spegne.
 */
export const COLORE_DAL_VIVO: Record<EtichettaDalVivo, Colore> = {
  'al lavoro': 'verde',
  'aspetta te': 'ambra',
  fermo: 'rosso',
  finito: 'quieto'
}

export type StatoDalVivo = {
  etichetta: EtichettaDalVivo
  /** «da 12 min», «da 2 h». */
  da: string
  /** L'ultima cosa fatta, una riga. */
  ultimaAzione: string
  /** Al lavoro ma senza un segno di vita da almeno `SENZA_SEGNI_AUTOPILOTA_MS`. */
  senzaSegni?: string
}

/** Dopo quanto una chat «al lavoro» che non fa niente si segnala. */
export const SENZA_SEGNI_MS = 10 * 60_000
/**
 * Per un autopilota: cinque minuti, come «Adesso» (`MUTA_DA_MS`) e la riga
 * della conversazione. Sulla stessa scheda «Adesso» diceva già «nessun segno
 * da 7 min» e questo avviso taceva fino a 10 (Revisione c-16, 20/10). Le chat
 * in sottofondo (`SENZA_SEGNI_MS`) restano a 10: lì il battito del Gestore non
 * è garantito.
 */
export const SENZA_SEGNI_AUTOPILOTA_MS = 5 * 60_000

/**
 * Le parole della durata sono quelle di «Adesso» (`durata` di `@shared/adesso`):
 * qui in più un tempo che non torna (negativo, non numerico) non si scrive.
 * Oltre il giorno si dicono anche le ore («1 g 2 h»), come lì.
 */
export function durata(ms: number): string {
  return !Number.isFinite(ms) || ms < 0 ? '' : durataAdesso(ms)
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
  if (etichetta === 'al lavoro' && segno !== undefined && ora - segno >= SENZA_SEGNI_AUTOPILOTA_MS) fuori.senzaSegni = `nessun segno da ${durata(ora - segno)}`
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

/**
 * I messaggi come si mostrano (0.72.1). Nicholas, 15/10: «vedo ancora un sacco
 * di messaggi "consegnato alle" che occupano tutto lo spazio». Un messaggio
 * arrivato è una spunta ✓ (l'ora e il testo nel tooltip); «in consegna» un
 * puntino; **una riga sola**, e solo se qualcosa è fermo: «in attesa da N min»
 * con «Manda adesso». Lavora sull'elenco di sempre: va anche con un PC vecchio.
 * Copiata nella pagina (`messaggiCompattiJs`) e nell'app (`messaggiCompatti` in `SchedaDomandaVista.kt`).
 */
export type MessaggiCompatti = {
  segni: { id: string; tipo: 'consegnato' | 'in consegna'; titolo: string }[]
  fermo?: { dettaglio: string; quanti: number; testo: string; mandaAdesso: boolean }
}

export function messaggiCompatti(m: StatoMessaggio[]): MessaggiCompatti {
  const segni: MessaggiCompatti['segni'] = []
  const inAttesa = m.filter((x) => x.stato === 'in attesa')
  // Dal più vecchio al più nuovo, come si leggono: l'ultimo arrivato a destra.
  for (const x of [...m].reverse()) {
    if (x.stato === 'consegnato') segni.push({ id: x.id, tipo: 'consegnato', titolo: `${x.dettaglio}: ${x.testo}` })
    else if (x.stato === 'in consegna') segni.push({ id: x.id, tipo: 'in consegna', titolo: `${x.dettaglio}: ${x.testo}` })
  }
  const primo = inAttesa[0]
  return {
    segni,
    ...(primo !== undefined
      ? { fermo: { dettaglio: primo.dettaglio, quanti: inAttesa.length, testo: primo.testo, mandaAdesso: inAttesa.some((x) => x.mandaAdesso === true) } }
      : {})
  }
}

/** L'ora come la legge Nicholas: «20:31». */
export function oraBreve(iso: string): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return '?'
  return new Date(t).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' })
}
