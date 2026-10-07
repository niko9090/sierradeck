import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { scriviAtomico } from '@shared/scrittura-atomica'
import { nomeDaMostrare, nomeSceltoValido } from '@shared/nome-pc'

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

export function apriIdentitaPc(dati: string, deps: { nome: () => string; casa: () => string; documenti?: () => string }): IdentitaPcStore {
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

  const leggiGrezza = (): Partial<IdentitaPc> => {
    if (!existsSync(percorso)) return {}
    try {
      const j = JSON.parse(readFileSync(percorso, 'utf8')) as Record<string, unknown>
      return {
        ...(typeof j.id === 'string' && j.id !== '' ? { id: j.id } : {}),
        ...(typeof j.nome === 'string' ? { nome: j.nome } : {}),
        ...(typeof j.nomeScelto === 'string' && nomeSceltoValido(j.nomeScelto) !== '' ? { nomeScelto: nomeSceltoValido(j.nomeScelto) } : {}),
        ...(typeof j.cartellaProgetti === 'string' && j.cartellaProgetti !== '' ? { cartellaProgetti: j.cartellaProgetti } : {})
      }
    } catch (err) {
      console.error('[progetti] pc.json illeggibile:', err)
      return {}
    }
  }
  /**
   * Su disco `nome` resta quello di sempre (l'hostname della prima volta) e
   * il nome scelto sta a parte: una versione vecchia che rilegge il file
   * trova quello che si aspetta.
   */
  const scrivi = (g: Partial<IdentitaPc> & { id: string; cartellaProgetti: string }): void => {
    const suDisco = { id: g.id, nome: g.nome ?? deps.nome(), cartellaProgetti: g.cartellaProgetti, ...(g.nomeScelto !== undefined && g.nomeScelto !== '' ? { nomeScelto: g.nomeScelto } : {}) }
    scriviAtomico(percorso, JSON.stringify(suDisco, null, 2), 'progetti')
  }

  const leggi = (): IdentitaPc => {
    const g = leggiGrezza()
    const id = g.id ?? randomBytes(6).toString('hex')
    const cartellaProgetti = g.cartellaProgetti ?? predefinita()
    // La prima volta si scrive, cosi' l'id resta quello.
    if (g.id === undefined) scrivi({ ...g, id, cartellaProgetti })
    let host = ''
    try { host = deps.nome() } catch { host = '' }
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
