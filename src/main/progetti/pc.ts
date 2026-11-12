import { copyFileSync, existsSync } from 'node:fs'
import { join, relative, isAbsolute } from 'node:path'
import { randomBytes } from 'node:crypto'
import { scriviAtomico } from '@shared/scrittura-atomica'
import { nomeDaMostrare, nomeSceltoValido } from '@shared/nome-pc'
import { memoriaDiFile } from '../memoria-di-file'

/**
 * L'identita' di questo PC, per il registro dei progetti sul Drive.
 *
 * Il registro e' condiviso fra i PC e dice dove sta ogni progetto **su
 * ciascuno**: serve una chiave stabile per computer, che non cambi con il nome
 * di rete e non viaggi con la sincronizzazione. Sta in `pc.json`, fuori
 * dall'allowlist della cassaforte, insieme alla cartella in cui questo PC
 * riceve i progetti che arrivano dagli altri.
 */
export type IdentitaPc = {
  id: string
  /**
   * Il nome **da mostrare** (dalla 0.52.4): quello scelto da chi usa il PC,
   * altrimenti l'hostname. È questo che va nel battito, nelle presenze e
   * ovunque un altro PC o il telefono vede questo computer.
   */
  nome: string
  /** Il nome tecnico della macchina (hostname): solo come sottotitolo. */
  host: string
  /** Il nome scelto, se c'è («Altri computer» sul PC, o dal telefono). */
  nomeScelto?: string
  /** Dove finiscono i progetti che arrivano dal Drive e non hanno ancora una cartella qui. */
  cartellaProgetti: string
}

export const FILE_PC = 'pc.json'

export type IdentitaPcStore = {
  leggi: () => IdentitaPc
  impostaCartellaProgetti: (percorso: string) => IdentitaPc
  /** Cambia il nome scelto; vuoto = si torna all'hostname. */
  impostaNome: (nome: string) => IdentitaPc
}

/**
 * La cartella dei progetti di una copia di prova (`SIERRADECK_PROVA`, 0.75.2):
 * sempre dentro la cartella della prova. Prima la copia leggeva il `pc.json`
 * copiato dai dati veri, o la predefinita nella home, e i workspace creati nelle
 * prove («Prova elenco», «Seconda prova») finivano fra i progetti veri.
 */
export function cartellaProgettiDellaProva(prova: string, scelta: string | undefined): string {
  if (scelta !== undefined && scelta !== '') {
    const r = relative(prova, scelta)
    if (r !== '' && !r.startsWith('..') && !isAbsolute(r)) return scelta
  }
  return join(prova, 'Progetti SierraDeck')
}

