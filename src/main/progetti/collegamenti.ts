import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { scriviAtomico } from '@shared/scrittura-atomica'
import { collegamentiVuoti, parseCollegamenti, type Collegamenti } from '@shared/progetti-identita'

/**
 * I collegamenti workspace → progetto di questo PC (Gestione progetti, 13/11).
 *
 * Stanno in un file loro, non dentro `workspaces.json`: quel file lo
 * riscrivono in tanti (i salvataggi dei layout, l'unione con il Drive, i PC di
 * una versione di prima) e più d'uno ricostruisce i workspace con soli nome e
 * layout, perdendo ogni campo in più. Qui il collegamento non si perde; segue
 * il nome del workspace a ogni rinomina ed eliminazione (`dopoNome`).
 */
export const FILE_COLLEGAMENTI = 'collegamenti-progetti.json'

export type CollegamentiStore = {
  leggi: () => Collegamenti
  scrivi: (c: Collegamenti) => void
}

export function apriCollegamenti(dati: string): CollegamentiStore {
  const file = join(dati, FILE_COLLEGAMENTI)
  return {
    leggi() {
      if (!existsSync(file)) return collegamentiVuoti()
      try { return parseCollegamenti(JSON.parse(readFileSync(file, 'utf8'))) } catch { return collegamentiVuoti() }
    },
    scrivi(c) { scriviAtomico(file, JSON.stringify(c, null, 2), 'collegamenti') }
  }
}
