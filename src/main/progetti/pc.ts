import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { scriviAtomico } from '@shared/scrittura-atomica'

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
  nome: string
  /** Dove finiscono i progetti che arrivano dal Drive e non hanno ancora una cartella qui. */
  cartellaProgetti: string
}

export const FILE_PC = 'pc.json'

export type IdentitaPcStore = {
  leggi: () => IdentitaPc
  impostaCartellaProgetti: (percorso: string) => IdentitaPc
}

export function apriIdentitaPc(dati: string, deps: { nome: () => string; casa: () => string }): IdentitaPcStore {
  const percorso = join(dati, FILE_PC)
  const predefinita = (): string => join(deps.casa(), 'Progetti SierraDeck')

  const leggiGrezza = (): Partial<IdentitaPc> => {
    if (!existsSync(percorso)) return {}
    try {
      const j = JSON.parse(readFileSync(percorso, 'utf8')) as Record<string, unknown>
      return {
        ...(typeof j.id === 'string' && j.id !== '' ? { id: j.id } : {}),
        ...(typeof j.nome === 'string' ? { nome: j.nome } : {}),
        ...(typeof j.cartellaProgetti === 'string' && j.cartellaProgetti !== '' ? { cartellaProgetti: j.cartellaProgetti } : {})
      }
    } catch (err) {
      console.error('[progetti] pc.json illeggibile:', err)
      return {}
    }
  }
  const scrivi = (i: IdentitaPc): void => { scriviAtomico(percorso, JSON.stringify(i, null, 2), 'progetti') }

  const leggi = (): IdentitaPc => {
    const g = leggiGrezza()
    const completa: IdentitaPc = {
      id: g.id ?? randomBytes(6).toString('hex'),
      nome: g.nome ?? deps.nome(),
      cartellaProgetti: g.cartellaProgetti ?? predefinita()
    }
    // La prima volta si scrive, cosi' l'id resta quello.
    if (g.id === undefined) scrivi(completa)
    return completa
  }

  return {
    leggi,
    impostaCartellaProgetti(cartellaProgetti) {
      const i = { ...leggi(), cartellaProgetti }
      scrivi(i)
      return i
    }
  }
}
