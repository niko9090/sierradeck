import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'
import { parole, somiglianza } from '@shared/somiglianza'

/**
 * La memoria dell'autopilota (0.71.0): le risposte già date e le decisioni di
 * Nicholas.
 *
 * - **Le risposte già date non si richiedono.** La stessa domanda (uguale
 *   parola per parola, a meno di spazi e maiuscole) riceve la risposta di
 *   prima. Una domanda solo **simile** no: la risposta di prima diventa la
 *   scelta consigliata, e si chiede. Riusare da sola una decisione presa per un
 *   bivio diverso è peggio che richiedere (revisione dell'esperto, 13/10).
 * - **Le decisioni di Nicholas** per progetto: le sue risposte e le frasi del
 *   dialogo che decidono («da ora in poi», «mai», «voglio che»). Il supervisore
 *   le legge a ogni giro, sopra a tutto il resto.
 */

/** `chat`: la chat della flotta che aveva chiesto (0.81.0), per riconoscere chi richiede. */
export type RispostaRicordata = { domanda: string; risposta: string; quando: string; chat?: string }
export type DecisioneRicordata = { testo: string; quando: string }

const RISPOSTE_MAX = 40
const DECISIONI_MAX = 30
/** Somiglianza (Jaccard sulle parole) oltre la quale due domande sono «simili». */
export const SIMILE_DA = 0.8

export const normalizzaDomanda = (t: string): string => parole(t).join(' ')
export { somiglianza }

/** Una frase del dialogo che decide qualcosa per il futuro. */
export function eUnaDecisione(testo: string): boolean {
  return /\b(decido|ho deciso|da ora in poi|d['’]ora in poi|d['’]ora in avanti|sempre|mai più|mai|non voglio|voglio che|la regola è|regola)\b/i.test(testo)
}

export function trovaRisposta(risposte: RispostaRicordata[], domanda: string): { esatta?: RispostaRicordata; simile?: RispostaRicordata } {
  const n = normalizzaDomanda(domanda)
  if (n === '') return {}
  const recenti = [...risposte].reverse()
  const esatta = recenti.find((r) => normalizzaDomanda(r.domanda) === n)
  if (esatta !== undefined) return { esatta }
  if (parole(domanda).length < 4) return {}
  const simile = recenti.find((r) => somiglianza(r.domanda, domanda) >= SIMILE_DA)
  return simile !== undefined ? { simile } : {}
}

/** La sezione del prompt del supervisore con le decisioni di Nicholas sul progetto. */
export function sezioneDecisioni(decisioni: DecisioneRicordata[]): string {
  if (decisioni.length === 0) return ''
  return [
    '## Decisioni di Nicholas su questo progetto (valgono sempre, sopra alle tue idee)',
    ...decisioni.slice(-DECISIONI_MAX).map((d) => `- ${d.quando.slice(0, 10)}: ${d.testo.slice(0, 300)}`)
  ].join('\n')
}

type FileMemoria = { versione: 1; risposte: Record<string, RispostaRicordata[]>; decisioni: Record<string, DecisioneRicordata[]> }

export type Memoria = {
  ricordaRisposta: (autopilota: string, domanda: string, risposta: string, quando: string, chat?: string) => void
  /** Le risposte ricordate di un autopilota, dalla più vecchia. */
  risposte: (autopilota: string) => RispostaRicordata[]
  rispostaPer: (autopilota: string, domanda: string) => { esatta?: RispostaRicordata; simile?: RispostaRicordata }
  ricordaDecisione: (cwd: string, testo: string, quando: string) => void
  decisioni: (cwd: string) => DecisioneRicordata[]
}

/** Le risposte già date: restano in `memoria.json`, per autopilota. */
function memoriaRisposte(m: FileMemoria, salva: () => void): Pick<Memoria, 'ricordaRisposta' | 'risposte' | 'rispostaPer'> {
  return {
    ricordaRisposta(autopilota, domanda, risposta, quando, chat) {
      if (domanda.trim() === '' || risposta.trim() === '') return
      const elenco = (m.risposte[autopilota] ?? []).filter((r) => normalizzaDomanda(r.domanda) !== normalizzaDomanda(domanda))
      m.risposte[autopilota] = [...elenco, { domanda: domanda.slice(0, 600), risposta: risposta.slice(0, 600), quando, ...(chat !== undefined ? { chat } : {}) }].slice(-RISPOSTE_MAX)
      salva()
    },
    risposte: (autopilota) => m.risposte[autopilota] ?? [],
    rispostaPer: (autopilota, domanda) => trovaRisposta(m.risposte[autopilota] ?? [], domanda)
  }
}

/**
 * Dove stanno le decisioni di Nicholas (P2, 30/10): `decisioni.md` nel
 * quaderno del progetto, senza tetto di 30 e senza legarle a un autopilota.
 */
