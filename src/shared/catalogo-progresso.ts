/**
 * Le fasi della lettura del Drive (il catalogo), raccontate: per la finestra
 * di attesa sul PC, per la pagina del telefono e per l'app.
 *
 * Nicholas (2026-09-13): «quando premo Drive voglio vedere un caricamento con
 * una finestra sua, non le scritte senza nulla finché non carica». Prima la
 * scheda restava con la sola spiegazione per tutti i secondi della lettura
 * (cassaforte, indice, elenco dei file di qui, impronte): sembrava ferma. Ora
 * la lettura dice a che punto è, e ogni fase ha una quota della barra.
 *
 * Le quote sono un'idea del tempo che ogni fase prende di solito: l'indice e
 * i file di qui sono le due letture lunghe; le impronte dipendono da quanti
 * file hanno la stessa dimensione ma data diversa (di solito pochi).
 */
export type FaseCatalogo = 'cassaforte' | 'indice' | 'archivio' | 'disco' | 'impronte' | 'confronto'

export type ProgressoCatalogo = {
  fase: FaseCatalogo
  /** Solo per le impronte: quante calcolate su quante da calcolare. */
  fatto?: number
  totale?: number
  /** Quando la lettura e' partita (ISO), per dire da quanto va. */
  avviato: string
}

export type FaseRaccontata = { fase: FaseCatalogo; nome: string; spiegazione: string; quota: number }

export const FASI_CATALOGO: ReadonlyArray<FaseRaccontata> = [
  {
    fase: 'cassaforte',
    nome: 'Cassaforte',
    spiegazione: 'Scarico le chiavi della cassaforte dal Drive e controllo che siano le stesse di questo PC.',
    quota: 10
  },
  {
    fase: 'indice',
    nome: 'Indice del Drive',
    spiegazione: 'Scarico e apro l’indice: l’elenco di tutto quello che sta sul Drive, con dimensione, data e impronta di ogni file.',
    quota: 25
  },
  {
    fase: 'archivio',
    nome: 'Workspace e progetti',
    spiegazione: 'Leggo dal Drive i workspace salvati e il registro dei progetti: da dove viene ogni cartella e su quali PC sta.',
    quota: 15
  },
  {
    fase: 'disco',
    nome: 'File di qui',
    spiegazione: 'Guardo i file di questo PC: le chat e le cartelle dei progetti che viaggiano, con dimensione e data di ognuno.',
    quota: 25
  },
  {
    fase: 'impronte',
    nome: 'Impronte',
    spiegazione: 'Per i file con la stessa dimensione ma data diversa calcolo l’impronta del contenuto: così «uguale» vuol dire uguale davvero, non «stessa data».',
    quota: 15
  },
  {
    fase: 'confronto',
    nome: 'Confronto',
    spiegazione: 'Metto in fila Drive e PC, progetto per progetto e chat per chat, e decido lo stato di ognuna: uguale, da portare qui, da aggiornare qui, solo qui.',
    quota: 10
  }
]

/** La posizione di una fase (0..5), o -1 se non e' una fase nota. */
export function indiceFase(fase: string): number {
  return FASI_CATALOGO.findIndex((f) => f.fase === fase)
}

/**
 * Quanto e' avanti la lettura, 0..100: le fasi finite per intero, quella in
 * corso in proporzione a fatto/totale quando li ha (le impronte), altrimenti
 * al suo inizio.
 */
export function percentualeCatalogo(p: Pick<ProgressoCatalogo, 'fase' | 'fatto' | 'totale'>): number {
  let prima = 0
  for (const f of FASI_CATALOGO) {
    if (f.fase === p.fase) {
      const dentro = p.totale !== undefined && p.totale > 0 ? Math.min(1, Math.max(0, p.fatto ?? 0) / p.totale) : 0
      return Math.round(prima + f.quota * dentro)
    }
    prima += f.quota
  }
  return 0
}

/**
 * La lettura raccontata: fase «n di 6», nome, cosa sta facendo, percentuale
 * e, per le impronte, il conteggio. Senza progresso (appena premuto, prima
 * che il computer risponda) e' l'inizio: fase 1, zero per cento.
 */
export function descriviCatalogo(p: Pick<ProgressoCatalogo, 'fase' | 'fatto' | 'totale'> | undefined): {
  numero: number
  di: number
  nome: string
  spiegazione: string
  perc: number
  conteggio?: string
} {
  const i = p === undefined ? 0 : Math.max(0, indiceFase(p.fase))
  const f = FASI_CATALOGO[i] as FaseRaccontata
  const perc = p === undefined ? 0 : percentualeCatalogo(p)
  const conteggio = p !== undefined && p.fase === 'impronte' && p.totale !== undefined
    ? (p.totale === 0 ? 'nessun file da controllare' : `${p.fatto ?? 0} di ${p.totale} file`)
    : undefined
  return { numero: i + 1, di: FASI_CATALOGO.length, nome: f.nome, spiegazione: f.spiegazione, perc, ...(conteggio !== undefined ? { conteggio } : {}) }
}

export type PassoCatalogo = { nome: string; spiegazione: string; stato: 'fatto' | 'corso' | 'dopo' }

/** Le sei fasi con lo stato di ciascuna rispetto a dove sta la lettura. */
export function passiDelCatalogo(p: Pick<ProgressoCatalogo, 'fase'> | undefined): PassoCatalogo[] {
  const i = p === undefined ? 0 : Math.max(0, indiceFase(p.fase))
  return FASI_CATALOGO.map((f, k) => ({
    nome: f.nome,
    spiegazione: f.spiegazione,
    stato: k < i ? 'fatto' : k === i ? 'corso' : 'dopo'
  }))
}
