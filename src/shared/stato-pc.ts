/**
 * Lo stato di un PC secondo il suo battito sul Drive: l'unica fonte delle
 * soglie. Prima la soglia dei 35 minuti era copiata in quattro posti e il
 * «7 giorni» della dismissione in due.
 *
 * Tre momenti nella vita di un PC che tace:
 * - meno di `SPENTO_DOPO_MS`: acceso;
 * - oltre: spento (si vede in elenco, e dopo `DISMETTI_DOPO_MS` lo si può
 *   dismettere a mano);
 * - oltre `RIMUOVI_DOPO_MS`: da rimuovere, lo toglie da solo il giro del postino
 *   (cancella la sua registrazione sul Drive, mai i progetti).
 *
 * Puro: nessun orologio, nessun Drive.
 */

const MINUTO = 60_000
const ORA = 60 * MINUTO
const GIORNO = 24 * ORA

/** Un battito più vecchio di così è un PC spento, o senza rete. */
export const SPENTO_DOPO_MS = 35 * MINUTO
/** Da quanto un PC deve tacere per poterlo dismettere a mano («Dismetti questo PC»). */
export const DISMETTI_DOPO_MS = 7 * GIORNO
/** Da quanto un PC deve tacere perché il programma lo tolga da solo dalla lista. */
export const RIMUOVI_DOPO_MS = 30 * GIORNO

export type StatoPc = {
  stato: 'acceso' | 'spento' | 'da-rimuovere'
  /** Da quanto tace; 0 se acceso, o se il battito è nel futuro (orologio sbagliato) o illeggibile. */
  spentoDaMs: number
  /** Quanti giorni (interi, per eccesso) mancano alla rimozione automatica; `null` se non si sa (battito illeggibile) o se è acceso. */
  giorniAllaRimozione: number | null
  /** Una frase breve in italiano semplice, per chi guarda l'elenco. */
  frase: string
}

function durata(ms: number): string {
  if (ms < ORA) { const m = Math.max(1, Math.floor(ms / MINUTO)); return m === 1 ? '1 minuto' : `${m} minuti` }
  if (ms < GIORNO) { const o = Math.floor(ms / ORA); return o === 1 ? '1 ora' : `${o} ore` }
  const g = Math.floor(ms / GIORNO)
  return g === 1 ? '1 giorno' : `${g} giorni`
}

/**
 * Lo stato di un PC dal suo battito (ISO). Un battito nel futuro (orologio di
 * un PC sbagliato) o illeggibile non fa mai «da-rimuovere»: nel dubbio il PC
 * resta; il futuro conta come acceso, come ha sempre fatto `pcVivo`.
 */
export function statoPc(battitoIso: string | undefined, adesso: number): StatoPc {
  const t = battitoIso === undefined ? Number.NaN : Date.parse(battitoIso)
  if (Number.isNaN(t)) return { stato: 'spento', spentoDaMs: 0, giorniAllaRimozione: null, frase: 'spento, non so da quanto' }
  const da = adesso - t
  if (da < SPENTO_DOPO_MS) return { stato: 'acceso', spentoDaMs: Math.max(0, da), giorniAllaRimozione: null, frase: 'acceso' }
  if (da > RIMUOVI_DOPO_MS) return { stato: 'da-rimuovere', spentoDaMs: da, giorniAllaRimozione: 0, frase: `spento da ${durata(da)} · si toglie al prossimo giro` }
  const giorni = Math.max(1, Math.ceil((RIMUOVI_DOPO_MS - da) / GIORNO))
  return { stato: 'spento', spentoDaMs: da, giorniAllaRimozione: giorni, frase: `spento da ${durata(da)} · si toglie fra ${giorni === 1 ? '1 giorno' : `${giorni} giorni`}` }
}

/**
 * 19/11: un PC che lavora solo con SierraDeck Aiutante («Aiuta la rete») ha il
 * battito di SierraDeck fermo, ma è vivo. SierraDeck e l'Aiutante sullo stesso
 * PC sono due registrazioni (id diversi, `aiutante` solo sulla seconda) con lo
 * stesso `host`: per ogni registrazione, «visto» è il più recente fra il suo
 * battito e quello dell'altro programma dello stesso host. Un battito nel
 * futuro vince (conta acceso, come sempre); un battito illeggibile non vale se
 * l'altro si legge. Senza `host` non si abbina nulla.
 */
export function vistoConAiutante<T extends { pcId: string; host?: string | undefined; aiutante?: unknown }>(
  lista: readonly T[], battito: (x: T) => string | undefined
): Map<string, string | undefined> {
  const chiave = (x: T): string | undefined => (typeof x.host === 'string' && x.host.trim() !== '' ? x.host.trim().toLowerCase() : undefined)
  const tempo = (iso: string | undefined): number => (iso === undefined ? Number.NaN : Date.parse(iso))
  const out = new Map<string, string | undefined>()
  for (const x of lista) {
    let migliore = battito(x)
    const h = chiave(x)
    if (h !== undefined) {
      for (const y of lista) {
        if (y === x || chiave(y) !== h || (y.aiutante === true) === (x.aiutante === true)) continue
        const by = battito(y)
        const ty = tempo(by)
        if (Number.isNaN(ty)) continue
        const tm = tempo(migliore)
        if (Number.isNaN(tm) || ty > tm) migliore = by
      }
    }
    out.set(x.pcId, migliore)
  }
  return out
}

/**
 * Il PC `pcId` visto da SierraDeck e dall'Aiutante insieme (stesso `host`): il
 * battito più recente dei due (`visto`) e `soloAiutante`, vero quando quel PC
 * è acceso solo grazie all'Aiutante: il battito di SierraDeck è vecchio (o
 * manca) e quello dell'Aiutante è recente, con la soglia di `statoPc`. Con
 * tutti e due vecchi, o con SierraDeck vivo, è falso.
 */
export function vistoDelPc<T extends { pcId: string; host?: string | undefined; aiutante?: unknown; battito?: string | undefined }>(
  lista: readonly T[], pcId: string, adesso: number
): { visto: string | undefined; soloAiutante: boolean } {
  const visto = vistoConAiutante(lista, (b) => b.battito).get(pcId)
  const suo = lista.find((x) => x.pcId === pcId)?.battito
  const soloAiutante = statoPc(suo, adesso).stato !== 'acceso' && statoPc(visto, adesso).stato === 'acceso'
  return { visto, soloAiutante }
}

/** Un PC che tace da più di `RIMUOVI_DOPO_MS`: da togliere dalla lista. */
export function daRimuovere(battitoIso: string | undefined, adesso: number): boolean {
  return statoPc(battitoIso, adesso).stato === 'da-rimuovere'
}