export type DecisioniNelQuaderno = {
  ricorda: (cwd: string, testo: string, quando: string) => void
  elenca: (cwd: string) => DecisioneRicordata[]
  /** La cartella c'è ancora: le decisioni di un progetto sparito restano in `memoria.json`. */
  esiste?: (cwd: string) => boolean
}

export function apriMemoria(cartella: string | undefined, quaderno?: DecisioniNelQuaderno): Memoria {
  const file = cartella === undefined ? undefined : join(cartella, 'servizio', 'memoria.json')
  let m: FileMemoria = { versione: 1, risposte: {}, decisioni: {} }
  if (file !== undefined && existsSync(file)) {
    try {
      const x = JSON.parse(readFileSync(file, 'utf8')) as Partial<FileMemoria>
      m = { versione: 1, risposte: typeof x.risposte === 'object' && x.risposte !== null ? x.risposte : {}, decisioni: typeof x.decisioni === 'object' && x.decisioni !== null ? x.decisioni : {} }
    } catch { /* memoria illeggibile: si riparte vuoti */ }
  }
  const salva = (): void => {
    if (file === undefined) return
    try { mkdirSync(join(file, '..'), { recursive: true }); scriviJsonAtomico(file, m, 'memoria') } catch (err) { console.error('[autopilota] memoria non salvata:', err) }
  }
  const chiaveCwd = (cwd: string): string => cwd.replace(/[\\/]+$/, '').toLowerCase()
  if (quaderno !== undefined) {
    // **Una volta sola** (P2): le decisioni di `memoria.json` passano nel
    // quaderno del loro progetto e da qui escono. Quelle di una cartella che
    // non c'è più, o che non si riesce a scrivere, restano dove sono.
    const esiste = quaderno.esiste ?? existsSync
    let migrate = 0
    for (const [k, elenco] of Object.entries(m.decisioni)) {
      if (!esiste(k)) continue
      try {
        for (const d of elenco) quaderno.ricorda(k, d.testo, d.quando)
        delete m.decisioni[k]
        migrate += elenco.length
      } catch (err) {
        console.error(`[autopilota] decisioni di ${k} non passate nel quaderno:`, err)
      }
    }
    if (migrate > 0) {
      salva()
      console.info(`[autopilota] ${migrate} decisioni di Nicholas passate da memoria.json a decisioni.md`)
    }
    return {
      ...memoriaRisposte(m, salva),
      ricordaDecisione(cwd, testo, quando) {
        const t = testo.replace(/\s+/g, ' ').trim()
        if (t === '') return
        try { quaderno.ricorda(cwd, t, quando) } catch (err) { console.error('[autopilota] decisione non scritta nel quaderno:', err) }
      },
      decisioni: (cwd) => {
        try { return quaderno.elenca(cwd) } catch { return [] }
      }
    }
  }
  return {
    ...memoriaRisposte(m, salva),
    ricordaDecisione(cwd, testo, quando) {
      const t = testo.replace(/\s+/g, ' ').trim()
      if (t === '') return
      const k = chiaveCwd(cwd)
      const elenco = (m.decisioni[k] ?? []).filter((d) => d.testo !== t)
      m.decisioni[k] = [...elenco, { testo: t.slice(0, 400), quando }].slice(-DECISIONI_MAX)
      salva()
    },
    decisioni: (cwd) => m.decisioni[chiaveCwd(cwd)] ?? []
  }
}

/**
 * Una domanda simile a una già risposta: la risposta di prima diventa la
 * scelta consigliata, e il perché lo dice. Non si risponde da soli: si chiede.
 */
export function conRispostaDiPrima<P extends { perche: string; scelte: { scelta: string; conseguenza: string; consigliata?: boolean }[] }>(p: P, r: RispostaRicordata): P {
  const n = normalizzaDomanda(r.risposta)
  const i = p.scelte.findIndex((s) => normalizzaDomanda(s.scelta) === n || (n !== '' && normalizzaDomanda(r.risposta).includes(normalizzaDomanda(s.scelta)) && normalizzaDomanda(s.scelta) !== ''))
  const pulite = p.scelte.map((s) => ({ scelta: s.scelta, conseguenza: s.conseguenza }))
  const scelte = i >= 0
    ? pulite.map((s, j) => (j === i ? { ...s, consigliata: true } : s))
    : [{ scelta: r.risposta.slice(0, 60), conseguenza: 'come l’altra volta', consigliata: true }, ...pulite].slice(0, 5)
  return { ...p, scelte, perche: `${p.perche} Il ${r.quando.slice(0, 10)} avevi risposto a una domanda simile: «${r.risposta.slice(0, 160)}».`.trim() }
}