export function apriIdentitaPc(dati: string, deps: { nome: () => string; casa: () => string; documenti?: () => string; prova?: string }): IdentitaPcStore {
  const percorso = join(dati, FILE_PC)
  /**
   * Dove ricevere i progetti se nessuno ha scelto: in Documenti (Nicholas,
   * 2026-09-08: «va sempre in Documenti, nella cartella di SierraDeck per i
   * progetti»). Fino alla 0.18 era nella home: chi ce l'ha gia' li' la tiene,
   * non si sposta niente da soli.
   */
  const predefinita = (): string => {
    const vecchia = join(deps.casa(), 'Progetti SierraDeck')
    if (existsSync(vecchia)) return vecchia
    return join(deps.documenti?.() ?? deps.casa(), 'Progetti SierraDeck')
  }

  // `pc.json` si legge in decine di punti, anche per ogni chat (0.80.0): si
  // tiene finché il file non cambia.
  const memoria = memoriaDiFile(percorso, (t) => JSON.parse(t) as Record<string, unknown>)
  // L'hostname costa 0,3 ms a chiamata su Windows e cambia solo con un riavvio
  // (0.80.0): si chiede una volta. Se fallisce si richiede la volta dopo.
  let hostRicordato: string | undefined
  const nomeHost = (): string => {
    if (hostRicordato !== undefined) return hostRicordato
    try { hostRicordato = deps.nome() } catch { return '' }
    return hostRicordato
  }
  /**
   * L'identità NON deve mai cambiare da sola (0.102.0). Prima, se `pc.json` non
   * si leggeva (antivirus, file a zeri dopo uno spegnimento: è successo a
   * `.git/config` l'11/11) si inventava un id nuovo e lo si scriveva sopra:
   * da lì tutti i progetti di questo PC sembravano «di un PC sconosciuto» e
   * partivano proposte di spostamento, rifiuti e archiviazioni.
   *
   * Ora: c'è una copia di riserva (`pc.json.riserva`), l'id letto una volta
   * resta quello per tutta la sessione, e un id nuovo nasce solo quando non
   * c'è proprio niente (prima accensione). Un file rovinato si mette da parte,
   * non si sovrascrive.
   */
  const percorsoRiserva = `${percorso}.riserva`
  const riserva = memoriaDiFile(percorsoRiserva, (t) => JSON.parse(t) as Record<string, unknown>)
  let idDellaSessione: string | undefined
  /** Gli ultimi dati buoni letti in questa sessione, per riscrivere un file rovinato. */
  let ultimiBuoni: Partial<IdentitaPc> = {}
  let daRiscrivere = false
  type Lettura = { stato: 'ok'; dati: Partial<IdentitaPc> } | { stato: 'assente' } | { stato: 'illeggibile' }
  const interpreta = (j: Record<string, unknown>): Partial<IdentitaPc> => ({
    ...(typeof j.id === 'string' && j.id !== '' ? { id: j.id } : {}),
    ...(typeof j.nome === 'string' ? { nome: j.nome } : {}),
    ...(typeof j.nomeScelto === 'string' && nomeSceltoValido(j.nomeScelto) !== '' ? { nomeScelto: nomeSceltoValido(j.nomeScelto) } : {}),
    ...(typeof j.cartellaProgetti === 'string' && j.cartellaProgetti !== '' ? { cartellaProgetti: j.cartellaProgetti } : {})
  })
  const leggiDa = (m: typeof memoria, nome: string): Lettura => {
    try {
      const j = m.leggi()
      if (j === undefined) return { stato: 'assente' }
      if (j === null || typeof j !== 'object') return { stato: 'illeggibile' }
      const d = interpreta(j)
      return d.id === undefined ? { stato: 'illeggibile' } : { stato: 'ok', dati: d }
    } catch (err) {
      console.error(`[progetti] ${nome} illeggibile:`, err)
      return { stato: 'illeggibile' }
    }
  }
  /** Mette da parte un `pc.json` rovinato invece di scriverci sopra. */
  const metteDaParte = (): void => {
    try {
      if (existsSync(percorso)) copyFileSync(percorso, `${percorso}.rovinato-${Date.now()}`)
    } catch { /* se non si copia, pazienza: la riserva ha i dati buoni */ }
  }
  const leggiGrezza = (): Partial<IdentitaPc> => {
    const principale = leggiDa(memoria, FILE_PC)
    if (principale.stato === 'ok') {
      ultimiBuoni = principale.dati
      if (!existsSync(percorsoRiserva)) {
        try { scriviAtomico(percorsoRiserva, JSON.stringify(principale.dati, null, 2), 'progetti') } catch { /* riprova la prossima volta */ }
      }
      return principale.dati
    }
    const r = leggiDa(riserva, `${FILE_PC}.riserva`)
    if (r.stato === 'ok') {
      // Si rimette a posto il principale dalla riserva.
      if (principale.stato === 'illeggibile') metteDaParte()
      try {
        scriviAtomico(percorso, JSON.stringify(r.dati, null, 2), 'progetti')
        memoria.dimentica()
        console.warn(`[progetti] ${FILE_PC} ${principale.stato}: rimesso dalla riserva (id ${r.dati.id})`)
      } catch { /* si usa comunque la riserva */ }
      ultimiBuoni = r.dati
      return r.dati
    }
    if (principale.stato === 'illeggibile') metteDaParte()
    daRiscrivere = true
    if (idDellaSessione !== undefined) return { ...ultimiBuoni, id: idDellaSessione }
    return {}
  }
  /**
   * Su disco `nome` resta quello di sempre (l'hostname della prima volta) e
   * il nome scelto sta a parte: una versione vecchia che rilegge il file
   * trova quello che si aspetta.
   */
  const scrivi = (g: Partial<IdentitaPc> & { id: string; cartellaProgetti: string }): void => {
    const suDisco = { id: g.id, nome: g.nome ?? deps.nome(), cartellaProgetti: g.cartellaProgetti, ...(g.nomeScelto !== undefined && g.nomeScelto !== '' ? { nomeScelto: g.nomeScelto } : {}) }
    const testo = JSON.stringify(suDisco, null, 2)
    scriviAtomico(percorso, testo, 'progetti')
    memoria.dimentica()
    try { scriviAtomico(percorsoRiserva, testo, 'progetti'); riserva.dimentica() } catch { /* la riserva si rifà alla prossima lettura */ }
  }

  const leggi = (): IdentitaPc => {
    const g = leggiGrezza()
    const id = idDellaSessione ?? g.id ?? randomBytes(6).toString('hex')
    idDellaSessione = id
    const cartellaProgetti = deps.prova !== undefined && deps.prova !== ''
      ? cartellaProgettiDellaProva(deps.prova, g.cartellaProgetti)
      : g.cartellaProgetti ?? predefinita()
    // La prima volta si scrive, cosi' l'id resta quello.
    if (g.id === undefined || g.id !== id || daRiscrivere) {
      daRiscrivere = false
      scrivi({ ...g, id, cartellaProgetti })
    }
    let host = nomeHost()
    if (host === '') host = g.nome ?? ''
    return {
      id,
      nome: nomeDaMostrare({ nomeScelto: g.nomeScelto ?? null, host }),
      host,
      ...(g.nomeScelto !== undefined ? { nomeScelto: g.nomeScelto } : {}),
      cartellaProgetti
    }
  }

  return {
    leggi,
    impostaCartellaProgetti(cartellaProgetti) {
      const g = leggiGrezza()
      scrivi({ ...g, id: leggi().id, cartellaProgetti })
      return leggi()
    },
    impostaNome(nome) {
      const g = leggiGrezza()
      const i = leggi()
      const { nomeScelto: _vecchio, ...resto } = g
      const nuovo = nomeSceltoValido(nome)
      scrivi({ ...resto, id: i.id, cartellaProgetti: i.cartellaProgetti, ...(nuovo !== '' ? { nomeScelto: nuovo } : {}) })
      return leggi()
    }
  }
}
