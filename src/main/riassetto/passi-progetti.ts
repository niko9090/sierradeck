import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'
import { apriRegistroProgetti } from '../progetti/registro'
import { migraRegistroSuDisco } from '../progetti/migra-proprietari'
import { copieNonMie, type EsitoPulizia } from '../progetti/sposta'
import { RimandaPasso, passoDaFunzione, type Passo } from './motore'

/**
 * I passi del riassetto per il modello «un progetto, un PC» (0.88.0).
 *
 * 1. **Proprietari** (fase A, prima che si apra qualunque cosa): il registro dei
 *    progetti passa al proprietario unico, via le voci che non sono progetti,
 *    uniti i doppioni. Mai un file dei progetti toccato. Dove stava ogni
 *    progetto prima resta in `FILE_PERCORSI_DI_PRIMA`, perché il passo dopo
 *    deve sapere quali copie di questo PC non sono più sue.
 * 2. **Copie di altri PC** (fase B, a sincronia pronta): una copia di un
 *    progetto che non è di questo PC va nel recupero solo se è identica al
 *    Drive (`pulisciCopia`); le altre restano, con il perché nel riepilogo.
 */

export const FILE_PERCORSI_DI_PRIMA = 'progetti-percorsi-di-prima.json'

type Io = { id: string; cartellaProgetti: string; radici?: string[] }
type Pulisci = (p: { progetto: { id: string; nome: string }; percorso: string }) => Promise<EsitoPulizia>

export function passiDeiProgetti(d: {
  io: () => Io | undefined
  pulisci: () => Pulisci | undefined
}): Passo[] {
  // Sincrono: la fase A non aspetta (`passoDaFunzione` è asincrono).
  const proprietari: Passo = {
    id: 'proprietari', titolo: 'Un PC per ogni progetto', fase: 'A', peso: 2,
    esegui: (c) => {
      const io = d.io()
      const e = migraRegistroSuDisco({ dati: c.dati, ...(io !== undefined ? { io } : {}) })
      const file = join(c.dati, FILE_PERCORSI_DI_PRIMA)
      if (Object.keys(e.percorsiDiPrima).length > 0 && !existsSync(file)) {
        scriviJsonAtomico(file, e.percorsiDiPrima, 'riassetto')
      }
      const r = e.rapporto
      for (const s of r.senzaPc) c.proponi(`«${s.nome}» va a ${s.pcNome}, che questo PC non ha ancora visto: resta senza proprietario finché non lo scegli con «Sposta su questo PC».`)
      for (const s of r.senzaCartella) c.proponi(`«${s.nome}» è di ${s.pcNome}, ma non si sa in che cartella: aprilo da lì una volta.`)
      c.log(`[riassetto] Un PC per ogni progetto: ${r.proprietari.length} progetti con il loro PC, ${r.tolti.length} voci che non erano progetti tolte dall'elenco, ${r.uniti.length} doppioni uniti`)
    }
  }

  /**
   * 0.102.0 (Nicholas, 12/11: niente spostamenti che partono da soli): le copie
   * di qui dei progetti di altri PC **non vanno più nel recupero da sole**. Il
   * confronto era sul nome della cartella, e i PC hanno gli stessi percorsi:
   * finivano nel recupero cartelle vere di questo PC. Ora si contano e basta;
   * togliere una copia è una scelta di Nicholas (vista Progetti).
   */
  const copie = passoDaFunzione({
    id: 'copie-altri-pc', titolo: 'Copie dei progetti di altri PC', fase: 'B', peso: 3,
    fai: async (c) => {
      const io = d.io()
      if (io === undefined) throw new RimandaPasso('la sincronia con il Drive non è ancora pronta')
      const file = join(c.dati, FILE_PERCORSI_DI_PRIMA)
      let diPrima: Record<string, Record<string, string[]>> = {}
      try { diPrima = JSON.parse(readFileSync(file, 'utf8')) as typeof diPrima } catch { /* nessun percorso di prima */ }
      const lista = copieNonMie(apriRegistroProgetti(c.dati).leggi(), io, existsSync, diPrima)
      for (const x of lista) c.log(`[riassetto] copia di qui di «${x.progetto.nome}» (vive su un altro PC): ${x.percorso} — resta dov’è`)
      return `${lista.length} copie di progetti di altri PC: nessuna toccata`
    }
  })

  return [proprietari, copie]
}
